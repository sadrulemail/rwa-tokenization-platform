"use client";

import { INVESTOR_TIERS } from "@rwa/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, XCircle } from "lucide-react";
import { useState } from "react";

import { useToast } from "@/components/toaster";
import { AddressTag, Badge, Button, Card, CardHeader, Empty, Field, Input, Notice, PageHeader, Select, Skeleton, Tabs, Textarea, TxLink } from "@/components/ui";
import { apiFetch, type KycApplication } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useKycApplication, useKycApplications } from "@/lib/queries";
import { useSession } from "@/lib/session";

type Filter = "SUBMITTED" | "APPROVED" | "REJECTED" | "ALL";
const STATUS_TONE = { SUBMITTED: "amber", APPROVED: "teal", REJECTED: "rose", REVOKED: "slate" } as const;
const RISK_TONE = { LOW: "teal", MEDIUM: "amber", HIGH: "rose" } as const;
const SOURCE_LABEL: Record<string, string> = {
  EMPLOYMENT_INCOME: "Employment income",
  BUSINESS_PROFITS: "Business profits",
  INVESTMENTS: "Investment returns",
  SAVINGS: "Savings",
  INHERITANCE: "Inheritance or gift",
  INSTITUTIONAL_CAPITAL: "Institutional capital",
};

export default function KycReviewPage() {
  const [filter, setFilter] = useState<Filter>("SUBMITTED");
  const list = useKycApplications(filter === "ALL" ? undefined : filter);
  const [choice, setSelected] = useState<string | undefined>();
  const selected = choice ?? list.data?.[0]?.id;

  return (
    <>
      <PageHeader
        title="KYC reviews"
        description="Approving writes the wallet, country, category and expiry to the on-chain identity registry. Personal data stays encrypted in the platform database."
      />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <div className="border-b border-slate-100 p-4">
            <Tabs<Filter>
              value={filter}
              onChange={(f) => {
                setFilter(f);
                setSelected(undefined);
              }}
              items={[
                { id: "SUBMITTED", label: "To review" },
                { id: "APPROVED", label: "Approved" },
                { id: "REJECTED", label: "Rejected" },
                { id: "ALL", label: "All" },
              ]}
            />
          </div>
          {list.isLoading ? (
            <Skeleton className="m-4 h-40" />
          ) : list.data?.length ? (
            <ul className="divide-y divide-slate-100">
              {list.data.map((a) => (
                <li key={a.id}>
                  <button
                    onClick={() => setSelected(a.id)}
                    className={`flex w-full items-start justify-between gap-3 px-5 py-3 text-left hover:bg-slate-50 ${selected === a.id ? "bg-teal-50/60" : ""}`}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{a.fullName}</p>
                      <p className="text-xs text-slate-500">
                        {a.country.name} · {INVESTOR_TIERS[a.requestedTier]} · {formatDate(new Date(a.submittedAt))}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge tone={STATUS_TONE[a.status]}>{a.status.toLowerCase()}</Badge>
                      <Badge tone={RISK_TONE[a.riskLevel]}>{a.riskLevel.toLowerCase()} risk</Badge>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="Nothing here" body="New applications appear as investors submit them." />
          )}
        </Card>
        <div className="lg:col-span-3">{selected ? <ApplicationDetail id={selected} /> : null}</div>
      </div>
    </>
  );
}

function ApplicationDetail({ id }: { id: string }) {
  const app = useKycApplication(id);
  if (app.isLoading || !app.data) return <Skeleton className="h-96" />;
  const a = app.data;
  return (
    <Card>
      <CardHeader
        title={a.fullName}
        description={<span className="font-mono text-xs">{a.wallet}</span>}
        action={<Badge tone={STATUS_TONE[a.status]}>{a.status.toLowerCase()}</Badge>}
      />
      <div className="grid gap-x-6 gap-y-3 p-5 text-sm sm:grid-cols-2">
        <Item label="E-mail" value={a.email} />
        <Item label="Date of birth" value={a.dateOfBirth ?? "—"} />
        <Item label="Country" value={`${a.country.name} (${a.country.alpha2})`} />
        <Item label="Address" value={a.addressLine ?? "—"} />
        <Item label="Document" value={`${a.documentType.replace("_", " ").toLowerCase()} ${a.documentNumber}`} />
        <Item label="Source of funds" value={SOURCE_LABEL[a.sourceOfFunds] ?? a.sourceOfFunds} />
        <Item label="Requested category" value={INVESTOR_TIERS[a.requestedTier] ?? ""} />
        <Item label="Submitted" value={formatDate(new Date(a.submittedAt), true)} />
      </div>

      <div className="border-t border-slate-100 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900">Screening</p>
          <div className="flex gap-2">
            <Badge tone={RISK_TONE[a.screening.riskLevel]}>Risk score {a.screening.riskScore}</Badge>
            <Badge tone={a.screening.recommendation === "APPROVE" ? "teal" : a.screening.recommendation === "REVIEW" ? "amber" : "rose"}>
              Recommends {a.screening.recommendation.toLowerCase()}
            </Badge>
          </div>
        </div>
        <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-100">
          {a.screening.checks.map((c) => (
            <li key={c.name} className="flex items-start gap-3 px-4 py-2.5 text-sm">
              {c.result === "CLEAR" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
              ) : c.result === "REVIEW" ? (
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              )}
              <span className="w-44 shrink-0 font-medium text-slate-800">{c.name}</span>
              <span className="text-slate-600">{c.detail}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-400">
          {a.screening.provider} · {formatDate(new Date(a.screening.checkedAt), true)}
        </p>
      </div>

      {a.status === "SUBMITTED" ? (
        <Decision app={a} />
      ) : (
        <div className="space-y-1 border-t border-slate-100 p-5 text-sm text-slate-600">
          <p>
            Decided by <AddressTag address={a.reviewedBy} /> on {a.reviewedAt ? formatDate(new Date(a.reviewedAt), true) : "—"}
          </p>
          {a.decisionReason && <p>Reason: {a.decisionReason}</p>}
          {a.status === "APPROVED" && (
            <p>
              {INVESTOR_TIERS[a.approvedTier ?? 1]} until {formatDate(new Date(a.expiresAt!))} · registry tx <TxLink hash={a.txHash} />
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function Decision({ app }: { app: KycApplication }) {
  const { token, role } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [tier, setTier] = useState(String(app.requestedTier));
  const [days, setDays] = useState("365");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const needsOverride = app.screening.recommendation === "REJECT";
  const canDecide = role === "COMPLIANCE_OFFICER";

  async function decide(kind: "approve" | "reject") {
    setBusy(kind);
    try {
      const body =
        kind === "approve"
          ? { tier: Number(tier), validityDays: Number(days), ...(needsOverride ? { overrideReason: reason } : {}) }
          : { reason };
      await apiFetch(`/compliance/applications/${app.id}/${kind}`, { method: "POST", token, body });
      toast.push({
        tone: "success",
        title: kind === "approve" ? `${app.fullName} approved` : `${app.fullName} rejected`,
        body: kind === "approve" ? "The wallet is now in the identity registry." : undefined,
      });
      setReason("");
      await queryClient.invalidateQueries();
    } catch (error) {
      toast.push({ tone: "error", title: "Decision failed", body: (error as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4 border-t border-slate-100 bg-slate-50/60 p-5">
      {!canDecide && <Notice>Only the compliance officer can decide applications.</Notice>}
      {needsOverride && (
        <Notice tone="rose" title="Screening recommends rejection">
          Approving needs a written override reason, which is kept in the audit trail.
        </Notice>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Approve as">
          <Select value={tier} onChange={(e) => setTier(e.target.value)} disabled={!canDecide}>
            {[1, 2, 3].map((t) => (
              <option key={t} value={t}>
                {INVESTOR_TIERS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="KYC valid for (days)">
          <Input type="number" min={30} max={1095} value={days} onChange={(e) => setDays(e.target.value)} disabled={!canDecide} />
        </Field>
      </div>
      <Field label={needsOverride ? "Override or rejection reason" : "Rejection reason"} hint="Shown to the investor when you reject.">
        <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} disabled={!canDecide} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="accent"
          loading={busy === "approve"}
          disabled={!canDecide || !!busy || (needsOverride && reason.trim().length < 10)}
          onClick={() => void decide("approve")}
        >
          Approve and register wallet
        </Button>
        <Button variant="danger" loading={busy === "reject"} disabled={!canDecide || !!busy || reason.trim().length < 5} onClick={() => void decide("reject")}>
          Reject
        </Button>
      </div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="break-words text-slate-800">{value}</p>
    </div>
  );
}
