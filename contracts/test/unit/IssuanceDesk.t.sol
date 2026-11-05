// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {AssetRegistry} from "../../src/AssetRegistry.sol";
import {AssetToken} from "../../src/AssetToken.sol";
import {IssuanceDesk} from "../../src/IssuanceDesk.sol";
import {BaseTest} from "../Base.t.sol";

contract IssuanceDeskTest is BaseTest {
    function _subscribe(address investor, uint256 payment, uint256 minShares) internal returns (uint256 id) {
        vm.startPrank(investor);
        usdc.approve(address(desk), payment);
        id = desk.requestSubscription(address(token), payment, minShares);
        vm.stopPrank();
    }

    // --- subscriptions ---------------------------------------------------------------------

    function test_SubscriptionEscrowsThenMintsAtNav() public {
        uint256 treasuryBefore = usdc.balanceOf(treasury);
        uint256 id = _subscribe(alice, 5000e6, 500e18);
        assertEq(usdc.balanceOf(address(desk)), 5000e6);

        IssuanceDesk.Request memory r = desk.getRequest(id);
        assertEq(uint8(r.kind), uint8(IssuanceDesk.Kind.Subscription));
        assertEq(uint8(r.status), uint8(IssuanceDesk.Status.Pending));
        assertEq(r.requestedBy, alice);

        vm.prank(officer);
        desk.approve(id);
        assertEq(token.balanceOf(alice), 500e18);
        assertEq(usdc.balanceOf(treasury) - treasuryBefore, 5000e6);
        assertEq(usdc.balanceOf(address(desk)), 0);

        r = desk.getRequest(id);
        assertEq(uint8(r.status), uint8(IssuanceDesk.Status.Approved));
        assertEq(r.decidedBy, officer);
        assertEq(r.settled, 500e18);
    }

    function test_SubscriptionPricesAtApprovalNav() public {
        uint256 id = _subscribe(alice, 5000e6, 0);
        vm.prank(valuator);
        token.updateValuation(12.5e6, 12_500_000e6, keccak256("re-appraisal"));
        vm.prank(officer);
        desk.approve(id);
        assertEq(token.balanceOf(alice), 400e18);
    }

    function test_RevertWhen_NavMoveBreaksMinShares() public {
        uint256 id = _subscribe(alice, 5000e6, 500e18);
        vm.prank(valuator);
        token.updateValuation(12.5e6, 12_500_000e6, bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(IssuanceDesk.SlippageExceeded.selector, id, 400e18, 500e18));
        vm.prank(officer);
        desk.approve(id);
    }

    function test_RejectRefunds() public {
        uint256 before = usdc.balanceOf(alice);
        uint256 id = _subscribe(alice, 5000e6, 0);
        vm.expectEmit(address(desk));
        emit IssuanceDesk.RequestRejected(id, officer, "source of funds unclear");
        vm.prank(officer);
        desk.reject(id, "source of funds unclear");
        assertEq(usdc.balanceOf(alice), before);
        assertEq(uint8(desk.getRequest(id).status), uint8(IssuanceDesk.Status.Rejected));
    }

    function test_InvestorCanCancelOwnRequestOnly() public {
        uint256 id = _subscribe(alice, 5000e6, 0);
        vm.expectRevert(abi.encodeWithSelector(IssuanceDesk.NotRequester.selector, id));
        vm.prank(bob);
        desk.cancelRequest(id);

        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        desk.cancelRequest(id);
        assertEq(usdc.balanceOf(alice) - before, 5000e6);

        vm.expectRevert(abi.encodeWithSelector(IssuanceDesk.NotPending.selector, id));
        vm.prank(officer);
        desk.approve(id);
    }

    function test_RevertWhen_SubscriberNotVerified() public {
        vm.startPrank(eve);
        usdc.approve(address(desk), 1000e6);
        vm.expectRevert(abi.encodeWithSelector(IssuanceDesk.NotVerified.selector, eve));
        desk.requestSubscription(address(token), 1000e6, 0);
        vm.stopPrank();
    }

    function test_RevertWhen_AssetSuspendedOrUnknown() public {
        vm.prank(operator);
        registry.setStatus(assetId, AssetRegistry.AssetStatus.Suspended);
        vm.startPrank(alice);
        usdc.approve(address(desk), 1000e6);
        vm.expectRevert(abi.encodeWithSelector(IssuanceDesk.AssetNotActive.selector, address(token)));
        desk.requestSubscription(address(token), 1000e6, 0);
        vm.expectRevert(abi.encodeWithSelector(IssuanceDesk.AssetNotActive.selector, address(usdc)));
        desk.requestSubscription(address(usdc), 1000e6, 0);
        vm.stopPrank();
    }

    // --- redemptions -----------------------------------------------------------------------

    function test_RedemptionBurnsAndPaysNavFromTreasury() public {
        _allocate(alice, 1000e18);
        vm.prank(valuator);
        token.updateValuation(11e6, 11_000_000e6, bytes32(0));

        vm.prank(alice);
        uint256 id = desk.requestRedemption(address(token), 400e18, 4400e6);
        assertEq(token.lockedBalance(alice), 400e18);

        uint256 before = usdc.balanceOf(alice);
        vm.prank(officer);
        desk.approve(id);
        assertEq(token.balanceOf(alice), 600e18);
        assertEq(token.lockedBalance(alice), 0);
        assertEq(token.totalSupply(), 600e18);
        assertEq(usdc.balanceOf(alice) - before, 4400e6);
        assertEq(desk.getRequest(id).settled, 4400e6);
    }

    function test_RevertWhen_RedemptionPayoutBelowMinimum() public {
        _allocate(alice, 1000e18);
        vm.prank(alice);
        uint256 id = desk.requestRedemption(address(token), 100e18, 1001e6);
        vm.expectRevert(abi.encodeWithSelector(IssuanceDesk.SlippageExceeded.selector, id, 1000e6, 1001e6));
        vm.prank(officer);
        desk.approve(id);
    }

    function test_RevertWhen_RedeemingMoreThanFree() public {
        _allocate(alice, 100e18);
        vm.prank(alice);
        desk.requestRedemption(address(token), 80e18, 0);
        vm.expectRevert(abi.encodeWithSelector(AssetToken.InsufficientUnlocked.selector, alice, 20e18, 30e18));
        vm.prank(alice);
        desk.requestRedemption(address(token), 30e18, 0);
    }

    function test_RejectedRedemptionUnlocks() public {
        _allocate(alice, 100e18);
        vm.prank(alice);
        uint256 id = desk.requestRedemption(address(token), 80e18, 0);
        vm.prank(officer);
        desk.reject(id, "redemption window closed");
        assertEq(token.lockedBalance(alice), 0);
        assertEq(token.balanceOf(alice), 100e18);
    }

    function test_RejectAfterForcedTransferReleasesWhatIsLeft() public {
        _allocate(alice, 100e18);
        vm.prank(alice);
        uint256 id = desk.requestRedemption(address(token), 80e18, 0);
        vm.prank(officer);
        token.forcedTransfer(alice, bob, 90e18); // releases 70 of the 80 locked
        assertEq(token.lockedBalance(alice), 10e18);
        vm.prank(officer);
        desk.reject(id, "shares moved by court order");
        assertEq(token.lockedBalance(alice), 0);
    }

    // --- allocations and maker-checker -----------------------------------------------------

    function test_AllocationNeedsSecondPerson() public {
        bytes32 approverRole = desk.APPROVER_ROLE();
        vm.prank(admin);
        desk.grantRole(approverRole, operator);
        vm.prank(operator);
        uint256 id = desk.proposeAllocation(address(token), carol, 50e18);
        vm.expectRevert(abi.encodeWithSelector(IssuanceDesk.SelfApproval.selector, id));
        vm.prank(operator);
        desk.approve(id);

        vm.prank(officer);
        desk.approve(id);
        assertEq(token.balanceOf(carol), 50e18);
    }

    function test_RevertWhen_UnauthorisedMakerOrChecker() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, desk.OPERATOR_ROLE()
            )
        );
        vm.prank(alice);
        desk.proposeAllocation(address(token), alice, 1e18);

        uint256 id = _subscribe(alice, 1000e6, 0);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, desk.APPROVER_ROLE()
            )
        );
        vm.prank(alice);
        desk.approve(id);
    }

    function test_RevertWhen_UnknownRequest() public {
        vm.expectRevert(abi.encodeWithSelector(IssuanceDesk.UnknownRequest.selector, 99));
        desk.getRequest(99);
        vm.expectRevert(abi.encodeWithSelector(IssuanceDesk.UnknownRequest.selector, 0));
        vm.prank(officer);
        desk.approve(0);
    }

    function test_TreasuryCanBeReplacedByAdmin() public {
        address newTreasury = makeAddr("newTreasury");
        vm.prank(admin);
        desk.setTreasury(newTreasury);
        assertEq(desk.treasury(), newTreasury);
    }
}
