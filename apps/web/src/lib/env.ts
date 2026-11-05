import { type Chain, defineChain } from "viem";
import { arbitrumSepolia, foundry, polygonAmoy } from "viem/chains";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 31337);
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL;
export const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";
export const IS_LOCAL_CHAIN = CHAIN_ID === foundry.id;
export const LOCAL_WALLETS = IS_LOCAL_CHAIN && process.env.NEXT_PUBLIC_LOCAL_WALLETS !== "false";

const known: Record<number, Chain> = {
  [foundry.id]: foundry,
  [arbitrumSepolia.id]: arbitrumSepolia,
  [polygonAmoy.id]: polygonAmoy,
};

const base = known[CHAIN_ID];
if (!base) throw new Error(`Unsupported NEXT_PUBLIC_CHAIN_ID ${CHAIN_ID}`);

/** The single chain this deployment of the app talks to. */
export const CHAIN: Chain = RPC_URL
  ? defineChain({ ...base, rpcUrls: { default: { http: [RPC_URL] } } })
  : base;

export const EXPLORER_URL = CHAIN.blockExplorers?.default.url;
