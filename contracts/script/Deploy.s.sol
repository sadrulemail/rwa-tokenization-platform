// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";

import {AssetCompliance} from "../src/AssetCompliance.sol";
import {AssetFactory} from "../src/AssetFactory.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {AssetToken} from "../src/AssetToken.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";
import {IssuanceDesk} from "../src/IssuanceDesk.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// @notice Deploys the platform, wires every role and writes deployments/<chainId>.json.
///
/// Environment (addresses default to the deployer):
///   DEPLOYER_PRIVATE_KEY   key that pays for the deployment
///   ADMIN_ADDRESS          DEFAULT_ADMIN_ROLE everywhere; use a Safe multisig outside local chains
///   OFFICER_ADDRESS        compliance officer: approver, transfer agent, compliance rules
///   OPERATOR_ADDRESS       asset manager: creates assets, proposes allocations, keeps records
///   VALUATOR_ADDRESS       publishes NAV updates
///   TREASURY_ADDRESS       receives subscriptions, funds redemptions and income, holds deeds
///   REGISTRAR_ADDRESS      KYC service wallet that writes the identity registry
///   SETTLEMENT_TOKEN       existing stablecoin; when unset a MockUSDC is deployed
contract Deploy is Script {
    struct Accounts {
        address admin;
        address officer;
        address operator;
        address valuator;
        address treasury;
        address registrar;
    }

    struct Deployment {
        address settlementToken;
        address identityRegistry;
        address assetRegistry;
        address tokenImplementation;
        address complianceImplementation;
        address issuanceDesk;
        address assetFactory;
        uint256 startBlock;
    }

    function run() external returns (Deployment memory d) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        Accounts memory a = Accounts({
            admin: vm.envOr("ADMIN_ADDRESS", deployer),
            officer: vm.envOr("OFFICER_ADDRESS", deployer),
            operator: vm.envOr("OPERATOR_ADDRESS", deployer),
            valuator: vm.envOr("VALUATOR_ADDRESS", deployer),
            treasury: vm.envOr("TREASURY_ADDRESS", deployer),
            registrar: vm.envOr("REGISTRAR_ADDRESS", deployer)
        });
        d.settlementToken = vm.envOr("SETTLEMENT_TOKEN", address(0));
        d.startBlock = block.number;

        vm.startBroadcast(deployerKey);
        if (d.settlementToken == address(0)) {
            MockUSDC usdc = new MockUSDC(deployer);
            if (a.treasury != deployer) usdc.grantRole(usdc.MINTER_ROLE(), a.treasury);
            d.settlementToken = address(usdc);
        }

        IdentityRegistry identity = new IdentityRegistry(deployer);
        AssetRegistry registry = new AssetRegistry(deployer);
        IssuanceDesk desk = new IssuanceDesk(deployer, d.settlementToken, address(registry), a.treasury);
        d.tokenImplementation = address(new AssetToken());
        d.complianceImplementation = address(new AssetCompliance());
        AssetFactory factory = new AssetFactory(
            deployer,
            d.tokenImplementation,
            d.complianceImplementation,
            address(registry),
            address(identity),
            d.settlementToken,
            AssetFactory.Operators({
                admin: a.admin,
                agent: a.officer,
                issuer: address(desk),
                valuator: a.valuator,
                distributor: a.treasury,
                complianceOfficer: a.officer,
                custodian: a.treasury
            })
        );

        identity.grantRole(identity.REGISTRAR_ROLE(), a.registrar);
        registry.grantRole(registry.REGISTRAR_ROLE(), address(factory));
        registry.grantRole(registry.RECORDS_ROLE(), a.operator);
        factory.grantRole(factory.ASSET_MANAGER_ROLE(), a.operator);
        desk.grantRole(desk.OPERATOR_ROLE(), a.operator);
        desk.grantRole(desk.APPROVER_ROLE(), a.officer);

        if (a.admin != deployer) {
            identity.grantRole(identity.DEFAULT_ADMIN_ROLE(), a.admin);
            registry.grantRole(registry.DEFAULT_ADMIN_ROLE(), a.admin);
            desk.grantRole(desk.DEFAULT_ADMIN_ROLE(), a.admin);
            factory.grantRole(factory.DEFAULT_ADMIN_ROLE(), a.admin);
            identity.renounceRole(identity.DEFAULT_ADMIN_ROLE(), deployer);
            registry.renounceRole(registry.DEFAULT_ADMIN_ROLE(), deployer);
            desk.renounceRole(desk.DEFAULT_ADMIN_ROLE(), deployer);
            factory.renounceRole(factory.DEFAULT_ADMIN_ROLE(), deployer);
        }
        vm.stopBroadcast();

        d.identityRegistry = address(identity);
        d.assetRegistry = address(registry);
        d.issuanceDesk = address(desk);
        d.assetFactory = address(factory);
        _write(d, a);
    }

    function _write(Deployment memory d, Accounts memory a) private {
        string memory roles = "roles";
        vm.serializeAddress(roles, "admin", a.admin);
        vm.serializeAddress(roles, "officer", a.officer);
        vm.serializeAddress(roles, "operator", a.operator);
        vm.serializeAddress(roles, "valuator", a.valuator);
        vm.serializeAddress(roles, "treasury", a.treasury);
        string memory rolesJson = vm.serializeAddress(roles, "registrar", a.registrar);

        string memory root = "deployment";
        vm.serializeUint(root, "chainId", block.chainid);
        vm.serializeUint(root, "startBlock", d.startBlock);
        vm.serializeAddress(root, "settlementToken", d.settlementToken);
        vm.serializeAddress(root, "identityRegistry", d.identityRegistry);
        vm.serializeAddress(root, "assetRegistry", d.assetRegistry);
        vm.serializeAddress(root, "assetTokenImplementation", d.tokenImplementation);
        vm.serializeAddress(root, "assetComplianceImplementation", d.complianceImplementation);
        vm.serializeAddress(root, "issuanceDesk", d.issuanceDesk);
        vm.serializeAddress(root, "assetFactory", d.assetFactory);
        string memory json = vm.serializeString(root, "roles", rolesJson);

        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console.log("Deployment written to", path);
    }
}
