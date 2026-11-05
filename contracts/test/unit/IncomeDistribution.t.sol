// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AssetToken} from "../../src/AssetToken.sol";
import {BaseTest} from "../Base.t.sol";

contract IncomeDistributionTest is BaseTest {
    function test_DistributesProRata() public {
        _allocate(alice, 750e18);
        _allocate(bob, 250e18);
        _deposit(10_000e6);
        assertEq(token.claimableIncome(alice), 7500e6);
        assertEq(token.claimableIncome(bob), 2500e6);
        assertEq(token.distributionCount(), 1);
        assertEq(usdc.balanceOf(address(token)), 10_000e6);
    }

    function test_ClaimPaysStablecoin() public {
        _allocate(alice, 100e18);
        _deposit(1000e6);
        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        uint256 paid = token.claimIncome();
        assertEq(paid, 1000e6);
        assertEq(usdc.balanceOf(alice) - before, 1000e6);
        assertEq(token.claimableIncome(alice), 0);
        assertEq(token.totalIncomeClaimed(), 1000e6);

        vm.expectRevert(AssetToken.NothingToClaim.selector);
        vm.prank(alice);
        token.claimIncome();
    }

    function test_LateBuyerEarnsNothingFromEarlierDeposit() public {
        _allocate(alice, 100e18);
        _deposit(1000e6);
        _allocate(bob, 100e18);
        assertEq(token.claimableIncome(bob), 0);
        _deposit(1000e6);
        assertEq(token.claimableIncome(alice), 1500e6);
        assertEq(token.claimableIncome(bob), 500e6);
    }

    function test_EarnedIncomeStaysWithSellerAfterTransfer() public {
        _allocate(alice, 100e18);
        _deposit(1000e6);
        vm.prank(alice);
        token.transfer(bob, 100e18);
        _deposit(500e6);
        assertEq(token.claimableIncome(alice), 1000e6);
        assertEq(token.claimableIncome(bob), 500e6);
    }

    function test_LockedSharesKeepEarning() public {
        _allocate(alice, 100e18);
        vm.prank(alice);
        desk.requestRedemption(address(token), 100e18, 0);
        _deposit(1000e6);
        assertEq(token.claimableIncome(alice), 1000e6);
    }

    function test_RevertWhen_FrozenOrPaused() public {
        _allocate(alice, 100e18);
        _deposit(1000e6);
        vm.prank(officer);
        token.setFrozen(alice, true);
        vm.expectRevert(abi.encodeWithSelector(AssetToken.AccountFrozen.selector, alice));
        vm.prank(alice);
        token.claimIncome();

        vm.startPrank(officer);
        token.setFrozen(alice, false);
        token.pause();
        vm.stopPrank();
        vm.expectRevert(); // EnforcedPause
        vm.prank(alice);
        token.claimIncome();
    }

    function test_RevertWhen_NoShareholdersOrZero() public {
        vm.expectRevert(AssetToken.NoShareholders.selector);
        _deposit(1000e6);
        _allocate(alice, 1e18);
        vm.expectRevert(AssetToken.ZeroAmount.selector);
        _deposit(0);
    }

    /// @dev Whatever the split and timing, holders can never claim more than was deposited.
    function testFuzz_ClaimsNeverExceedDeposits(uint96 a, uint96 b, uint96 c, uint64 income1, uint64 income2)
        public
    {
        uint256 sharesA = bound(a, 1, 300_000e18);
        uint256 sharesB = bound(b, 1, 300_000e18);
        uint256 moved = bound(c, 0, sharesA);
        uint256 i1 = bound(income1, 1, 1_000_000e6);
        uint256 i2 = bound(income2, 1, 1_000_000e6);

        _allocate(alice, sharesA);
        _allocate(bob, sharesB);
        _deposit(i1);
        if (moved != 0) {
            vm.prank(alice);
            token.transfer(carol, moved);
        }
        _deposit(i2);

        uint256 owed =
            token.claimableIncome(alice) + token.claimableIncome(bob) + token.claimableIncome(carol);
        assertLe(owed, i1 + i2);
        // Rounding dust is at most one unit per holder per deposit.
        assertGe(owed + 6, i1 + i2);

        address[3] memory holders = [alice, bob, carol];
        for (uint256 i = 0; i < 3; ++i) {
            if (token.claimableIncome(holders[i]) != 0) {
                vm.prank(holders[i]);
                token.claimIncome();
            }
        }
        assertEq(token.totalIncomeClaimed(), owed);
        assertEq(usdc.balanceOf(address(token)), i1 + i2 - owed);
    }
}
