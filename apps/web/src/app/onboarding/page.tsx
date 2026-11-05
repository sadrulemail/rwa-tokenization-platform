"use client";

import { COUNTRIES, INVESTOR_TIERS } from "@rwa/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Clock, Lock, XCircle } from "lucide-react";
import { type FormEvent, useState } from "react";

import { RequireRole } from "@/components/guard";
import { useToast } from "@/components/toaster";
import { Button, Card, CardHeader, Field, Input, Notice, PageHeader, Select, Skeleton, TxLink } from "@/components/ui";
import { apiFetch, type KycApplication } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useOwnKyc } from "@/lib/queries";
import { useSession } from "@/lib/session";

const SOURCES = [
  ["EMPLOYMENT_INCOME", "Employment income"],
  ["BUSINESS_PROFITS", "Business profits"],
  ["INVESTMENTS", "Investment returns"],
  ["SAVINGS", "Savings"],
  ["INHERITANCE", "Inheritance or gift"],
  ["INSTITUTIONAL_CAPITAL", "Institutional capital"],
];

export default function OnboardingPage() {
  return (
    <RequireRole roles={["INVESTOR"]}>
      <Onboarding />
    </RequireRole>
  );
}

function Onboarding() {
  const own = useOwnKyc();
  const app = own.data;
  const showForm = !app || app.status === "REJECTED" || app.status === "REVOKED";

  return (
    <>
      <PageHeader
        title="Investor verification"
        description="We screen every investor before their wallet can hold shares. Your personal details are encrypted at rest and never written to the blockchain; only your country, investor category and KYC expiry are."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {own.isLoading ? <Skeleton className="h-96" /> : showForm ? <KycForm previous={app ?? null} /> : <Status app={app!} />}
        </div>
        <Card className="h-fit p-5 text-sm text-slate-600">
          <Lock className="h-5 w-5 text-teal-600" aria-hidden />
          <p className="mt-3 font-semibold text-slate-900">How verification works</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5">
            <li>You submit your details and identity document.</li>
            <li>Automated screening checks sanctions, PEP status, age, document format and duplicates.</li>
            <li>A compliance officer reviews the result and decides.</li>
            <li>On approval your wallet is added to the on-chain identity registry.</li>
          </ol>
        </Card>
      </div>
    </>
  );
}

function Status({ app }: { app: KycApplication }) {
  const expired = app.expiresAt && new Date(app.expiresAt) < new Date();
  if (app.status === "APPROVED" && !expired) {
    return (
      <Card className="p-6">
        <BadgeCheck className="h-8 w-8 text-teal-600" aria-hidden />
        <h2 className="mt-3 text-lg font-semibold text-slate-900">Your wallet is verified</h2>
        <p className="mt-1 text-sm text-slate-600">
          Approved as a {INVESTOR_TIERS[app.approvedTier ?? 1]?.toLowerCase()} investor, resident in {app.country.name}. KYC valid until{" "}
          {formatDate(new Date(app.expiresAt!))}.
        </p>
        <p className="mt-3 text-xs text-slate-500">
          Registry transaction <TxLink hash={app.txHash} />
        </p>
      </Card>
    );
  }
  return (
    <Card className="p-6">
      <Clock className="h-8 w-8 text-amber-500" aria-hidden />
      <h2 className="mt-3 text-lg font-semibold text-slate-900">{expired ? "Your KYC has expired" : "Application under review"}</h2>
      <p className="mt-1 text-sm text-slate-600">
        Submitted {formatDate(new Date(app.submittedAt), true)} for {INVESTOR_TIERS[app.requestedTier]?.toLowerCase()} investor status.
        Automated screening: <span className="font-medium">{app.screening.recommendation.toLowerCase()}</span>.
      </p>
    </Card>
  );
}

function KycForm({ previous }: { previous: KycApplication | null }) {
  const { token, refresh } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/kyc/applications", {
        method: "POST",
        token,
        body: {
          fullName: form.get("fullName"),
          email: form.get("email"),
          dateOfBirth: form.get("dateOfBirth"),
          addressLine: form.get("addressLine"),
          country: form.get("country"),
          documentType: form.get("documentType"),
          documentNumber: form.get("documentNumber"),
          requestedTier: Number(form.get("requestedTier")),
          sourceOfFunds: form.get("sourceOfFunds"),
        },
      });
      toast.push({ tone: "success", title: "Application submitted", body: "A compliance officer will review it." });
      await Promise.all([queryClient.invalidateQueries(), refresh()]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Your details" description="All fields are required." />
      <form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-2">
        {previous?.status === "REJECTED" && (
          <div className="sm:col-span-2">
            <Notice tone="rose" title="Your previous application was not approved">
              <span className="inline-flex items-start gap-1.5">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {previous.decisionReason}
              </span>
            </Notice>
          </div>
        )}
        <Field label="Full legal name">
          <Input name="fullName" required minLength={2} maxLength={120} autoComplete="name" />
        </Field>
        <Field label="E-mail">
          <Input name="email" type="email" required autoComplete="email" />
        </Field>
        <Field label="Date of birth">
          <Input name="dateOfBirth" type="date" required />
        </Field>
        <Field label="Country of residence">
          <Select name="country" required defaultValue="">
            <option value="" disabled>
              Select…
            </option>
            {COUNTRIES.map((c) => (
              <option key={c.alpha2} value={c.alpha2}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Residential address">
            <Input name="addressLine" required minLength={5} maxLength={200} autoComplete="street-address" />
          </Field>
        </div>
        <Field label="Identity document">
          <Select name="documentType" required defaultValue="PASSPORT">
            <option value="PASSPORT">Passport</option>
            <option value="NATIONAL_ID">National ID card</option>
            <option value="DRIVING_LICENCE">Driving licence</option>
          </Select>
        </Field>
        <Field label="Document number">
          <Input name="documentNumber" required minLength={4} maxLength={24} pattern="[A-Za-z0-9 \-]+" />
        </Field>
        <Field label="Investor category" hint="Some assets are limited to professional or institutional investors.">
          <Select name="requestedTier" required defaultValue="1">
            {[1, 2, 3].map((t) => (
              <option key={t} value={t}>
                {INVESTOR_TIERS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Main source of funds">
          <Select name="sourceOfFunds" required defaultValue="EMPLOYMENT_INCOME">
            {SOURCES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        {error && (
          <div className="sm:col-span-2">
            <Notice tone="rose">{error}</Notice>
          </div>
        )}
        <div className="sm:col-span-2">
          <Button type="submit" variant="accent" loading={busy}>
            Submit for review
          </Button>
        </div>
      </form>
    </Card>
  );
}
