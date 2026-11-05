import { INVESTOR_TIERS, REQUEST_KINDS, countryByNumeric } from "@rwa/contracts";
import { zeroAddress } from "viem";

import type { Activity } from "./api";
import { formatDate, formatShares, formatUsd, shortAddress, walletLabel } from "./format";

const who = (address?: unknown) => {
  const a = typeof address === "string" ? address : "";
  return walletLabel(a) ?? shortAddress(a);
};

/** One readable line per indexed on-chain event. */
export function describeActivity(a: Activity): string {
  const d = a.data as Record<string, string>;
  const sym = a.symbol ?? "";
  switch (a.event) {
    case "Transfer":
      if (d.from === zeroAddress) return `Issued ${formatShares(d.value)} ${sym} to ${who(d.to)}`;
      if (d.to === zeroAddress) return `Redeemed ${formatShares(d.value)} ${sym} from ${who(d.from)}`;
      return `${who(d.from)} transferred ${formatShares(d.value)} ${sym} to ${who(d.to)}`;
    case "ValuationUpdated":
      return `${sym} NAV set to ${formatUsd(d.navPerShare)} (asset value ${formatUsd(d.assetValue, { compact: true })})`;
    case "IncomeDeposited":
      return `${formatUsd(d.amount)} income distributed to ${sym} holders`;
    case "IncomeClaimed":
      return `${who(d.account)} claimed ${formatUsd(d.amount)} from ${sym}`;
    case "AddressFrozen":
      return `${who(d.account)} ${String(d.frozen) === "true" ? "frozen" : "unfrozen"} on ${sym}`;
    case "SharesLocked":
      return `${formatShares(d.amount)} ${sym} locked for redemption (${who(d.holder)})`;
    case "SharesUnlocked":
      return `${formatShares(d.amount)} ${sym} unlocked (${who(d.holder)})`;
    case "ForcedTransfer":
      return `Forced transfer of ${formatShares(d.amount)} ${sym} from ${who(d.from)} to ${who(d.to)}`;
    case "WalletRecovered":
      return `${sym} position recovered from ${who(d.lostWallet)} to ${who(d.newWallet)}`;
    case "Paused":
      return `Trading in ${sym} paused`;
    case "Unpaused":
      return `Trading in ${sym} resumed`;
    case "AssetCreated":
      return `${d.name} (${d.symbol}) tokenized`;
    case "AssetStatusChanged":
      return `${sym} status changed`;
    case "InvestorRegistered": {
      const country = countryByNumeric(Number(d.country))?.name ?? d.country;
      return `${who(d.wallet)} verified as ${INVESTOR_TIERS[Number(d.tier)]?.toLowerCase()} investor (${country})`;
    }
    case "InvestorUpdated":
      return `${who(d.wallet)} KYC renewed until ${formatDate(d.expiresAt)}`;
    case "InvestorRevoked":
      return `${who(d.wallet)} verification revoked`;
    case "RequestCreated": {
      const kind = REQUEST_KINDS[Number(d.kind)];
      const amount = Number(d.kind) === 0 ? formatUsd(d.amount) : `${formatShares(d.amount)} ${sym}`;
      return `${kind} #${d.id} requested by ${who(d.requestedBy)}: ${amount}`;
    }
    case "RequestApproved":
      return `Request #${d.id} approved by ${who(d.approver)}`;
    case "RequestRejected":
      return `Request #${d.id} rejected: ${d.reason}`;
    case "RequestCancelled":
      return `Request #${d.id} cancelled`;
    case "RulesUpdated":
      return "Compliance rules updated";
    case "CountryRestrictionUpdated": {
      const country = countryByNumeric(Number(d.country))?.name ?? d.country;
      return `${country} ${String(d.blocked) === "true" ? "restricted" : "allowed"} for an asset`;
    }
    default:
      return a.event.replace(/([a-z])([A-Z])/g, "$1 $2");
  }
}

export const ACTIVITY_TONE: Record<string, "teal" | "blue" | "amber" | "rose" | "slate" | "violet"> = {
  Transfer: "blue",
  ValuationUpdated: "violet",
  IncomeDeposited: "teal",
  IncomeClaimed: "teal",
  AddressFrozen: "rose",
  ForcedTransfer: "rose",
  WalletRecovered: "amber",
  Paused: "rose",
  InvestorRegistered: "teal",
  InvestorRevoked: "rose",
  RequestCreated: "amber",
  RequestApproved: "teal",
  RequestRejected: "rose",
  AssetCreated: "violet",
};
