"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/store/session";
import {
  fetchAdminTenants,
  fetchAdminUsers,
  fetchAudit,
  fetchBootstrap,
  fetchDetectionAnalytics,
  fetchFrameworks,
  fetchPolicies,
  fetchSessionCapabilities,
} from "@/mock/api";
import type { SessionContext } from "@/mock/rbac";

export function useSessionContext(): SessionContext | null {
  const userId = useSession((s) => s.userId);
  const tenantId = useSession((s) => s.tenantId);
  if (!userId || !tenantId) return null;
  return { userId, tenantId };
}

export function useBootstrap() {
  const userId = useSession((s) => s.userId);
  return useQuery({
    queryKey: ["bootstrap", userId],
    queryFn: () => fetchBootstrap(userId!),
    enabled: !!userId,
  });
}

export function useCapabilities() {
  const ctx = useSessionContext();
  return useQuery({
    queryKey: ["capabilities", ctx?.userId, ctx?.tenantId],
    queryFn: () => fetchSessionCapabilities(ctx!),
    enabled: !!ctx,
  });
}

export function useAudit() {
  const ctx = useSessionContext();
  return useQuery({
    queryKey: ["audit", ctx?.tenantId],
    queryFn: () => fetchAudit(ctx!),
    enabled: !!ctx,
  });
}

export function useFrameworks() {
  return useQuery({ queryKey: ["frameworks"], queryFn: fetchFrameworks, staleTime: Infinity });
}

export function useAdminTenants() {
  const ctx = useSessionContext();
  return useQuery({ queryKey: ["admin-tenants", ctx?.userId, ctx?.tenantId], queryFn: () => fetchAdminTenants(ctx!), enabled: !!ctx });
}

export function useAdminUsers() {
  const ctx = useSessionContext();
  return useQuery({ queryKey: ["admin-users", ctx?.userId, ctx?.tenantId], queryFn: () => fetchAdminUsers(ctx!), enabled: !!ctx });
}

export function usePolicies() {
  const ctx = useSessionContext();
  return useQuery({ queryKey: ["policies", ctx?.userId, ctx?.tenantId], queryFn: () => fetchPolicies(ctx!), enabled: !!ctx });
}

export function useDetectionAnalytics() {
  const ctx = useSessionContext();
  return useQuery({
    queryKey: ["detection-analytics", ctx?.userId, ctx?.tenantId],
    queryFn: () => fetchDetectionAnalytics(ctx!),
    enabled: !!ctx,
  });
}
