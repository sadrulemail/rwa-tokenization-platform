"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { AppRole } from "@rwa/contracts";
import type { ReactNode } from "react";

import { useSession } from "@/lib/session";
import { Card, Empty, Skeleton } from "./ui";

/** Renders children only for a signed-in wallet with one of the given roles. */
export function RequireRole({ roles, children }: { roles?: AppRole[]; children: ReactNode }) {
  const { status, role } = useSession();
  if (status === "loading") return <Skeleton className="h-48" />;
  if (status !== "authenticated") {
    return (
      <Card>
        <Empty
          title="Connect and sign in"
          body="Connect your wallet and sign the sign-in message. Signing is free and sends no transaction."
          action={
            <div className="flex justify-center">
              <ConnectButton />
            </div>
          }
        />
      </Card>
    );
  }
  if (roles && (!role || !roles.includes(role))) {
    return (
      <Card>
        <Empty title="Not available for your role" body="This page is limited to other platform roles." />
      </Card>
    );
  }
  return <>{children}</>;
}
