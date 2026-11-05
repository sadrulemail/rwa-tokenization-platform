// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {
    AccessControlUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IAssetCompliance} from "./interfaces/IAssetCompliance.sol";
import {IAssetToken} from "./interfaces/IAssetToken.sol";
import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";
import {TransferCode} from "./libraries/TransferCode.sol";

/// @title AssetCompliance
/// @notice Offering rules for one asset token: investor tier, blocked countries, holder count,
///         per-investor cap and a lock-up on secondary transfers.
/// @dev Deployed as an EIP-1167 clone per asset by AssetFactory. The token can point to a new
///      compliance module later, so rules can evolve without upgrading the token.
contract AssetCompliance is AccessControlUpgradeable, IAssetCompliance {
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");
    uint8 public constant MAX_TIER = 3;

    address public token;
    IIdentityRegistry public identityRegistry;

    Rules private _rules;
    mapping(uint16 country => bool) public isCountryBlocked;

    constructor() {
        _disableInitializers();
    }

    function initialize(
        address admin,
        address complianceOfficer,
        address token_,
        address identityRegistry_,
        Rules calldata rules_,
        uint16[] calldata blockedCountries
    ) external initializer {
        if (admin == address(0) || token_ == address(0) || identityRegistry_ == address(0)) {
            revert ZeroAddress();
        }
        __AccessControl_init();
        token = token_;
        identityRegistry = IIdentityRegistry(identityRegistry_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        if (complianceOfficer != address(0)) _grantRole(COMPLIANCE_ROLE, complianceOfficer);
        _setRules(rules_);
        for (uint256 i = 0; i < blockedCountries.length; ++i) {
            isCountryBlocked[blockedCountries[i]] = true;
            emit CountryRestrictionUpdated(blockedCountries[i], true);
        }
    }

    function setRules(Rules calldata rules_) external onlyRole(COMPLIANCE_ROLE) {
        _setRules(rules_);
    }

    function setCountryBlocked(uint16 country, bool blocked) external onlyRole(COMPLIANCE_ROLE) {
        isCountryBlocked[country] = blocked;
        emit CountryRestrictionUpdated(country, blocked);
    }

    function rules() external view returns (Rules memory) {
        return _rules;
    }

    /// @inheritdoc IAssetCompliance
    /// @dev Called by the token before balances change. Burns are always allowed here; the token
    ///      itself controls who may burn.
    function checkTransfer(address from, address to, uint256 amount) external view returns (uint8) {
        if (to == address(0)) return TransferCode.OK;
        bool isMint = from == address(0);
        if (!isMint && block.timestamp < _rules.lockupUntil) return TransferCode.LOCKUP_ACTIVE;

        IIdentityRegistry.Investor memory investor = identityRegistry.investorOf(to);
        if (investor.tier < _rules.minTier) return TransferCode.TIER_TOO_LOW;
        if (isCountryBlocked[investor.country]) return TransferCode.COUNTRY_BLOCKED;

        uint256 toBalance = IERC20(token).balanceOf(to);
        if (_rules.maxBalance != 0 && toBalance + amount > _rules.maxBalance) {
            return TransferCode.BALANCE_LIMIT;
        }
        // Exact balance checks are intended: they detect a new holder and a full exit.
        // slither-disable-next-line incorrect-equality
        if (_rules.maxHolders != 0 && toBalance == 0 && amount != 0) {
            // A full exit by the sender frees a slot, so the holder count does not grow.
            // slither-disable-next-line incorrect-equality
            bool senderExits = !isMint && IERC20(token).balanceOf(from) == amount;
            if (!senderExits && IAssetToken(token).holderCount() >= _rules.maxHolders) {
                return TransferCode.HOLDER_LIMIT;
            }
        }
        return TransferCode.OK;
    }

    function _setRules(Rules calldata rules_) private {
        if (rules_.minTier > MAX_TIER) revert InvalidTier(rules_.minTier);
        _rules = rules_;
        emit RulesUpdated(rules_);
    }
}
