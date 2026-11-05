// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

import {AssetRegistry} from "./AssetRegistry.sol";
import {IAssetToken} from "./interfaces/IAssetToken.sol";

/// @title IssuanceDesk
/// @notice Primary market with maker-checker approval for every share movement it controls:
///         - Subscriptions: an investor escrows stablecoin, an approver mints shares at the NAV
///           in force at approval time (forward pricing), or rejects and refunds.
///         - Redemptions: an investor locks shares, an approver burns them and pays NAV from the
///           treasury, or rejects and unlocks.
///         - Allocations: an operator proposes a mint, a different approver signs it off.
/// @dev Holds ISSUER_ROLE on every asset token. Investors protect themselves from NAV moves with
///      `minShares` / `minPayout`.
contract IssuanceDesk is AccessControl, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant APPROVER_ROLE = keccak256("APPROVER_ROLE");

    uint256 private constant SHARE_UNIT = 1e18;

    enum Kind {
        Subscription,
        Redemption,
        Allocation
    }

    enum Status {
        Pending,
        Approved,
        Rejected,
        Cancelled
    }

    struct Request {
        Kind kind;
        Status status;
        uint64 createdAt;
        uint64 decidedAt;
        address token;
        address account; // investor who pays or receives
        address requestedBy; // maker
        address decidedBy; // checker
        uint256 amount; // stablecoin for subscriptions, shares otherwise
        uint256 limit; // minimum shares (subscription) or minimum payout (redemption)
        uint256 settled; // shares minted, or stablecoin paid out
    }

    IERC20 public immutable settlementToken;
    AssetRegistry public immutable assetRegistry;
    address public treasury;
    uint256 public requestCount;
    mapping(uint256 id => Request) private _requests;

    event RequestCreated(
        uint256 indexed id,
        Kind indexed kind,
        address indexed token,
        address account,
        address requestedBy,
        uint256 amount,
        uint256 limit
    );
    event RequestApproved(uint256 indexed id, address indexed approver, uint256 settled);
    event RequestRejected(uint256 indexed id, address indexed approver, string reason);
    event RequestCancelled(uint256 indexed id, address indexed by);
    event TreasuryUpdated(address indexed treasury);

    error ZeroAddress();
    error ZeroAmount();
    error AssetNotActive(address token);
    error NotVerified(address account);
    error UnknownRequest(uint256 id);
    error NotPending(uint256 id);
    error SelfApproval(uint256 id);
    error NotRequester(uint256 id);
    error SlippageExceeded(uint256 id, uint256 actual, uint256 limit);

    constructor(address admin, address settlementToken_, address assetRegistry_, address treasury_) {
        if (
            admin == address(0) || settlementToken_ == address(0) || assetRegistry_ == address(0)
                || treasury_ == address(0)
        ) revert ZeroAddress();
        settlementToken = IERC20(settlementToken_);
        assetRegistry = AssetRegistry(assetRegistry_);
        treasury = treasury_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ---------------------------------------------------------------------------------------
    // Makers
    // ---------------------------------------------------------------------------------------

    /// @notice Escrows `payment` stablecoin for new shares. Approve this contract first.
    function requestSubscription(address token, uint256 payment, uint256 minShares)
        external
        nonReentrant
        returns (uint256 id)
    {
        if (payment == 0) revert ZeroAmount();
        _requireActive(token);
        if (!IAssetToken(token).identityRegistry().isVerified(msg.sender)) revert NotVerified(msg.sender);
        id = _create(Kind.Subscription, token, msg.sender, payment, minShares);
        settlementToken.safeTransferFrom(msg.sender, address(this), payment);
    }

    /// @notice Locks `shares` in the caller's wallet until an approver redeems or releases them.
    function requestRedemption(address token, uint256 shares, uint256 minPayout)
        external
        nonReentrant
        returns (uint256 id)
    {
        if (shares == 0) revert ZeroAmount();
        _requireActive(token);
        id = _create(Kind.Redemption, token, msg.sender, shares, minPayout);
        IAssetToken(token).lockShares(msg.sender, shares);
    }

    /// @notice Proposes a direct share allocation (e.g. to the sponsor or a placement investor).
    function proposeAllocation(address token, address to, uint256 shares)
        external
        onlyRole(OPERATOR_ROLE)
        returns (uint256 id)
    {
        if (to == address(0)) revert ZeroAddress();
        if (shares == 0) revert ZeroAmount();
        _requireActive(token);
        id = _create(Kind.Allocation, token, to, shares, 0);
    }

    /// @notice Withdraws a pending request. Only the maker may cancel.
    function cancelRequest(uint256 id) external nonReentrant {
        Request storage r = _pending(id);
        if (r.requestedBy != msg.sender) revert NotRequester(id);
        _close(r, Status.Cancelled);
        _release(r);
        emit RequestCancelled(id, msg.sender);
    }

    // ---------------------------------------------------------------------------------------
    // Checkers
    // ---------------------------------------------------------------------------------------

    function approve(uint256 id) external onlyRole(APPROVER_ROLE) nonReentrant {
        Request storage r = _pending(id);
        if (r.requestedBy == msg.sender) revert SelfApproval(id);
        IAssetToken token = IAssetToken(r.token);
        uint256 settled;

        if (r.kind == Kind.Subscription) {
            settled = (r.amount * SHARE_UNIT) / token.navPerShare();
            if (settled == 0 || settled < r.limit) revert SlippageExceeded(id, settled, r.limit);
            _close(r, Status.Approved);
            r.settled = settled;
            token.mint(r.account, settled);
            settlementToken.safeTransfer(treasury, r.amount);
        } else if (r.kind == Kind.Redemption) {
            settled = (r.amount * token.navPerShare()) / SHARE_UNIT;
            if (settled < r.limit) revert SlippageExceeded(id, settled, r.limit);
            _close(r, Status.Approved);
            r.settled = settled;
            token.redeem(r.account, r.amount);
            // The treasury is admin-set and pre-approves this desk to fund redemptions.
            // slither-disable-next-line arbitrary-send-erc20
            settlementToken.safeTransferFrom(treasury, r.account, settled);
        } else {
            settled = r.amount;
            _close(r, Status.Approved);
            r.settled = settled;
            token.mint(r.account, settled);
        }
        emit RequestApproved(id, msg.sender, settled);
    }

    function reject(uint256 id, string calldata reason) external onlyRole(APPROVER_ROLE) nonReentrant {
        Request storage r = _pending(id);
        _close(r, Status.Rejected);
        _release(r);
        emit RequestRejected(id, msg.sender, reason);
    }

    // ---------------------------------------------------------------------------------------
    // Admin and views
    // ---------------------------------------------------------------------------------------

    function setTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newTreasury == address(0)) revert ZeroAddress();
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function getRequest(uint256 id) external view returns (Request memory) {
        if (id == 0 || id > requestCount) revert UnknownRequest(id);
        return _requests[id];
    }

    // ---------------------------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------------------------

    function _create(Kind kind, address token, address account, uint256 amount, uint256 limit)
        private
        returns (uint256 id)
    {
        id = ++requestCount;
        _requests[id] = Request({
            kind: kind,
            status: Status.Pending,
            createdAt: uint64(block.timestamp),
            decidedAt: 0,
            token: token,
            account: account,
            requestedBy: msg.sender,
            decidedBy: address(0),
            amount: amount,
            limit: limit,
            settled: 0
        });
        emit RequestCreated(id, kind, token, account, msg.sender, amount, limit);
    }

    function _pending(uint256 id) private view returns (Request storage r) {
        if (id == 0 || id > requestCount) revert UnknownRequest(id);
        r = _requests[id];
        if (r.status != Status.Pending) revert NotPending(id);
    }

    function _close(Request storage r, Status status) private {
        r.status = status;
        r.decidedAt = uint64(block.timestamp);
        r.decidedBy = msg.sender;
    }

    /// @dev Returns escrowed stablecoin or releases locked shares. A forced transfer may already
    ///      have released some locked shares, so only what is still locked is released.
    function _release(Request storage r) private {
        if (r.kind == Kind.Subscription) {
            settlementToken.safeTransfer(r.account, r.amount);
        } else if (r.kind == Kind.Redemption) {
            IAssetToken token = IAssetToken(r.token);
            uint256 locked = token.lockedBalance(r.account);
            uint256 release = r.amount < locked ? r.amount : locked;
            if (release != 0) token.unlockShares(r.account, release);
        }
    }

    function _requireActive(address token) private view {
        if (!assetRegistry.isActiveToken(token)) revert AssetNotActive(token);
    }
}
