import { Inject, Injectable, Logger } from "@nestjs/common";
import { type Deployment, getDeployment, identityRegistryAbi, assetRegistryAbi } from "@rwa/contracts";
import {
  type Address,
  type Chain,
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  type Hex,
  http,
  type PublicClient,
  type WalletClient,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia, foundry, polygonAmoy } from "viem/chains";

import { APP_CONFIG, type AppConfig } from "../config";

const KNOWN_CHAINS: Record<number, Chain> = {
  [foundry.id]: foundry,
  [arbitrumSepolia.id]: arbitrumSepolia,
  [polygonAmoy.id]: polygonAmoy,
};

/** viem clients, contract addresses and the KYC registrar wallet. */
@Injectable()
export class ChainService {
  private readonly logger = new Logger(ChainService.name);
  readonly chain: Chain;
  readonly deployment: Deployment;
  readonly publicClient: PublicClient;
  private readonly registrar: WalletClient;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.chain =
      KNOWN_CHAINS[config.chainId] ??
      defineChain({
        id: config.chainId,
        name: `Chain ${config.chainId}`,
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [config.rpcUrl] } },
      });
    this.deployment = getDeployment(config.chainId);
    const transport = http(config.rpcUrl);
    this.publicClient = createPublicClient({ chain: this.chain, transport }) as PublicClient;
    this.registrar = createWalletClient({
      chain: this.chain,
      transport,
      account: privateKeyToAccount(config.registrarKey),
    });
    this.logger.log(`Chain ${config.chainId}, registrar ${this.registrar.account!.address}`);
  }

  get registrarAddress(): Address {
    return this.registrar.account!.address;
  }

  /** Writes or renews an investor in the IdentityRegistry and waits for the receipt. */
  async registerInvestor(wallet: Address, country: number, tier: number, expiresAt: Date): Promise<Hex> {
    const registry = this.deployment.identityRegistry;
    const expiry = BigInt(Math.floor(expiresAt.getTime() / 1000));
    const current = await this.publicClient.readContract({
      address: registry,
      abi: identityRegistryAbi,
      functionName: "investorOf",
      args: [wallet],
    });
    const functionName = current.registered ? "updateInvestor" : "registerInvestor";
    const hash = await this.registrar.writeContract({
      address: registry,
      abi: identityRegistryAbi,
      functionName,
      args: [wallet, country, tier, expiry],
      account: this.registrar.account!,
      chain: this.chain,
    });
    await this.waitFor(hash);
    return hash;
  }

  async revokeInvestor(wallet: Address): Promise<Hex> {
    const hash = await this.registrar.writeContract({
      address: this.deployment.identityRegistry,
      abi: identityRegistryAbi,
      functionName: "revokeInvestor",
      args: [wallet],
      account: this.registrar.account!,
      chain: this.chain,
    });
    await this.waitFor(hash);
    return hash;
  }

  /** Latest block time; on a back-dated local chain this differs from the wall clock. */
  async chainTime(): Promise<Date> {
    const block = await this.publicClient.getBlock();
    return new Date(Number(block.timestamp) * 1000);
  }

  /** True for platform contracts and listed asset tokens. */
  async isPlatformContract(address: Address): Promise<boolean> {
    const d = this.deployment;
    const fixed = [d.identityRegistry, d.assetRegistry, d.issuanceDesk, d.assetFactory, d.settlementToken];
    if (fixed.some((a) => a.toLowerCase() === address.toLowerCase())) return true;
    const assetId = await this.publicClient.readContract({
      address: d.assetRegistry,
      abi: assetRegistryAbi,
      functionName: "assetIdOf",
      args: [getAddress(address)],
    });
    return assetId !== 0n;
  }

  private async waitFor(hash: Hex) {
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`Transaction ${hash} reverted`);
    return receipt;
  }

  static readonly zeroAddress = zeroAddress;
}
