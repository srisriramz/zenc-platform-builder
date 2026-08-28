"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/store/session";
import {
  addTelemetrySource,
  createTenant,
  createUser,
  fetchAdminTenants,
  fetchAdminUsers,
  fetchAudit,
  fetchBootstrap,
  fetchDetectionAnalytics,
  fetchFrameworks,
  fetchPolicies,
  fetchSessionCapabilities,
  updateTenantPolicy,
  type AddTelemetrySourceInput,
  type CreateTenantInput,
  type CreateUserInput,
} from "@/mock/api";
import type { SessionContext } from "@/mock/rbac";
import type { TenantPolicy } from "@/data/platform";

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

export function useUpdateTenantPolicy() {
  const ctx = useSessionContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, patch }: { tenantId: string; patch: Partial<Pick<TenantPolicy, "default_autonomy_level" | "pre_authorized_action_classes">> }) =>
      updateTenantPolicy(ctx!, tenantId, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["policies"] }),
  });
}

export function useCreateTenant() {
  const ctx = useSessionContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTenantInput) => createTenant(ctx!, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-tenants"] }),
  });
}

export function useCreateUser() {
  const ctx = useSessionContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => createUser(ctx!, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });
}

export function useAddTelemetrySource() {
  const ctx = useSessionContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddTelemetrySourceInput) => addTelemetrySource(ctx!, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["telemetry-sources"] }),
  });
}

export function useDetectionAnalytics() {
  const ctx = useSessionContext();
  return useQuery({
    queryKey: ["detection-analytics", ctx?.userId, ctx?.tenantId],
    queryFn: () => fetchDetectionAnalytics(ctx!),
    enabled: !!ctx,
  });
}
