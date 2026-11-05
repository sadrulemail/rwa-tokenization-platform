"use client";

import { useState } from "react";

import { ActivityFeed } from "@/components/activity-feed";
import { Card, CardHeader, PageHeader, Select } from "@/components/ui";
import { useActivity, useAssets } from "@/lib/queries";

export default function ActivityPage() {
  const assets = useAssets();
  const [token, setToken] = useState("");
  const activity = useActivity({ token: token || undefined, limit: 150 });

  return (
    <>
      <PageHeader
        title="On-chain activity"
        description="Every event emitted by the platform contracts, indexed in order. This is the on-chain half of the audit trail."
      />
      <Card>
        <CardHeader
          title="Events"
          description="Newest first"
          action={
            <Select value={token} onChange={(e) => setToken(e.target.value)} className="w-56" aria-label="Filter by asset">
              <option value="">All assets and registries</option>
              {assets.data?.map((a) => (
                <option key={a.token} value={a.token}>
                  {a.symbol} · {a.name}
                </option>
              ))}
            </Select>
          }
        />
        <ActivityFeed items={activity.data} loading={activity.isLoading} />
      </Card>
    </>
  );
}
