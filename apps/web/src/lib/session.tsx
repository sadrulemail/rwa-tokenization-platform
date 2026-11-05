"use client";

import {
  type AuthenticationStatus,
  createAuthenticationAdapter,
  RainbowKitAuthenticationProvider,
} from "@rainbow-me/rainbowkit";
import type { AppRole } from "@rwa/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { createSiweMessage } from "viem/siwe";
import { useAccount } from "wagmi";

import { ApiError, apiFetch, type Me } from "./api";

type Session = {
  status: AuthenticationStatus;
  token: string | null;
  me: Me | null;
  role: AppRole | null;
  isStaff: boolean;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<Session>({
  status: "loading",
  token: null,
  me: null,
  role: null,
  isStaff: false,
  refresh: async () => {},
});

// ---- Session tokens per wallet, kept in localStorage --------------------------------------

const STORAGE_KEY = "rwa.sessions";
const listeners = new Set<() => void>();

function readTokens(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "{}";
  } catch {
    return "{}";
  }
}

function setToken(wallet: string, token: string | null) {
  const all = JSON.parse(readTokens()) as Record<string, string>;
  if (token) all[wallet.toLowerCase()] = token;
  else delete all[wallet.toLowerCase()];
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // storage unavailable: sign-in lasts for this page only
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * Sign-In with Ethereum session. RainbowKit asks the wallet to sign after it connects; the API
 * verifies the signature and returns a bearer token, kept per wallet in localStorage.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const { address, status: accountStatus } = useAccount();
  const queryClient = useQueryClient();
  const tokensJson = useSyncExternalStore(subscribe, readTokens, () => "{}");
  const token = useMemo(() => {
    if (!address) return null;
    return (JSON.parse(tokensJson) as Record<string, string>)[address.toLowerCase()] ?? null;
  }, [address, tokensJson]);

  const me = useQuery({
    queryKey: ["me", token],
    enabled: !!token,
    retry: false,
    queryFn: async () => {
      try {
        return await apiFetch<Me>("/auth/me", { token });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401 && address) setToken(address, null);
        throw error;
      }
    },
  });

  const status: AuthenticationStatus = (() => {
    // With no stored token there is nothing to load: report "unauthenticated" at once, so
    // RainbowKit moves straight to the sign-in step after the wallet connects.
    if (!address || !token) return accountStatus === "reconnecting" ? "loading" : "unauthenticated";
    if (me.isPending) return "loading";
    if (!me.data || me.data.wallet !== address.toLowerCase()) return "unauthenticated";
    return "authenticated";
  })();

  const adapter = useMemo(
    () =>
      createAuthenticationAdapter({
        getNonce: async () => (await apiFetch<{ nonce: string }>("/auth/nonce")).nonce,
        createMessage: ({ nonce, address: wallet, chainId }) =>
          createSiweMessage({
            domain: window.location.host,
            address: wallet,
            statement: "Sign in to the RWA Tokenization Platform. This request does not send a transaction or cost gas.",
            uri: window.location.origin,
            version: "1",
            chainId,
            nonce,
          }),
        verify: async ({ message, signature }) => {
          const result = await apiFetch<{ token: string; user: { wallet: string } }>("/auth/verify", {
            method: "POST",
            body: { message, signature },
          });
          setToken(result.user.wallet, result.token);
          await queryClient.invalidateQueries();
          return true;
        },
        signOut: async () => {
          if (address) setToken(address, null);
          queryClient.removeQueries({ predicate: (q) => q.queryKey[0] === "private" || q.queryKey[0] === "me" });
        },
      }),
    [address, queryClient],
  );

  const refetch = me.refetch;
  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const profile = status === "authenticated" ? (me.data ?? null) : null;
  const role = profile?.role ?? null;
  const value = useMemo<Session>(
    () => ({
      status,
      token: status === "authenticated" ? token : null,
      me: profile,
      role,
      isStaff: !!role && role !== "INVESTOR",
      refresh,
    }),
    [status, token, profile, role, refresh],
  );

  return (
    <RainbowKitAuthenticationProvider adapter={adapter} status={status}>
      <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
    </RainbowKitAuthenticationProvider>
  );
}

export const useSession = () => useContext(SessionContext);
