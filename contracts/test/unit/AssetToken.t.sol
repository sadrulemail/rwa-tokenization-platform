// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import {AssetCompliance} from "../../src/AssetCompliance.sol";
import {AssetToken} from "../../src/AssetToken.sol";
import {IAssetCompliance} from "../../src/interfaces/IAssetCompliance.sol";
import {TransferCode} from "../../src/libraries/TransferCode.sol";
import {BaseTest} from "../Base.t.sol";

contract AssetTokenTest is BaseTest {
    function setUp() public override {
        super.setUp();
        _allocate(alice, 1000e18);
        _allocate(bob, 500e18);
    }

    function _expectRejected(uint8 code) internal {
        vm.expectRevert(abi.encodeWithSelector(AssetToken.TransferRejected.selector, code));
    }

    // --- basic transfers -------------------------------------------------------------------

    function test_TransferBetweenVerifiedInvestors() public {
        vm.prank(alice);
        token.transfer(carol, 100e18);
        assertEq(token.balanceOf(carol), 100e18);
        assertEq(token.balanceOf(alice), 900e18);
        assertEq(token.holderCount(), 3);
    }

    function test_HolderCountFollowsBalances() public {
        assertEq(token.holderCount(), 2);
        vm.prank(bob);
        token.transfer(alice, 500e18); // bob exits
        assertEq(token.holderCount(), 1);
        vm.prank(alice);
        token.transfer(alice, 10e18); // self transfer changes nothing
        assertEq(token.holderCount(), 1);
    }

    function test_RevertWhen_ReceiverNotVerified() public {
        assertEq(token.transferStatus(alice, eve, 1e18), TransferCode.RECEIVER_NOT_VERIFIED);
        _expectRejected(TransferCode.RECEIVER_NOT_VERIFIED);
        vm.prank(alice);
        token.transfer(eve, 1e18);
    }

    function test_RevertWhen_SenderKycExpired() public {
        vm.warp(START + 366 days);
        vm.prank(registrar);
        identity.updateInvestor(carol, SG, 3, uint64(block.timestamp + 365 days));
        _expectRejected(TransferCode.SENDER_NOT_VERIFIED);
        vm.prank(alice);
        token.transfer(carol, 1e18);
    }

    function test_RevertWhen_SenderOrReceiverFrozen() public {
        vm.prank(officer);
        token.setFrozen(alice, true);
        _expectRejected(TransferCode.SENDER_FROZEN);
        vm.prank(alice);
        token.transfer(bob, 1e18);

        _expectRejected(TransferCode.RECEIVER_FROZEN);
        vm.prank(bob);
        token.transfer(alice, 1e18);

        vm.prank(officer);
        token.setFrozen(alice, false);
        vm.prank(alice);
        token.transfer(bob, 1e18);
    }

    function test_PauseStopsTransfersAndMints() public {
        vm.prank(officer);
        token.pause();
        _expectRejected(TransferCode.PAUSED);
        vm.prank(alice);
        token.transfer(bob, 1e18);

        vm.prank(operator);
        uint256 id = desk.proposeAllocation(address(token), carol, 1e18);
        _expectRejected(TransferCode.PAUSED);
        vm.prank(officer);
        desk.approve(id);

        vm.prank(officer);
        token.unpause();
        vm.prank(alice);
        token.transfer(bob, 1e18);
    }

    function test_RevertWhen_AmountExceedsBalance() public {
        _expectRejected(TransferCode.INSUFFICIENT_BALANCE);
        vm.prank(bob);
        token.transfer(alice, 501e18);
    }

    // --- compliance rules ------------------------------------------------------------------

    function test_LockupBlocksSecondaryTransfersOnly() public {
        _setRules(
            IAssetCompliance.Rules({minTier: 1, maxHolders: 0, lockupUntil: START + 30 days, maxBalance: 0})
        );
        _expectRejected(TransferCode.LOCKUP_ACTIVE);
        vm.prank(alice);
        token.transfer(bob, 1e18);

        _allocate(carol, 1e18); // primary issuance still works
        assertEq(token.balanceOf(carol), 1e18);

        vm.warp(START + 30 days);
        vm.prank(alice);
        token.transfer(bob, 1e18);
    }

    function test_RevertWhen_TierTooLow() public {
        _setRules(IAssetCompliance.Rules({minTier: 2, maxHolders: 0, lockupUntil: 0, maxBalance: 0}));
        assertEq(token.transferStatus(alice, dave, 1e18), TransferCode.TIER_TOO_LOW);
        _expectRejected(TransferCode.TIER_TOO_LOW);
        vm.prank(alice);
        token.transfer(dave, 1e18);
    }

    function test_RevertWhen_CountryBlocked() public {
        vm.prank(officer);
        compliance.setCountryBlocked(US, true);
        _expectRejected(TransferCode.COUNTRY_BLOCKED);
        vm.prank(alice);
        token.transfer(bob, 1e18);
        assertTrue(compliance.isCountryBlocked(US));
    }

    function test_HolderLimitAllowsFullExit() public {
        _setRules(IAssetCompliance.Rules({minTier: 1, maxHolders: 2, lockupUntil: 0, maxBalance: 0}));
        _expectRejected(TransferCode.HOLDER_LIMIT);
        vm.prank(alice);
        token.transfer(carol, 1e18);

        vm.prank(bob);
        token.transfer(carol, 500e18); // bob leaves, carol joins: still two holders
        assertEq(token.holderCount(), 2);
    }

    function test_RevertWhen_BalanceLimitExceeded() public {
        _setRules(IAssetCompliance.Rules({minTier: 1, maxHolders: 0, lockupUntil: 0, maxBalance: 600e18}));
        _expectRejected(TransferCode.BALANCE_LIMIT);
        vm.prank(alice);
        token.transfer(bob, 101e18);
        vm.prank(alice);
        token.transfer(bob, 100e18);
    }

    function test_RevertWhen_SupplyCapReached() public {
        vm.prank(operator);
        uint256 id = desk.proposeAllocation(address(token), carol, MAX_SUPPLY);
        _expectRejected(TransferCode.SUPPLY_CAP);
        vm.prank(officer);
        desk.approve(id);
    }

    function test_RevertWhen_InvalidRules() public {
        vm.expectRevert(abi.encodeWithSelector(IAssetCompliance.InvalidTier.selector, uint8(4)));
        _setRules(IAssetCompliance.Rules({minTier: 4, maxHolders: 0, lockupUntil: 0, maxBalance: 0}));
    }

    // --- share locks, forced transfer, recovery -------------------------------------------

    function test_LockedSharesCannotMove() public {
        vm.prank(alice);
        desk.requestRedemption(address(token), 900e18, 0);
        assertEq(token.lockedBalance(alice), 900e18);
        assertEq(token.freeBalanceOf(alice), 100e18);

        _expectRejected(TransferCode.LOCKED_BALANCE);
        vm.prank(alice);
        token.transfer(bob, 101e18);
        vm.prank(alice);
        token.transfer(bob, 100e18);
    }

    function test_ForcedTransferSkipsRulesAndReleasesLocks() public {
        vm.prank(alice);
        desk.requestRedemption(address(token), 900e18, 0);
        _setRules(
            IAssetCompliance.Rules({minTier: 3, maxHolders: 0, lockupUntil: START + 365 days, maxBalance: 0})
        );
        vm.prank(officer);
        token.setFrozen(alice, true);

        vm.prank(officer);
        token.forcedTransfer(alice, dave, 950e18);
        assertEq(token.balanceOf(dave), 950e18);
        assertEq(token.lockedBalance(alice), 50e18);
    }

    function test_RevertWhen_ForcedTransferToUnverified() public {
        vm.expectRevert(abi.encodeWithSelector(AssetToken.NotVerified.selector, eve));
        vm.prank(officer);
        token.forcedTransfer(alice, eve, 1e18);
    }

    function test_RecoverWalletMovesEverything() public {
        _deposit(1500e6); // 1.00 USDC per share
        vm.prank(alice);
        desk.requestRedemption(address(token), 200e18, 0);
        vm.prank(officer);
        token.setFrozen(alice, true);

        address aliceNew = makeAddr("aliceNew");
        _register(aliceNew, GB, 2);
        vm.prank(officer);
        token.recoverWallet(alice, aliceNew);

        assertEq(token.balanceOf(alice), 0);
        assertEq(token.balanceOf(aliceNew), 1000e18);
        assertEq(token.lockedBalance(aliceNew), 200e18);
        assertEq(token.lockedBalance(alice), 0);
        assertTrue(token.isFrozen(aliceNew));
        assertEq(token.claimableIncome(alice), 0);
        assertEq(token.claimableIncome(aliceNew), 1000e6);
        assertEq(token.holderCount(), 2);
    }

    // --- valuation and admin --------------------------------------------------------------

    function test_UpdateValuation() public {
        vm.warp(START + 90 days);
        vm.expectEmit(address(token));
        emit AssetToken.ValuationUpdated(10.5e6, 10_500_000e6, keccak256("Q2"), uint64(block.timestamp));
        vm.prank(valuator);
        token.updateValuation(10.5e6, 10_500_000e6, keccak256("Q2"));
        assertEq(token.navPerShare(), 10.5e6);
        assertEq(token.valuationTimestamp(), block.timestamp);
    }

    function test_RevertWhen_ValuationByNonValuatorOrZero() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, token.VALUATOR_ROLE()
            )
        );
        vm.prank(alice);
        token.updateValuation(1, 1, bytes32(0));

        vm.expectRevert(AssetToken.InvalidValuation.selector);
        vm.prank(valuator);
        token.updateValuation(0, 1, bytes32(0));
    }

    function test_AdminCanSwapComplianceModule() public {
        (, AssetCompliance other,) = _createAsset(_openRules(), new uint16[](0));
        vm.prank(admin);
        token.setCompliance(address(other));
        assertEq(address(token.compliance()), address(other));
    }

    function test_SetMaxSupply() public {
        vm.expectRevert(AssetToken.MaxSupplyBelowSupply.selector);
        vm.prank(admin);
        token.setMaxSupply(1000e18);
        vm.prank(admin);
        token.setMaxSupply(2000e18);
        assertEq(token.maxSupply(), 2000e18);
    }

    function test_RevertWhen_InitializedTwice() public {
        AssetToken.InitParams memory p;
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        token.initialize(p);

        AssetToken implementation = AssetToken(factory.tokenImplementation());
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        implementation.initialize(p);
    }
}
