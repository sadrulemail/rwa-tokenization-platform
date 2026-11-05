import { connectorsForWallets, type Wallet, type WalletList } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  rainbowWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { ANVIL_MNEMONIC, LOCAL_ACCOUNTS } from "@rwa/contracts";
import { http } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { createConfig, createConnector } from "wagmi";
import { mock } from "wagmi/connectors";

import { CHAIN, LOCAL_WALLETS, WALLETCONNECT_PROJECT_ID } from "./env";

const ROLE_COLOURS: Record<string, string> = {
  ADMIN: "#7c3aed",
  COMPLIANCE_OFFICER: "#0f766e",
  ASSET_MANAGER: "#1d4ed8",
  VALUATOR: "#b45309",
  TREASURY: "#be123c",
  INVESTOR: "#334155",
};

const icon = (label: string, colour: string) => {
  const initials = label
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="14" fill="${colour}"/><text x="32" y="41" font-family="Arial,sans-serif" font-size="24" font-weight="700" fill="#fff" text-anchor="middle">${initials}</text></svg>`;
  return `data:image/svg+xml;base64,${typeof btoa === "function" ? btoa(svg) : Buffer.from(svg).toString("base64")}`;
};

/**
 * One wallet entry per Anvil development account, so every role can be tried locally without a
 * browser extension. Signing and transactions go to the local node, which holds these keys.
 */
function localWallet(index: number, label: string, role: string): Wallet {
  const address = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: index }).address;
  const id = `local-${index}`;
  return {
    id,
    name: role === "INVESTOR" ? `${label} (investor)` : label,
    iconUrl: icon(label, ROLE_COLOURS[role] ?? "#334155"),
    iconBackground: ROLE_COLOURS[role] ?? "#334155",
    createConnector: (walletDetails) =>
      createConnector((config) => {
        const base = mock({ accounts: [address], features: { reconnect: true } })(config);
        const disconnectedKey = `${id}.disconnected` as const;
        return {
          ...base,
          ...walletDetails,
          id,
          name: label,
          async connect(params?: Parameters<typeof base.connect>[0]) {
            await config.storage?.removeItem(disconnectedKey);
            return base.connect(params as never);
          },
          async disconnect() {
            await config.storage?.setItem(disconnectedKey, true);
            return base.disconnect();
          },
          // The mock connector forgets its state on reload: reconnect the wallet used last,
          // unless the user disconnected it.
          async isAuthorized() {
            if (await config.storage?.getItem(disconnectedKey)) return false;
            return (await config.storage?.getItem("recentConnectorId")) === id;
          },
        } as typeof base;
      }),
  };
}

const groups: WalletList = [];
if (LOCAL_WALLETS) {
  const staff = LOCAL_ACCOUNTS.filter((a) => a.role !== "INVESTOR" && a.role !== "REGISTRAR");
  const investors = LOCAL_ACCOUNTS.filter((a) => a.role === "INVESTOR");
  groups.push({ groupName: "Local node: staff", wallets: staff.map((a) => () => localWallet(a.index, a.label, a.role)) });
  groups.push({
    groupName: "Local node: investors",
    wallets: investors.map((a) => () => localWallet(a.index, a.label, a.role)),
  });
}
groups.push({
  groupName: "Browser wallets",
  wallets: WALLETCONNECT_PROJECT_ID
    ? [metaMaskWallet, rainbowWallet, coinbaseWallet, walletConnectWallet]
    : [injectedWallet],
});

const connectors = connectorsForWallets(groups, {
  appName: "RWA Tokenization Platform",
  projectId: WALLETCONNECT_PROJECT_ID || "local-development",
});

export const wagmiConfig = createConfig({
  chains: [CHAIN],
  connectors,
  transports: { [CHAIN.id]: http(CHAIN.rpcUrls.default.http[0]) },
  ssr: true,
});
