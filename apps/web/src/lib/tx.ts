"use client";

import { TRANSFER_CODES } from "@rwa/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { type Abi, BaseError, ContractFunctionRevertedError, type Hex, UserRejectedRequestError } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";

import { apiFetch } from "./api";
import { useSession } from "./session";
import { useToast } from "@/components/toaster";

const ERROR_MESSAGES: Record<string, string> = {
  NotVerified: "This wallet is not a verified investor yet.",
  AssetNotActive: "This asset is not open for new requests.",
  SelfApproval: "A second person must approve a request you made.",
  SlippageExceeded: "The NAV moved past the requested limit. Reject and ask for a new request.",
  NothingToClaim: "There is no income to claim yet.",
  AccountFrozen: "This wallet is frozen for the asset.",
  InsufficientUnlocked: "Not enough free shares; part of the balance is locked.",
  NotPending: "This request has already been decided.",
  NoShareholders: "Nobody holds this asset yet.",
  AccessControlUnauthorizedAccount: "Your wallet does not have the on-chain role for this action.",
  ERC20InsufficientAllowance: "The stablecoin allowance is too low.",
  ERC20InsufficientBalance: "Your balance is too low.",
  EnforcedPause: "Trading in this asset is paused.",
};

/** Turns a viem error into one sentence for the user. */
export function readableError(error: unknown): string {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) return "You cancelled the request in your wallet.";
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name === "TransferRejected") return TRANSFER_CODES[Number(revert.data?.args?.[0])] ?? "Transfer rejected";
      if (name && ERROR_MESSAGES[name]) return ERROR_MESSAGES[name];
      if (name) return name.replace(/([a-z])([A-Z])/g, "$1 $2");
      if (revert.reason) return revert.reason;
    }
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : String(error);
}

type WriteParams = {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
};

export type AuditNote = { action: string; entityType: string; entityId?: string; summary: string };

/**
 * Sends a contract call from the connected wallet, waits for the receipt, records the action in
 * the audit trail and refreshes the dashboards once the indexer has caught up.
 */
export function useTx() {
  const { writeContractAsync } = useWriteContract();
  const client = usePublicClient();
  const { token } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);

  async function run(label: string, params: WriteParams, audit?: AuditNote) {
    setPending(label);
    try {
      const hash: Hex = await writeContractAsync(params as never);
      const receipt = await client!.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The transaction reverted.");
      if (audit && token) {
        await apiFetch("/audit/onchain", { method: "POST", token, body: { ...audit, txHash: hash } }).catch(() => {
          toast.push({ tone: "warning", title: "Saved on-chain", body: "The audit entry could not be recorded." });
        });
      }
      toast.push({ tone: "success", title: label, body: "Confirmed on-chain." });
      setTimeout(() => void queryClient.invalidateQueries(), 1_200);
      return receipt;
    } catch (error) {
      toast.push({ tone: "error", title: `${label} failed`, body: readableError(error) });
      throw error;
    } finally {
      setPending(null);
    }
  }

  return { run, pending, busy: pending !== null };
}
