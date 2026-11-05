// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title TransferCode
/// @notice Reason codes returned by `AssetToken.transferStatus` and carried by `TransferRejected`.
/// @dev Front ends map these to messages, so an investor sees why a transfer would fail before signing.
library TransferCode {
    uint8 internal constant OK = 0;
    uint8 internal constant PAUSED = 1;
    uint8 internal constant SENDER_FROZEN = 2;
    uint8 internal constant RECEIVER_FROZEN = 3;
    uint8 internal constant SENDER_NOT_VERIFIED = 4;
    uint8 internal constant RECEIVER_NOT_VERIFIED = 5;
    uint8 internal constant INSUFFICIENT_BALANCE = 6;
    uint8 internal constant LOCKED_BALANCE = 7;
    uint8 internal constant LOCKUP_ACTIVE = 8;
    uint8 internal constant TIER_TOO_LOW = 9;
    uint8 internal constant COUNTRY_BLOCKED = 10;
    uint8 internal constant HOLDER_LIMIT = 11;
    uint8 internal constant BALANCE_LIMIT = 12;
    uint8 internal constant SUPPLY_CAP = 13;
}
