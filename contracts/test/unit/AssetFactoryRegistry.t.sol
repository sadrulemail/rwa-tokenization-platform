// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {AssetCompliance} from "../../src/AssetCompliance.sol";
import {AssetFactory} from "../../src/AssetFactory.sol";
import {AssetRegistry} from "../../src/AssetRegistry.sol";
import {AssetToken} from "../../src/AssetToken.sol";
import {IAssetCompliance} from "../../src/interfaces/IAssetCompliance.sol";
import {BaseTest} from "../Base.t.sol";

contract AssetFactoryRegistryTest is BaseTest {
    function test_CreateAssetWiresTokenComplianceAndDeed() public view {
        assertEq(token.name(), "Harbourview Residences");
        assertEq(token.symbol(), "HBVR");
        assertEq(token.decimals(), 18);
        assertEq(token.assetId(), assetId);
        assertEq(token.assetRegistry(), address(registry));
        assertEq(address(token.compliance()), address(compliance));
        assertEq(address(token.identityRegistry()), address(identity));
        assertEq(address(token.settlementToken()), address(usdc));
        assertEq(token.maxSupply(), MAX_SUPPLY);
        assertEq(token.navPerShare(), NAV);

        assertTrue(token.hasRole(token.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(token.hasRole(token.AGENT_ROLE(), officer));
        assertTrue(token.hasRole(token.ISSUER_ROLE(), address(desk)));
        assertTrue(token.hasRole(token.VALUATOR_ROLE(), valuator));
        assertTrue(token.hasRole(token.DISTRIBUTOR_ROLE(), treasury));
        assertTrue(compliance.hasRole(compliance.COMPLIANCE_ROLE(), officer));
        assertEq(compliance.token(), address(token));

        assertEq(registry.ownerOf(assetId), treasury);
        assertEq(registry.assetIdOf(address(token)), assetId);
        assertEq(registry.tokenURI(assetId), "https://api.example.org/metadata/1");
        AssetRegistry.AssetRecord memory record = registry.assetOf(assetId);
        assertEq(uint8(record.assetClass), uint8(AssetRegistry.AssetClass.RealEstate));
        assertEq(uint8(record.status), uint8(AssetRegistry.AssetStatus.Active));
        assertEq(record.shareToken, address(token));
        assertTrue(registry.isActiveToken(address(token)));

        assertEq(factory.assetCount(), 1);
        assertEq(factory.assetAt(0), address(token));
    }

    function test_CreateAssetWithBlockedCountries() public {
        uint16[] memory blocked = new uint16[](2);
        blocked[0] = US;
        blocked[1] = 408;
        (, AssetCompliance c, uint256 id) = _createAsset(
            IAssetCompliance.Rules({
                minTier: 2, maxHolders: 99, lockupUntil: START + 180 days, maxBalance: 0
            }),
            blocked
        );
        assertTrue(c.isCountryBlocked(US));
        assertTrue(c.isCountryBlocked(408));
        assertFalse(c.isCountryBlocked(GB));
        assertEq(c.rules().maxHolders, 99);
        assertEq(id, 2);
        assertEq(factory.allAssets().length, 2);
    }

    function test_RevertWhen_NotAssetManager() public {
        AssetFactory.AssetParams memory p = _assetParams(_openRules(), new uint16[](0));
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, factory.ASSET_MANAGER_ROLE()
            )
        );
        vm.prank(alice);
        factory.createAsset(p);
    }

    function test_DeedCannotBeTraded() public {
        vm.expectRevert(AssetRegistry.DeedTransferRestricted.selector);
        vm.prank(treasury);
        registry.transferFrom(treasury, alice, assetId);
    }

    function test_AdminMovesCustody() public {
        address trustee = makeAddr("trustee");
        vm.prank(admin);
        registry.transferCustody(assetId, trustee);
        assertEq(registry.ownerOf(assetId), trustee);
    }

    function test_RecordsRoleUpdatesStatusAndDocuments() public {
        vm.startPrank(operator);
        registry.updateDocuments(assetId, "ipfs://bafy-new", keccak256("amended SPV agreement"));
        registry.setStatus(assetId, AssetRegistry.AssetStatus.Retired);
        vm.stopPrank();
        AssetRegistry.AssetRecord memory record = registry.assetOf(assetId);
        assertEq(record.metadataURI, "ipfs://bafy-new");
        assertEq(record.documentHash, keccak256("amended SPV agreement"));
        assertEq(uint8(record.status), uint8(AssetRegistry.AssetStatus.Retired));
        assertFalse(registry.isActiveToken(address(token)));

        vm.expectRevert(abi.encodeWithSelector(AssetRegistry.UnknownAsset.selector, 42));
        vm.prank(operator);
        registry.setStatus(42, AssetRegistry.AssetStatus.Active);
    }

    function test_SupportsErc721AndAccessControl() public view {
        assertTrue(registry.supportsInterface(0x80ac58cd)); // ERC-721
        assertTrue(registry.supportsInterface(type(IAccessControl).interfaceId));
    }

    function test_AdminUpdatesOperators() public {
        AssetFactory.Operators memory ops = factory.operators();
        ops.valuator = alice;
        vm.prank(admin);
        factory.setOperators(ops);
        (AssetToken t,,) = _createAsset(_openRules(), new uint16[](0));
        assertTrue(t.hasRole(t.VALUATOR_ROLE(), alice));

        ops.issuer = address(0);
        vm.expectRevert(AssetFactory.ZeroAddress.selector);
        vm.prank(admin);
        factory.setOperators(ops);
    }
}
