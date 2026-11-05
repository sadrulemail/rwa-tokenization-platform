"use client";

import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { ActivityFeed } from "@/components/activity-feed";
import { AddressTag, Badge, Card, Notice, PageHeader, Skeleton, Table, Tabs, Td, TxLink } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { useActivity, useAudit, useAuditVerification } from "@/lib/queries";

export default function AuditPage() {
  const [tab, setTab] = useState<"decisions" | "chain">("decisions");
  const audit = useAudit();
  const verification = useAuditVerification();
  const activity = useActivity({ limit: 200 });
  const v = verification.data;

  return (
    <>
      <PageHeader
        title="Audit trail"
        description="Two linked records. Platform decisions are kept in an append-only table where each entry hashes the one before it; on-chain events are indexed from the contracts. Entries for on-chain actions carry the transaction hash."
      />
      <div className="mb-6">
        {!v ? (
          <Skeleton className="h-16" />
        ) : v.valid ? (
          <Notice tone="teal" title="Hash chain verified">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> All {v.checked} entries recomputed and matched. Head hash{" "}
              <span className="font-mono text-xs">{v.head.slice(0, 20)}…</span>
            </span>
          </Notice>
        ) : (
          <Notice tone="rose" title="Hash chain broken">
            <span className="inline-flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" /> Entry #{v.brokenAt} does not match its hash. Records from there on cannot be trusted.
            </span>
          </Notice>
        )}
      </div>
      <Card>
        <div className="border-b border-slate-100 p-4">
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { id: "decisions", label: "Platform decisions" },
              { id: "chain", label: "On-chain events" },
            ]}
          />
        </div>
        {tab === "chain" ? (
          <ActivityFeed items={activity.data} loading={activity.isLoading} />
        ) : !audit.data ? (
          <Skeleton className="m-5 h-40" />
        ) : (
          <Table head={["#", "Time", "Actor", "Action", "Summary", "Transaction", "Hash"]}>
            {audit.data.map((e) => (
              <tr key={e.id} className="align-top">
                <Td className="text-slate-400">{e.id}</Td>
                <Td>{formatDate(new Date(e.occurredAt), true)}</Td>
                <Td>
                  <AddressTag address={e.actorWallet} />
                  {e.actorRole && <p className="text-xs text-slate-400">{e.actorRole.replace("_", " ").toLowerCase()}</p>}
                </Td>
                <Td>
                  <Badge tone={e.action.includes("REJECT") || e.action.includes("FROZEN") || e.action.includes("FORCED") ? "rose" : e.action.includes("APPROV") ? "teal" : "slate"}>
                    {e.action.replace(/_/g, " ").toLowerCase()}
                  </Badge>
                </Td>
                <Td className="min-w-72 max-w-md whitespace-normal text-slate-700 [overflow-wrap:anywhere]">{e.summary}</Td>
                <Td>
                  <TxLink hash={e.txHash} />
                </Td>
                <Td className="font-mono text-xs text-slate-400" >
                  <span title={`prev ${e.prevHash}`}>{e.hash.slice(0, 12)}…</span>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
