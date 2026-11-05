import {
  assetComplianceAbi,
  assetFactoryAbi,
  assetRegistryAbi,
  assetTokenAbi,
  getDeployment,
  identityRegistryAbi,
  issuanceDeskAbi,
} from "@rwa/contracts";
import { createConfig, factory } from "ponder";
import { getAbiItem } from "viem";

const chainId = Number(process.env.CHAIN_ID ?? 31337);
const deployment = getDeployment(chainId);
const startBlock = Number(process.env.START_BLOCK ?? deployment.startBlock);

const assetCreated = getAbiItem({ abi: assetFactoryAbi, name: "AssetCreated" });

export default createConfig({
  database: {
    kind: "postgres",
    connectionString: process.env.DATABASE_URL ?? "postgres://rwa:rwa@localhost:5433/rwa",
  },
  chains: {
    platform: {
      id: chainId,
      rpc: process.env.RPC_URL ?? "http://127.0.0.1:8545",
      // Anvil mines instantly; poll quickly so the dashboard updates within a second.
      pollingInterval: chainId === 31337 ? 500 : 2_000,
      // Local chains restart from block 0, so never reuse cached RPC data for them.
      cacheRpcRequests: chainId !== 31337,
    },
  },
  contracts: {
    IdentityRegistry: {
      chain: "platform",
      abi: identityRegistryAbi,
      address: deployment.identityRegistry,
      startBlock,
    },
    AssetRegistry: {
      chain: "platform",
      abi: assetRegistryAbi,
      address: deployment.assetRegistry,
      startBlock,
    },
    AssetFactory: {
      chain: "platform",
      abi: assetFactoryAbi,
      address: deployment.assetFactory,
      startBlock,
    },
    IssuanceDesk: {
      chain: "platform",
      abi: issuanceDeskAbi,
      address: deployment.issuanceDesk,
      startBlock,
    },
    AssetToken: {
      chain: "platform",
      abi: assetTokenAbi,
      address: factory({ address: deployment.assetFactory, event: assetCreated, parameter: "token" }),
      startBlock,
    },
    AssetCompliance: {
      chain: "platform",
      abi: assetComplianceAbi,
      address: factory({ address: deployment.assetFactory, event: assetCreated, parameter: "compliance" }),
      startBlock,
    },
  },
});
