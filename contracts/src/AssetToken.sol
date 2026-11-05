// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {
    AccessControlUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

import {IAssetCompliance} from "./interfaces/IAssetCompliance.sol";
import {IAssetToken} from "./interfaces/IAssetToken.sol";
import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";
import {TransferCode} from "./libraries/TransferCode.sol";

/// @title AssetToken
/// @notice Fractional ownership shares of one real-world asset, with ERC-3643 style controls:
///         verified holders only, compliance rules, wallet freeze, partial share locks, forced
///         transfer and lost-wallet recovery. Also carries the asset's NAV and distributes income
///         (rent, coupons, dividends) to holders in the settlement stablecoin.
/// @dev Deployed as an EIP-1167 clone per asset. Clones are not upgradeable; the compliance module
///      and identity registry are swappable references instead.
///
///      Income uses a pull model: each deposit raises `incomePerShare`, and every balance change
///      first books what the account earned at its old balance. Gas per deposit is constant,
///      whatever the number of holders, and shares bought after a deposit earn nothing from it.
contract AssetToken is
    ERC20Upgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardTransient,
    IAssetToken
{
    using SafeERC20 for IERC20;

    /// @notice Transfer agent: pause, freeze, forced transfer and wallet recovery.
    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");
    /// @notice Mints, redeems and locks shares. Held by the IssuanceDesk.
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    /// @notice Publishes NAV updates.
    bytes32 public constant VALUATOR_ROLE = keccak256("VALUATOR_ROLE");
    /// @notice Deposits income for distribution.
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");

    uint256 private constant PRECISION = 1e36;

    struct InitParams {
        string name;
        string symbol;
        uint256 assetId;
        address assetRegistry;
        address identityRegistry;
        address compliance;
        address settlementToken;
        uint256 maxSupply;
        uint256 navPerShare;
        uint256 assetValue;
        bytes32 valuationReportHash;
        address admin;
        address agent;
        address issuer;
        address valuator;
        address distributor;
    }

    // Asset links
    uint256 public assetId;
    address public assetRegistry;
    IIdentityRegistry public identityRegistry;
    IAssetCompliance public compliance;
    IERC20 public settlementToken;

    // Supply and holders
    uint256 public maxSupply;
    uint256 public holderCount;
    mapping(address account => bool) public isFrozen;
    mapping(address holder => uint256) public lockedBalance;

    // Valuation, in settlement-token units
    uint256 public navPerShare; // price of one whole share (1e18 units)
    uint256 public assetValue;
    uint64 public valuationTimestamp;
    bytes32 public valuationReportHash;

    // Income distribution
    uint256 public incomePerShare; // cumulative, scaled by PRECISION per share unit
    uint256 public totalIncomeDeposited;
    uint256 public totalIncomeClaimed;
    uint256 public distributionCount;
    mapping(address account => uint256) private _incomePerSharePaid;
    mapping(address account => uint256) private _incomeOwed;

    bool private _privileged;

    event ValuationUpdated(
        uint256 navPerShare, uint256 assetValue, bytes32 indexed reportHash, uint64 timestamp
    );
    event IncomeDeposited(
        uint256 indexed distributionId, uint256 amount, uint256 totalSupply, bytes32 statementHash
    );
    event IncomeClaimed(address indexed account, uint256 amount);
    event AddressFrozen(address indexed account, bool frozen, address indexed agent);
    event SharesLocked(address indexed holder, uint256 amount, uint256 totalLocked);
    event SharesUnlocked(address indexed holder, uint256 amount, uint256 totalLocked);
    event ForcedTransfer(address indexed from, address indexed to, uint256 amount, address indexed agent);
    event WalletRecovered(
        address indexed lostWallet, address indexed newWallet, uint256 amount, address indexed agent
    );
    event ComplianceUpdated(address indexed compliance);
    event IdentityRegistryUpdated(address indexed identityRegistry);
    event MaxSupplyUpdated(uint256 maxSupply);

    error TransferRejected(uint8 code);
    error ZeroAddress();
    error ZeroAmount();
    error InvalidValuation();
    error NoShareholders();
    error NothingToClaim();
    error AccountFrozen(address account);
    error NotVerified(address account);
    error InsufficientUnlocked(address holder, uint256 available, uint256 requested);
    error InsufficientLocked(address holder, uint256 locked, uint256 requested);
    error SameWallet();
    error MaxSupplyBelowSupply();

    constructor() {
        _disableInitializers();
    }

    function initialize(InitParams calldata p) external initializer {
        if (
            p.admin == address(0) || p.identityRegistry == address(0) || p.compliance == address(0)
                || p.settlementToken == address(0)
        ) revert ZeroAddress();
        if (p.maxSupply == 0) revert ZeroAmount();
        if (p.navPerShare == 0) revert InvalidValuation();

        __ERC20_init(p.name, p.symbol);
        __AccessControl_init();
        __Pausable_init();

        assetId = p.assetId;
        assetRegistry = p.assetRegistry;
        identityRegistry = IIdentityRegistry(p.identityRegistry);
        compliance = IAssetCompliance(p.compliance);
        settlementToken = IERC20(p.settlementToken);
        maxSupply = p.maxSupply;

        _grantRole(DEFAULT_ADMIN_ROLE, p.admin);
        _grantIfSet(AGENT_ROLE, p.agent);
        _grantIfSet(ISSUER_ROLE, p.issuer);
        _grantIfSet(VALUATOR_ROLE, p.valuator);
        _grantIfSet(DISTRIBUTOR_ROLE, p.distributor);

        _setValuation(p.navPerShare, p.assetValue, p.valuationReportHash);
    }

    // ---------------------------------------------------------------------------------------
    // Transfer checks
    // ---------------------------------------------------------------------------------------

    /// @notice Pre-flight check for a mint (`from` = 0), burn (`to` = 0) or transfer.
    /// @return A TransferCode value. Anything but OK means the movement would revert.
    function transferStatus(address from, address to, uint256 amount) external view returns (uint8) {
        return _transferStatus(from, to, amount);
    }

    /// @notice Shares the holder can transfer or lock: balance minus shares locked for redemption.
    function freeBalanceOf(address holder) public view returns (uint256) {
        return balanceOf(holder) - lockedBalance[holder];
    }

    function _transferStatus(address from, address to, uint256 amount) internal view returns (uint8) {
        if (paused()) return TransferCode.PAUSED;
        if (to == address(0)) return TransferCode.OK; // burns: issuer-only and lock-aware
        if (from == address(0)) {
            if (totalSupply() + amount > maxSupply) return TransferCode.SUPPLY_CAP;
        } else {
            if (isFrozen[from]) return TransferCode.SENDER_FROZEN;
            if (!identityRegistry.isVerified(from)) return TransferCode.SENDER_NOT_VERIFIED;
            uint256 balance = balanceOf(from);
            if (amount > balance) return TransferCode.INSUFFICIENT_BALANCE;
            if (amount > balance - lockedBalance[from]) return TransferCode.LOCKED_BALANCE;
        }
        if (isFrozen[to]) return TransferCode.RECEIVER_FROZEN;
        if (!identityRegistry.isVerified(to)) return TransferCode.RECEIVER_NOT_VERIFIED;
        return compliance.checkTransfer(from, to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (!_privileged) {
            uint8 code = _transferStatus(from, to, value);
            if (code != TransferCode.OK) revert TransferRejected(code);
        }
        // Book income earned at the old balances before they change.
        _accrue(from);
        _accrue(to);

        uint256 fromBefore = from == address(0) ? 0 : balanceOf(from);
        uint256 toBefore = to == address(0) ? 0 : balanceOf(to);
        super._update(from, to, value);

        if (value != 0 && from != to) {
            if (to != address(0) && toBefore == 0) holderCount += 1;
            if (from != address(0) && fromBefore == value) holderCount -= 1;
        }
    }

    // ---------------------------------------------------------------------------------------
    // Issuer: primary issuance and redemption (IssuanceDesk)
    // ---------------------------------------------------------------------------------------

    function mint(address to, uint256 amount) external onlyRole(ISSUER_ROLE) {
        if (amount == 0) revert ZeroAmount();
        _mint(to, amount);
    }

    /// @notice Burns shares that were locked for a redemption request.
    function redeem(address holder, uint256 amount) external onlyRole(ISSUER_ROLE) {
        if (amount == 0) revert ZeroAmount();
        uint256 locked = lockedBalance[holder];
        if (amount > locked) revert InsufficientLocked(holder, locked, amount);
        lockedBalance[holder] = locked - amount;
        emit SharesUnlocked(holder, amount, locked - amount);
        _burn(holder, amount);
    }

    /// @notice Locks shares in the holder's wallet while a redemption request is pending.
    /// @dev The holder keeps earning income on locked shares until they are redeemed.
    function lockShares(address holder, uint256 amount) external onlyRole(ISSUER_ROLE) {
        if (amount == 0) revert ZeroAmount();
        uint256 free = freeBalanceOf(holder);
        if (amount > free) revert InsufficientUnlocked(holder, free, amount);
        lockedBalance[holder] += amount;
        emit SharesLocked(holder, amount, lockedBalance[holder]);
    }

    function unlockShares(address holder, uint256 amount) external onlyRole(ISSUER_ROLE) {
        uint256 locked = lockedBalance[holder];
        if (amount > locked) revert InsufficientLocked(holder, locked, amount);
        lockedBalance[holder] = locked - amount;
        emit SharesUnlocked(holder, amount, locked - amount);
    }

    // ---------------------------------------------------------------------------------------
    // Valuation
    // ---------------------------------------------------------------------------------------

    /// @param newNavPerShare Price of one whole share in settlement-token units.
    /// @param newAssetValue Appraised value of the whole asset in settlement-token units.
    /// @param reportHash Hash of the valuation report kept off-chain.
    function updateValuation(uint256 newNavPerShare, uint256 newAssetValue, bytes32 reportHash)
        external
        onlyRole(VALUATOR_ROLE)
    {
        if (newNavPerShare == 0) revert InvalidValuation();
        _setValuation(newNavPerShare, newAssetValue, reportHash);
    }

    function _setValuation(uint256 newNavPerShare, uint256 newAssetValue, bytes32 reportHash) private {
        navPerShare = newNavPerShare;
        assetValue = newAssetValue;
        valuationReportHash = reportHash;
        valuationTimestamp = uint64(block.timestamp);
        emit ValuationUpdated(newNavPerShare, newAssetValue, reportHash, uint64(block.timestamp));
    }

    // ---------------------------------------------------------------------------------------
    // Income distribution
    // ---------------------------------------------------------------------------------------

    /// @notice Deposits rent, coupon or dividend income for all current holders, pro rata.
    /// @param statementHash Hash of the period income statement kept off-chain.
    function depositIncome(uint256 amount, bytes32 statementHash)
        external
        onlyRole(DISTRIBUTOR_ROLE)
        nonReentrant
    {
        if (amount == 0) revert ZeroAmount();
        uint256 supply = totalSupply();
        if (supply == 0) revert NoShareholders();
        settlementToken.safeTransferFrom(msg.sender, address(this), amount);
        incomePerShare += (amount * PRECISION) / supply;
        totalIncomeDeposited += amount;
        uint256 distributionId = ++distributionCount;
        emit IncomeDeposited(distributionId, amount, supply, statementHash);
    }

    function claimIncome() external nonReentrant whenNotPaused returns (uint256 amount) {
        if (isFrozen[msg.sender]) revert AccountFrozen(msg.sender);
        _accrue(msg.sender);
        amount = _incomeOwed[msg.sender];
        if (amount == 0) revert NothingToClaim();
        _incomeOwed[msg.sender] = 0;
        totalIncomeClaimed += amount;
        settlementToken.safeTransfer(msg.sender, amount);
        emit IncomeClaimed(msg.sender, amount);
    }

    function claimableIncome(address account) external view returns (uint256) {
        return _incomeOwed[account] + _pendingIncome(account);
    }

    function _pendingIncome(address account) private view returns (uint256) {
        return (balanceOf(account) * (incomePerShare - _incomePerSharePaid[account])) / PRECISION;
    }

    function _accrue(address account) private {
        if (account == address(0)) return;
        uint256 pending = _pendingIncome(account);
        if (pending != 0) _incomeOwed[account] += pending;
        _incomePerSharePaid[account] = incomePerShare;
    }

    // ---------------------------------------------------------------------------------------
    // Agent controls
    // ---------------------------------------------------------------------------------------

    function setFrozen(address account, bool frozen) external onlyRole(AGENT_ROLE) {
        if (account == address(0)) revert ZeroAddress();
        isFrozen[account] = frozen;
        emit AddressFrozen(account, frozen, msg.sender);
    }

    /// @notice Moves shares without the holder's signature, e.g. on a court order or estate
    ///         settlement. Skips compliance rules but the receiver must be verified. Locked shares
    ///         are released as needed.
    function forcedTransfer(address from, address to, uint256 amount) external onlyRole(AGENT_ROLE) {
        if (from == address(0) || to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (!identityRegistry.isVerified(to)) revert NotVerified(to);
        uint256 balance = balanceOf(from);
        if (amount > balance) revert ERC20InsufficientBalance(from, balance, amount);
        uint256 free = balance - lockedBalance[from];
        if (amount > free) {
            uint256 release = amount - free;
            lockedBalance[from] -= release;
            emit SharesUnlocked(from, release, lockedBalance[from]);
        }
        _privilegedTransfer(from, to, amount);
        emit ForcedTransfer(from, to, amount, msg.sender);
    }

    /// @notice Moves everything a lost wallet holds (shares, locks, unclaimed income, freeze
    ///         status) to the investor's new verified wallet.
    function recoverWallet(address lostWallet, address newWallet) external onlyRole(AGENT_ROLE) {
        if (lostWallet == address(0) || newWallet == address(0)) revert ZeroAddress();
        if (lostWallet == newWallet) revert SameWallet();
        if (!identityRegistry.isVerified(newWallet)) revert NotVerified(newWallet);

        _accrue(lostWallet);
        _accrue(newWallet);
        _incomeOwed[newWallet] += _incomeOwed[lostWallet];
        _incomeOwed[lostWallet] = 0;

        uint256 locked = lockedBalance[lostWallet];
        if (locked != 0) {
            lockedBalance[lostWallet] = 0;
            lockedBalance[newWallet] += locked;
        }
        if (isFrozen[lostWallet]) {
            isFrozen[newWallet] = true;
            emit AddressFrozen(newWallet, true, msg.sender);
        }

        uint256 amount = balanceOf(lostWallet);
        _privilegedTransfer(lostWallet, newWallet, amount);
        emit WalletRecovered(lostWallet, newWallet, amount, msg.sender);
    }

    function pause() external onlyRole(AGENT_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(AGENT_ROLE) {
        _unpause();
    }

    function _privilegedTransfer(address from, address to, uint256 amount) private {
        _privileged = true;
        _transfer(from, to, amount);
        _privileged = false;
    }

    // ---------------------------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------------------------

    function setCompliance(address newCompliance) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newCompliance == address(0)) revert ZeroAddress();
        compliance = IAssetCompliance(newCompliance);
        emit ComplianceUpdated(newCompliance);
    }

    function setIdentityRegistry(address newRegistry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newRegistry == address(0)) revert ZeroAddress();
        identityRegistry = IIdentityRegistry(newRegistry);
        emit IdentityRegistryUpdated(newRegistry);
    }

    function setMaxSupply(uint256 newMaxSupply) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newMaxSupply < totalSupply()) revert MaxSupplyBelowSupply();
        maxSupply = newMaxSupply;
        emit MaxSupplyUpdated(newMaxSupply);
    }

    function _grantIfSet(bytes32 role, address account) private {
        if (account != address(0)) _grantRole(role, account);
    }
}
