// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {IIdentityRegistry} from "../../src/interfaces/IIdentityRegistry.sol";
import {BaseTest} from "../Base.t.sol";

contract IdentityRegistryTest is BaseTest {
    function test_RegisterStoresEligibilityOnly() public view {
        IIdentityRegistry.Investor memory inv = identity.investorOf(alice);
        assertTrue(inv.registered);
        assertEq(inv.country, GB);
        assertEq(inv.tier, 2);
        assertEq(inv.expiresAt, START + 365 days);
        assertTrue(identity.isVerified(alice));
        assertEq(identity.investorCount(), 4);
    }

    function test_KycExpiryEndsVerification() public {
        vm.warp(START + 365 days);
        assertFalse(identity.isVerified(alice));
    }

    function test_UpdateRenewsKyc() public {
        vm.warp(START + 400 days);
        vm.prank(registrar);
        identity.updateInvestor(alice, GB, 3, uint64(block.timestamp + 365 days));
        assertTrue(identity.isVerified(alice));
        assertEq(identity.investorOf(alice).tier, 3);
    }

    function test_RevokeAndRegisterAgain() public {
        vm.startPrank(registrar);
        identity.revokeInvestor(alice);
        assertFalse(identity.isVerified(alice));
        assertEq(identity.investorCount(), 3);
        identity.registerInvestor(alice, GB, 1, uint64(block.timestamp + 30 days));
        vm.stopPrank();
        assertTrue(identity.isVerified(alice));
    }

    function test_RevertWhen_CallerIsNotRegistrar() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, identity.REGISTRAR_ROLE()
            )
        );
        vm.prank(alice);
        identity.registerInvestor(eve, GB, 1, uint64(block.timestamp + 1 days));
    }

    function test_RevertWhen_InputsInvalid() public {
        vm.startPrank(registrar);
        vm.expectRevert(abi.encodeWithSelector(IIdentityRegistry.AlreadyRegistered.selector, alice));
        identity.registerInvestor(alice, GB, 1, uint64(block.timestamp + 1 days));

        vm.expectRevert(abi.encodeWithSelector(IIdentityRegistry.InvalidCountry.selector, uint16(0)));
        identity.registerInvestor(eve, 0, 1, uint64(block.timestamp + 1 days));

        vm.expectRevert(abi.encodeWithSelector(IIdentityRegistry.InvalidTier.selector, uint8(4)));
        identity.registerInvestor(eve, GB, 4, uint64(block.timestamp + 1 days));

        vm.expectRevert(
            abi.encodeWithSelector(IIdentityRegistry.InvalidExpiry.selector, uint64(block.timestamp))
        );
        identity.registerInvestor(eve, GB, 1, uint64(block.timestamp));

        vm.expectRevert(abi.encodeWithSelector(IIdentityRegistry.NotRegistered.selector, eve));
        identity.updateInvestor(eve, GB, 1, uint64(block.timestamp + 1 days));

        vm.expectRevert(abi.encodeWithSelector(IIdentityRegistry.NotRegistered.selector, eve));
        identity.revokeInvestor(eve);
        vm.stopPrank();
    }

    function test_EmitsRegistrationEvent() public {
        uint64 expiry = uint64(block.timestamp + 90 days);
        vm.expectEmit(address(identity));
        emit IIdentityRegistry.InvestorRegistered(eve, SG, 1, expiry);
        vm.prank(registrar);
        identity.registerInvestor(eve, SG, 1, expiry);
    }
}
