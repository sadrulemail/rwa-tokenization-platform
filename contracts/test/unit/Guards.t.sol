// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AssetCompliance} from "../../src/AssetCompliance.sol";
import {AssetFactory} from "../../src/AssetFactory.sol";
import {AssetRegistry} from "../../src/AssetRegistry.sol";
import {AssetToken} from "../../src/AssetToken.sol";
import {IdentityRegistry} from "../../src/IdentityRegistry.sol";
import {IssuanceDesk} from "../../src/IssuanceDesk.sol";
import {IIdentityRegistry} from "../../src/interfaces/IIdentityRegistry.sol";
import {BaseTest} from "../Base.t.sol";

/// @dev Zero-address and zero-amount guards on constructors and privileged entry points.
contract GuardsTest is BaseTest {
    function test_ConstructorsRejectZeroAddresses() public {
        vm.expectRevert(IIdentityRegistry.ZeroAddress.selector);
        new IdentityRegistry(address(0));

        vm.expectRevert(AssetRegistry.ZeroAddress.selector);
        new AssetRegistry(address(0));

        vm.expectRevert(IssuanceDesk.ZeroAddress.selector);
        new IssuanceDesk(admin, address(usdc), address(registry), address(0));

        AssetFactory.Operators memory ops = factory.operators();
        vm.expectRevert(AssetFactory.ZeroAddress.selector);
        new AssetFactory(admin, address(0), address(1), address(1), address(1), address(1), ops);
    }

    function test_TokenRejectsZeroInputs() public {
        vm.startPrank(officer);
        vm.expectRevert(AssetToken.ZeroAddress.selector);
        token.setFrozen(address(0), true);
        vm.expectRevert(AssetToken.ZeroAddress.selector);
        token.forcedTransfer(address(0), alice, 1);
        vm.expectRevert(AssetToken.ZeroAmount.selector);
        token.forcedTransfer(alice, bob, 0);
        vm.expectRevert(AssetToken.ZeroAddress.selector);
        token.recoverWallet(alice, address(0));
        vm.expectRevert(AssetToken.SameWallet.selector);
        token.recoverWallet(alice, alice);
        vm.expectRevert(abi.encodeWithSelector(AssetToken.NotVerified.selector, eve));
        token.recoverWallet(alice, eve);
        vm.stopPrank();

        vm.startPrank(admin);
        vm.expectRevert(AssetToken.ZeroAddress.selector);
        token.setCompliance(address(0));
        vm.expectRevert(AssetToken.ZeroAddress.selector);
        token.setIdentityRegistry(address(0));
        token.setIdentityRegistry(address(identity));
        vm.stopPrank();

        vm.startPrank(address(desk));
        vm.expectRevert(AssetToken.ZeroAmount.selector);
        token.mint(alice, 0);
        vm.expectRevert(AssetToken.ZeroAmount.selector);
        token.redeem(alice, 0);
        vm.expectRevert(abi.encodeWithSelector(AssetToken.InsufficientLocked.selector, alice, 0, 1));
        token.redeem(alice, 1);
        vm.expectRevert(AssetToken.ZeroAmount.selector);
        token.lockShares(alice, 0);
        vm.expectRevert(abi.encodeWithSelector(AssetToken.InsufficientLocked.selector, alice, 0, 1));
        token.unlockShares(alice, 1);
        vm.stopPrank();
    }

    function test_ForcedTransferBeyondBalanceReverts() public {
        _allocate(alice, 10e18);
        vm.expectRevert();
        vm.prank(officer);
        token.forcedTransfer(alice, bob, 11e18);
    }

    function test_DeskRejectsZeroInputs() public {
        vm.startPrank(alice);
        vm.expectRevert(IssuanceDesk.ZeroAmount.selector);
        desk.requestSubscription(address(token), 0, 0);
        vm.expectRevert(IssuanceDesk.ZeroAmount.selector);
        desk.requestRedemption(address(token), 0, 0);
        vm.stopPrank();

        vm.startPrank(operator);
        vm.expectRevert(IssuanceDesk.ZeroAddress.selector);
        desk.proposeAllocation(address(token), address(0), 1);
        vm.expectRevert(IssuanceDesk.ZeroAmount.selector);
        desk.proposeAllocation(address(token), alice, 0);
        vm.stopPrank();

        vm.expectRevert(IssuanceDesk.ZeroAddress.selector);
        vm.prank(admin);
        desk.setTreasury(address(0));
    }

    function test_RegistryRejectsBadInput() public {
        vm.prank(admin);
        registry.grantRole(keccak256("REGISTRAR_ROLE"), admin);
        AssetRegistry.NewAsset memory asset = AssetRegistry.NewAsset({
            assetClass: AssetRegistry.AssetClass.PrivateCredit,
            shareToken: address(token),
            documentHash: bytes32(0),
            name: "dup",
            jurisdiction: "GB",
            metadataURI: ""
        });
        vm.startPrank(admin);
        vm.expectRevert(abi.encodeWithSelector(AssetRegistry.TokenAlreadyRegistered.selector, address(token)));
        registry.registerAsset(treasury, asset);
        vm.expectRevert(AssetRegistry.ZeroAddress.selector);
        registry.registerAsset(address(0), asset);
        vm.expectRevert(AssetRegistry.ZeroAddress.selector);
        registry.transferCustody(assetId, address(0));
        vm.stopPrank();
    }

    function test_ComplianceInitializerGuards() public {
        AssetCompliance implementation = AssetCompliance(factory.complianceImplementation());
        vm.expectRevert();
        implementation.initialize(
            admin, officer, address(token), address(identity), _openRules(), new uint16[](0)
        );
    }
}
