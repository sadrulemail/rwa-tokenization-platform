// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {AssetCompliance} from "../src/AssetCompliance.sol";
import {AssetFactory} from "../src/AssetFactory.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {AssetToken} from "../src/AssetToken.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";
import {IssuanceDesk} from "../src/IssuanceDesk.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {IAssetCompliance} from "../src/interfaces/IAssetCompliance.sol";

/// @dev Deploys the whole platform the same way script/Deploy.s.sol does and lists one asset.
abstract contract BaseTest is Test {
    uint16 internal constant GB = 826;
    uint16 internal constant US = 840;
    uint16 internal constant SG = 702;
    uint16 internal constant DE = 276;

    uint256 internal constant NAV = 10e6; // 10.00 USDC per share
    uint256 internal constant MAX_SUPPLY = 1_000_000e18;
    uint64 internal constant START = 1_750_000_000;

    address internal admin = makeAddr("admin");
    address internal officer = makeAddr("officer"); // agent, approver, compliance officer
    address internal operator = makeAddr("operator"); // asset manager and allocation maker
    address internal valuator = makeAddr("valuator");
    address internal treasury = makeAddr("treasury"); // distributor and custodian
    address internal registrar = makeAddr("registrar"); // off-chain KYC service

    address internal alice = makeAddr("alice"); // GB, professional
    address internal bob = makeAddr("bob"); // US, professional
    address internal carol = makeAddr("carol"); // SG, institutional
    address internal dave = makeAddr("dave"); // DE, retail
    address internal eve = makeAddr("eve"); // never verified

    MockUSDC internal usdc;
    IdentityRegistry internal identity;
    AssetRegistry internal registry;
    IssuanceDesk internal desk;
    AssetFactory internal factory;

    AssetToken internal token;
    AssetCompliance internal compliance;
    uint256 internal assetId;

    function setUp() public virtual {
        vm.warp(START);
        vm.startPrank(admin);
        usdc = new MockUSDC(admin);
        identity = new IdentityRegistry(admin);
        registry = new AssetRegistry(admin);
        desk = new IssuanceDesk(admin, address(usdc), address(registry), treasury);
        factory = new AssetFactory(
            admin,
            address(new AssetToken()),
            address(new AssetCompliance()),
            address(registry),
            address(identity),
            address(usdc),
            AssetFactory.Operators({
                admin: admin,
                agent: officer,
                issuer: address(desk),
                valuator: valuator,
                distributor: treasury,
                complianceOfficer: officer,
                custodian: treasury
            })
        );
        identity.grantRole(identity.REGISTRAR_ROLE(), registrar);
        registry.grantRole(registry.REGISTRAR_ROLE(), address(factory));
        registry.grantRole(registry.RECORDS_ROLE(), operator);
        factory.grantRole(factory.ASSET_MANAGER_ROLE(), operator);
        desk.grantRole(desk.OPERATOR_ROLE(), operator);
        desk.grantRole(desk.APPROVER_ROLE(), officer);
        vm.stopPrank();

        (token, compliance, assetId) = _createAsset(_openRules(), new uint16[](0));

        _register(alice, GB, 2);
        _register(bob, US, 2);
        _register(carol, SG, 3);
        _register(dave, DE, 1);

        address[5] memory funded = [alice, bob, carol, dave, eve];
        vm.startPrank(admin);
        for (uint256 i = 0; i < funded.length; ++i) {
            usdc.mint(funded[i], 1_000_000e6);
        }
        usdc.mint(treasury, 10_000_000e6);
        vm.stopPrank();

        vm.startPrank(treasury);
        usdc.approve(address(desk), type(uint256).max);
        usdc.approve(address(token), type(uint256).max);
        vm.stopPrank();
    }

    function _openRules() internal pure returns (IAssetCompliance.Rules memory) {
        return IAssetCompliance.Rules({minTier: 1, maxHolders: 0, lockupUntil: 0, maxBalance: 0});
    }

    function _assetParams(IAssetCompliance.Rules memory rules, uint16[] memory blocked)
        internal
        pure
        returns (AssetFactory.AssetParams memory)
    {
        return AssetFactory.AssetParams({
            name: "Harbourview Residences",
            symbol: "HBVR",
            assetClass: AssetRegistry.AssetClass.RealEstate,
            jurisdiction: "GB",
            metadataURI: "https://api.example.org/metadata/1",
            documentHash: keccak256("title deed + SPV agreement"),
            maxSupply: MAX_SUPPLY,
            navPerShare: NAV,
            assetValue: 10_000_000e6,
            valuationReportHash: keccak256("valuation report Q1"),
            rules: rules,
            blockedCountries: blocked
        });
    }

    function _createAsset(IAssetCompliance.Rules memory rules, uint16[] memory blocked)
        internal
        returns (AssetToken t, AssetCompliance c, uint256 id)
    {
        vm.prank(operator);
        (address tokenAddr, address complianceAddr, uint256 newId) =
            factory.createAsset(_assetParams(rules, blocked));
        return (AssetToken(tokenAddr), AssetCompliance(complianceAddr), newId);
    }

    function _register(address wallet, uint16 country, uint8 tier) internal {
        vm.prank(registrar);
        identity.registerInvestor(wallet, country, tier, uint64(block.timestamp + 365 days));
    }

    /// @dev Maker-checker allocation: operator proposes, officer approves.
    function _allocate(AssetToken t, address to, uint256 shares) internal {
        vm.prank(operator);
        uint256 id = desk.proposeAllocation(address(t), to, shares);
        vm.prank(officer);
        desk.approve(id);
    }

    function _allocate(address to, uint256 shares) internal {
        _allocate(token, to, shares);
    }

    function _setRules(IAssetCompliance.Rules memory rules) internal {
        vm.prank(officer);
        compliance.setRules(rules);
    }

    function _deposit(uint256 amount) internal {
        vm.prank(treasury);
        token.depositIncome(amount, keccak256(abi.encode("statement", amount)));
    }
}
