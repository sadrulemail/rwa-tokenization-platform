// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IAssetCompliance
/// @notice Offering rules checked on every mint and investor-to-investor transfer of one asset token.
interface IAssetCompliance {
    struct Rules {
        uint8 minTier; // lowest investor tier allowed to hold the asset
        uint32 maxHolders; // 0 = no limit
        uint64 lockupUntil; // secondary transfers are blocked before this time
        uint256 maxBalance; // per-investor cap in share units, 0 = no limit
    }

    event RulesUpdated(Rules rules);
    event CountryRestrictionUpdated(uint16 indexed country, bool blocked);

    error ZeroAddress();
    error InvalidTier(uint8 tier);

    /// @return code A TransferCode value; TransferCode.OK when the rules allow the movement.
    function checkTransfer(address from, address to, uint256 amount) external view returns (uint8 code);

    function rules() external view returns (Rules memory);

    function isCountryBlocked(uint16 country) external view returns (bool);
}
