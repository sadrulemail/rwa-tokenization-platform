// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IIdentityRegistry
/// @notice Investor whitelist shared by every asset token on the platform.
/// @dev Only eligibility data lives on-chain. Names, e-mails and documents stay off-chain, encrypted.
interface IIdentityRegistry {
    /// @dev Packed into one storage slot.
    struct Investor {
        bool registered;
        uint16 country; // ISO 3166-1 numeric code, e.g. 826 = United Kingdom
        uint8 tier; // 1 = retail, 2 = professional, 3 = institutional
        uint64 expiresAt; // end of KYC validity, unix seconds
    }

    event InvestorRegistered(address indexed wallet, uint16 country, uint8 tier, uint64 expiresAt);
    event InvestorUpdated(address indexed wallet, uint16 country, uint8 tier, uint64 expiresAt);
    event InvestorRevoked(address indexed wallet);

    error ZeroAddress();
    error AlreadyRegistered(address wallet);
    error NotRegistered(address wallet);
    error InvalidCountry(uint16 country);
    error InvalidTier(uint8 tier);
    error InvalidExpiry(uint64 expiresAt);

    function registerInvestor(address wallet, uint16 country, uint8 tier, uint64 expiresAt) external;

    function updateInvestor(address wallet, uint16 country, uint8 tier, uint64 expiresAt) external;

    function revokeInvestor(address wallet) external;

    /// @return True when the wallet is registered and its KYC has not expired.
    function isVerified(address wallet) external view returns (bool);

    function investorOf(address wallet) external view returns (Investor memory);
}
