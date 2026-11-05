// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IIdentityRegistry} from "./IIdentityRegistry.sol";

/// @title IAssetToken
/// @notice Issuer-facing surface of a share token, used by the issuance desk and compliance module.
interface IAssetToken {
    function identityRegistry() external view returns (IIdentityRegistry);

    function navPerShare() external view returns (uint256);

    function holderCount() external view returns (uint256);

    function lockedBalance(address holder) external view returns (uint256);

    function mint(address to, uint256 amount) external;

    function redeem(address holder, uint256 amount) external;

    function lockShares(address holder, uint256 amount) external;

    function unlockShares(address holder, uint256 amount) external;
}
