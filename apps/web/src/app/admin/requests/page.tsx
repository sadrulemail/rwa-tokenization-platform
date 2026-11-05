"use client";

import { getDeployment, issuanceDeskAbi, REQUEST_KINDS, REQUEST_STATUSES } from "@rwa/contracts";
import { useState } from "react";
import type { Abi } from "viem";
import { useAccount } from "wagmi";

import { AddressTag, Badge, Button, Card, Empty, Input, Notice, PageHeader, Skeleton, Table, Tabs, Td, TxLink } from "@/components/ui";
import type { DeskRequest } from "@/lib/api";
import { CHAIN_ID } from "@/lib/env";
import { formatDate, formatShares, formatUsd, payoutFor, sharesFor } from "@/lib/format";
import { useRequests } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { useTx } from "@/lib/tx";

const deployment = getDeployment(CHAIN_ID);
const STATUS_TONE = ["amber", "teal", "rose", "slate"] as const;

export default function RequestsPage() {
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const pending = useRequests(0);
  const all = useRequests();
  const { role } = useSession();
  const rows = tab === "pending" ? pending.data : all.data?.filter((r) => r.status !== 0);

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Maker-checker queue for the issuance desk. The approver signs with their own wallet, and the contract refuses approval by the person who made the request."
      />
      {role !== "COMPLIANCE_OFFICER" && (
        <div className="mb-4">
          <Notice>Only wallets with the approver role on the issuance desk can approve or reject.</Notice>
        </div>
      )}
      <Card>
        <div className="border-b border-slate-100 p-4">
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { id: "pending", label: `Pending${pending.data ? ` (${pending.data.length})` : ""}` },
              { id: "history", label: "Decided" },
            ]}
          />
        </div>
        {!rows ? (
          <Skeleton className="m-5 h-40" />
        ) : rows.length === 0 ? (
          <Empty title={tab === "pending" ? "Nothing waiting for approval" : "No decisions yet"} />
        ) : tab === "pending" ? (
          <div className="divide-y divide-slate-100">
            {rows.map((r) => (
              <PendingRow key={r.id} r={r} canDecide={role === "COMPLIANCE_OFFICER"} />
            ))}
          </div>
        ) : (
          <Table head={["#", "Type", "Asset", "Investor", "Amount", "Settled", "Status", "Decided", "Transaction"]}>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="text-slate-500">{r.id}</Td>
                <Td>{REQUEST_KINDS[r.kind]}</Td>
                <Td>{r.symbol}</Td>
                <Td>
                  <AddressTag address={r.account} />
                </Td>
                <Td className="tabular-nums">{r.kind === 0 ? formatUsd(r.amount) : `${formatShares(r.amount)} sh`}</Td>
                <Td className="tabular-nums">
                  {r.settled ? (r.kind === 1 ? formatUsd(r.settled) : `${formatShares(r.settled)} sh`) : "—"}
                </Td>
                <Td>
                  <Badge tone={STATUS_TONE[r.status]}>{REQUEST_STATUSES[r.status]}</Badge>
                  {r.reason && <p className="mt-1 max-w-64 whitespace-normal text-xs text-slate-500">{r.reason}</p>}
                </Td>
                <Td>{r.decidedAt ? formatDate(r.decidedAt) : "—"}</Td>
                <Td>
                  <TxLink hash={r.decidedTx} />
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}

function PendingRow({ r, canDecide }: { r: DeskRequest; canDecide: boolean }) {
  const tx = useTx();
  const { address } = useAccount();
  const [reason, setReason] = useState("");
  const nav = BigInt(r.navPerShare);
  const ownRequest = r.requestedBy === address?.toLowerCase();
  const preview =
    r.kind === 0
      ? `${formatShares(sharesFor(BigInt(r.amount), nav))} ${r.symbol} at ${formatUsd(nav)}`
      : r.kind === 1
        ? `${formatUsd(payoutFor(BigInt(r.amount), nav))} payout from treasury`
        : `${formatShares(r.amount)} ${r.symbol} minted`;

  const approve = () =>
    tx.run(
      `Request #${r.id} approved`,
      { address: deployment.issuanceDesk, abi: issuanceDeskAbi as Abi, functionName: "approve", args: [BigInt(r.id)] },
      { action: "REQUEST_APPROVED", entityType: "DESK_REQUEST", entityId: r.id, summary: `Approved ${REQUEST_KINDS[r.kind].toLowerCase()} #${r.id} (${preview})` },
    );
  const reject = () =>
    tx.run(
      `Request #${r.id} rejected`,
      { address: deployment.issuanceDesk, abi: issuanceDeskAbi as Abi, functionName: "reject", args: [BigInt(r.id), reason] },
      { action: "REQUEST_REJECTED", entityType: "DESK_REQUEST", entityId: r.id, summary: `Rejected #${r.id}: ${reason}` },
    );

  return (
    <div className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_auto]">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-400">#{r.id}</span>
          <Badge tone={r.kind === 0 ? "teal" : r.kind === 1 ? "amber" : "violet"}>{REQUEST_KINDS[r.kind]}</Badge>
          <span className="font-medium text-slate-900">{r.assetName}</span>
          <span className="text-xs text-slate-400">{formatDate(r.createdAt, true)}</span>
        </div>
        <p className="text-sm text-slate-700">
          <AddressTag address={r.account} /> · {r.kind === 0 ? formatUsd(r.amount) : `${formatShares(r.amount)} ${r.symbol}`}
          {r.kind === 2 && (
            <>
              {" "}
              · proposed by <AddressTag address={r.requestedBy} />
            </>
          )}
        </p>
        <p className="text-sm text-slate-500">
          If approved now: {preview}
          {r.minimumOut !== "0" && (
            <> · limit {r.kind === 0 ? `${formatShares(r.minimumOut)} sh minimum` : `${formatUsd(r.minimumOut)} minimum`}</>
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <Input className="w-56" placeholder="Reason for rejection" value={reason} onChange={(e) => setReason(e.target.value)} disabled={!canDecide} />
        <Button variant="danger" size="sm" loading={tx.pending?.includes("rejected")} disabled={!canDecide || reason.trim().length < 3 || tx.busy} onClick={() => void reject().catch(() => {})}>
          Reject
        </Button>
        <Button
          variant="accent"
          size="sm"
          loading={tx.pending?.includes("approved")}
          disabled={!canDecide || ownRequest || tx.busy}
          title={ownRequest ? "A second person must approve your own request" : undefined}
          onClick={() => void approve().catch(() => {})}
        >
          Approve
        </Button>
      </div>
    </div>
  );
}
