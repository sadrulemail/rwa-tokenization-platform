// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";

/// @title IdentityRegistry
/// @notice Whitelist of KYC-approved wallets. The off-chain compliance service writes here after review.
contract IdentityRegistry is AccessControl, IIdentityRegistry {
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");
    uint8 public constant MAX_TIER = 3;

    mapping(address wallet => Investor) private _investors;
    uint256 public investorCount;

    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function registerInvestor(address wallet, uint16 country, uint8 tier, uint64 expiresAt)
        external
        onlyRole(REGISTRAR_ROLE)
    {
        if (wallet == address(0)) revert ZeroAddress();
        if (_investors[wallet].registered) revert AlreadyRegistered(wallet);
        _validate(country, tier, expiresAt);
        _investors[wallet] = Investor({registered: true, country: country, tier: tier, expiresAt: expiresAt});
        investorCount += 1;
        emit InvestorRegistered(wallet, country, tier, expiresAt);
    }

    function updateInvestor(address wallet, uint16 country, uint8 tier, uint64 expiresAt)
        external
        onlyRole(REGISTRAR_ROLE)
    {
        if (!_investors[wallet].registered) revert NotRegistered(wallet);
        _validate(country, tier, expiresAt);
        _investors[wallet] = Investor({registered: true, country: country, tier: tier, expiresAt: expiresAt});
        emit InvestorUpdated(wallet, country, tier, expiresAt);
    }

    function revokeInvestor(address wallet) external onlyRole(REGISTRAR_ROLE) {
        if (!_investors[wallet].registered) revert NotRegistered(wallet);
        delete _investors[wallet];
        investorCount -= 1;
        emit InvestorRevoked(wallet);
    }

    function isVerified(address wallet) external view returns (bool) {
        Investor storage investor = _investors[wallet];
        return investor.registered && investor.expiresAt > block.timestamp;
    }

    function investorOf(address wallet) external view returns (Investor memory) {
        return _investors[wallet];
    }

    function _validate(uint16 country, uint8 tier, uint64 expiresAt) private view {
        if (country == 0 || country > 999) revert InvalidCountry(country);
        if (tier == 0 || tier > MAX_TIER) revert InvalidTier(tier);
        if (expiresAt <= block.timestamp) revert InvalidExpiry(expiresAt);
    }
}
