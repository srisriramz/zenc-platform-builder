"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  fetchAlertDetail,
  fetchAlerts,
  fetchCorrelationRules,
  fetchEntityRisk,
  fetchEntityRiskDetail,
  fetchEventLineage,
  fetchQuarantineQueue,
  fetchRuleDetail,
  fetchTelemetrySources,
  searchLogs,
  type AlertFilter,
  type LogSearchInput,
} from "@/mock/api";
import { useSession } from "@/store/session";
import { useSessionContext } from "./use-platform";

export function useTelemetrySources() {
  const ctx = useSessionContext();
  const sim = useSession((s) => s.sim);
  return useQuery({
    queryKey: ["telemetry-sources", ctx?.tenantId, sim],
    queryFn: () => fetchTelemetrySources(ctx!),
    enabled: !!ctx,
  });
}

export function useQuarantineQueue() {
  const ctx = useSessionContext();
  const sim = useSession((s) => s.sim);
  return useQuery({
    queryKey: ["quarantine", ctx?.tenantId, sim],
    queryFn: () => fetchQuarantineQueue(ctx!),
    enabled: !!ctx,
  });
}

export function useLogSearch(input: LogSearchInput | null) {
  const ctx = useSessionContext();
  const sim = useSession((s) => s.sim);
  return useQuery({
    queryKey: ["log-search", ctx?.tenantId, sim, input],
    queryFn: () => searchLogs(ctx!, input!),
    enabled: !!ctx && !!input,
    placeholderData: keepPreviousData,
  });
}

export function useEventLineage(eventId: string | null) {
  const ctx = useSessionContext();
  return useQuery({
    queryKey: ["event-lineage", ctx?.tenantId, eventId],
    queryFn: () => fetchEventLineage(ctx!, eventId!),
    enabled: !!ctx && !!eventId,
  });
}

export function useEntityRisk() {
  const ctx = useSessionContext();
  return useQuery({
    queryKey: ["entity-risk", ctx?.tenantId],
    queryFn: () => fetchEntityRisk(ctx!),
    enabled: !!ctx,
    staleTime: 60_000,
  });
}

export function useEntityRiskDetail(entityType: string | null, value: string | null) {
  const ctx = useSessionContext();
  return useQuery({
    queryKey: ["entity-risk-detail", ctx?.tenantId, entityType, value],
    queryFn: () => fetchEntityRiskDetail(ctx!, entityType!, value!),
    enabled: !!ctx && !!entityType && !!value,
  });
}

export function useCorrelationRules() {
  const ctx = useSessionContext();
  return useQuery({
    queryKey: ["correlation-rules", ctx?.tenantId],
    queryFn: () => fetchCorrelationRules(ctx!),
    enabled: !!ctx,
  });
}

export function useRuleDetail(ruleId: string | null) {
  const ctx = useSessionContext();
  return useQuery({
    queryKey: ["rule-detail", ctx?.tenantId, ruleId],
    queryFn: () => fetchRuleDetail(ctx!, ruleId!),
    enabled: !!ctx && !!ruleId,
  });
}

export function useAlerts(filter: AlertFilter = {}) {
  const ctx = useSessionContext();
  const sim = useSession((s) => s.sim);
  return useQuery({
    queryKey: ["alerts", ctx?.tenantId, sim, filter],
    queryFn: () => fetchAlerts(ctx!, filter),
    enabled: !!ctx,
  });
}

export function useAlertDetail(envelopeId: string | null) {
  const ctx = useSessionContext();
  return useQuery({
    queryKey: ["alert-detail", ctx?.tenantId, envelopeId],
    queryFn: () => fetchAlertDetail(ctx!, envelopeId!),
    enabled: !!ctx && !!envelopeId,
  });
}
