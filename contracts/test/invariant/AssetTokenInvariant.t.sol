// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CommonBase} from "forge-std/Base.sol";
import {StdCheats} from "forge-std/StdCheats.sol";
import {StdUtils} from "forge-std/StdUtils.sol";

import {AssetToken} from "../../src/AssetToken.sol";
import {IdentityRegistry} from "../../src/IdentityRegistry.sol";
import {IssuanceDesk} from "../../src/IssuanceDesk.sol";
import {MockUSDC} from "../../src/MockUSDC.sol";
import {BaseTest} from "../Base.t.sol";

/// @dev Drives random sequences of subscriptions, transfers, redemptions, income deposits,
///      claims, NAV updates and forced transfers across four verified investors.
contract Handler is CommonBase, StdCheats, StdUtils {
    AssetToken internal token;
    IssuanceDesk internal desk;
    MockUSDC internal usdc;
    address internal officer;
    address internal valuator;
    address internal treasury;

    address[] public actors;
    uint256[] internal pendingRedemptions;

    constructor(
        AssetToken token_,
        IssuanceDesk desk_,
        MockUSDC usdc_,
        address officer_,
        address valuator_,
        address treasury_,
        address[] memory actors_
    ) {
        token = token_;
        desk = desk_;
        usdc = usdc_;
        officer = officer_;
        valuator = valuator_;
        treasury = treasury_;
        actors = actors_;
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function subscribe(uint256 actorSeed, uint256 payment) external {
        address investor = _actor(actorSeed);
        payment = bound(payment, 1e6, 50_000e6);
        vm.startPrank(investor);
        usdc.approve(address(desk), payment);
        uint256 id = desk.requestSubscription(address(token), payment, 0);
        vm.stopPrank();
        vm.prank(officer);
        desk.approve(id);
    }

    function transfer(uint256 fromSeed, uint256 toSeed, uint256 amount) external {
        address from = _actor(fromSeed);
        address to = _actor(toSeed);
        uint256 free = token.freeBalanceOf(from);
        if (free == 0) return;
        amount = bound(amount, 1, free);
        vm.prank(from);
        token.transfer(to, amount);
    }

    function requestRedemption(uint256 actorSeed, uint256 shares) external {
        address investor = _actor(actorSeed);
        uint256 free = token.freeBalanceOf(investor);
        if (free == 0) return;
        shares = bound(shares, 1, free);
        vm.prank(investor);
        pendingRedemptions.push(desk.requestRedemption(address(token), shares, 0));
    }

    function settleRedemption(uint256 seed, bool approve) external {
        if (pendingRedemptions.length == 0) return;
        uint256 index = seed % pendingRedemptions.length;
        uint256 id = pendingRedemptions[index];
        pendingRedemptions[index] = pendingRedemptions[pendingRedemptions.length - 1];
        pendingRedemptions.pop();
        IssuanceDesk.Request memory r = desk.getRequest(id);
        vm.prank(officer);
        if (approve && token.lockedBalance(r.account) >= r.amount) {
            desk.approve(id);
        } else {
            desk.reject(id, "handler");
        }
    }

    function depositIncome(uint256 amount) external {
        if (token.totalSupply() == 0) return;
        amount = bound(amount, 1, 100_000e6);
        vm.prank(treasury);
        token.depositIncome(amount, bytes32(amount));
    }

    function claim(uint256 actorSeed) external {
        address investor = _actor(actorSeed);
        if (token.claimableIncome(investor) == 0) return;
        vm.prank(investor);
        token.claimIncome();
    }

    function revalue(uint256 nav) external {
        nav = bound(nav, 1e6, 100e6);
        vm.prank(valuator);
        token.updateValuation(nav, nav * 1_000_000, bytes32(nav));
    }

    function forceTransfer(uint256 fromSeed, uint256 toSeed, uint256 amount) external {
        address from = _actor(fromSeed);
        address to = _actor(toSeed);
        uint256 balance = token.balanceOf(from);
        if (balance == 0 || from == to) return;
        amount = bound(amount, 1, balance);
        vm.prank(officer);
        token.forcedTransfer(from, to, amount);
    }
}

contract AssetTokenInvariantTest is BaseTest {
    Handler internal handler;
    address[] internal actors;

    function setUp() public override {
        super.setUp();
        actors.push(alice);
        actors.push(bob);
        actors.push(carol);
        actors.push(dave);
        handler = new Handler(token, desk, usdc, officer, valuator, treasury, actors);
        targetContract(address(handler));
    }

    function invariant_BalancesAddUpToSupply() public view {
        uint256 sum;
        for (uint256 i = 0; i < actors.length; ++i) {
            sum += token.balanceOf(actors[i]);
        }
        assertEq(sum, token.totalSupply());
    }

    function invariant_HolderCountMatchesNonZeroBalances() public view {
        uint256 holders;
        for (uint256 i = 0; i < actors.length; ++i) {
            if (token.balanceOf(actors[i]) != 0) holders += 1;
        }
        assertEq(holders, token.holderCount());
    }

    function invariant_LockedNeverExceedsBalance() public view {
        for (uint256 i = 0; i < actors.length; ++i) {
            assertLe(token.lockedBalance(actors[i]), token.balanceOf(actors[i]));
        }
    }

    function invariant_IncomeIsFullyBacked() public view {
        uint256 held = usdc.balanceOf(address(token));
        assertEq(held, token.totalIncomeDeposited() - token.totalIncomeClaimed());
        uint256 owed;
        for (uint256 i = 0; i < actors.length; ++i) {
            owed += token.claimableIncome(actors[i]);
        }
        assertLe(owed, held);
    }

    function invariant_OnlyVerifiedWalletsHoldShares() public view {
        IdentityRegistry registry = identity;
        for (uint256 i = 0; i < actors.length; ++i) {
            if (token.balanceOf(actors[i]) != 0) assertTrue(registry.isVerified(actors[i]));
        }
        assertEq(token.balanceOf(eve), 0);
    }

    function invariant_SupplyWithinCap() public view {
        assertLe(token.totalSupply(), token.maxSupply());
    }
}
