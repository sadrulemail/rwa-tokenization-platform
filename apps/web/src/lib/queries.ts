"use client";

import { useQuery } from "@tanstack/react-query";

import {
  type Activity,
  apiFetch,
  type Asset,
  type AuditEntry,
  type AuditVerification,
  type Dashboard,
  type DeskRequest,
  type Distribution,
  type Holder,
  type KycApplication,
  type Portfolio,
  type ShareTransfer,
  type Summary,
  type Valuation,
} from "./api";
import { useSession } from "./session";

const LIVE = { refetchInterval: 5_000 };

export const useSummary = () =>
  useQuery({ queryKey: ["summary"], queryFn: () => apiFetch<Summary>("/market/summary"), ...LIVE });

export const useAssets = () =>
  useQuery({ queryKey: ["assets"], queryFn: () => apiFetch<Asset[]>("/market/assets"), ...LIVE });

export const useAsset = (token?: string) =>
  useQuery({
    queryKey: ["asset", token],
    queryFn: () => apiFetch<Asset>(`/market/assets/${token}`),
    enabled: !!token,
    ...LIVE,
  });

export const useValuations = (token?: string) =>
  useQuery({
    queryKey: ["valuations", token],
    queryFn: () => apiFetch<Valuation[]>(`/market/assets/${token}/valuations`),
    enabled: !!token,
  });

export const useDistributions = (token?: string) =>
  useQuery({
    queryKey: ["distributions", token],
    queryFn: () => apiFetch<Distribution[]>(`/market/assets/${token}/distributions`),
    enabled: !!token,
  });

export const useTransfers = (token?: string) =>
  useQuery({
    queryKey: ["transfers", token],
    queryFn: () => apiFetch<ShareTransfer[]>(`/market/assets/${token}/transfers?limit=100`),
    enabled: !!token,
    ...LIVE,
  });

export const useActivity = (params: { token?: string; account?: string; limit?: number } = {}) => {
  const search = new URLSearchParams();
  if (params.token) search.set("token", params.token);
  if (params.account) search.set("account", params.account);
  search.set("limit", String(params.limit ?? 50));
  return useQuery({
    queryKey: ["activity", params],
    queryFn: () => apiFetch<Activity[]>(`/market/activity?${search}`),
    ...LIVE,
  });
};

function usePrivate<T>(key: unknown[], path: string, enabled = true) {
  const { token } = useSession();
  return useQuery({
    queryKey: ["private", ...key, token],
    queryFn: () => apiFetch<T>(path, { token }),
    enabled: !!token && enabled,
    ...LIVE,
  });
}

export const usePortfolio = () => usePrivate<Portfolio>(["portfolio"], "/portfolio");
export const useRequests = (status?: number) =>
  usePrivate<DeskRequest[]>(["requests", status], `/market/requests${status === undefined ? "" : `?status=${status}`}`);
export const useHolders = (token?: string) =>
  usePrivate<Holder[]>(["holders", token], `/market/assets/${token}/holders`, !!token);
export const useDashboard = () => usePrivate<Dashboard>(["dashboard"], "/dashboard");
export const useKycApplications = (status?: string) =>
  usePrivate<KycApplication[]>(["kyc", status], `/compliance/applications${status ? `?status=${status}` : ""}`);
export const useKycApplication = (id?: string) =>
  usePrivate<KycApplication>(["kyc-app", id], `/compliance/applications/${id}`, !!id);
export const useOwnKyc = () => usePrivate<KycApplication | null>(["kyc-own"], "/kyc/me");
export const useAudit = () => usePrivate<AuditEntry[]>(["audit"], "/audit?limit=200");
export const useAuditVerification = () => usePrivate<AuditVerification>(["audit-verify"], "/audit/verify");
