"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  askAgentToProposeRule,
  fetchAgentRun,
  fetchAgentRuns,
  fetchAgents,
  fetchAlertDetail,
  fetchAlerts,
  fetchCorrelationRules,
  fetchCoverageMatrix,
  fetchEntityRisk,
  fetchEntityRiskDetail,
  fetchEventLineage,
  fetchQuarantineQueue,
  fetchRuleDetail,
  fetchTelemetrySources,
  proposeRule,
  recordAnalystFeedback,
  runRuleRegression,
  searchLogs,
  transitionRule,
  type AlertFilter,
  type LogSearchInput,
  type ProposeRuleInput,
} from "@/mock/api";
import type { AnalystFeedback, RuleLifecycleState } from "@/schemas";
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

export function useCoverageMatrix() {
  const ctx = useSessionContext();
  return useQuery({
    queryKey: ["coverage-matrix", ctx?.tenantId],
    queryFn: () => fetchCoverageMatrix(ctx!),
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

// ---- M3: agents + detection workflow -------------------------------------

export function useAgents() {
  const ctx = useSessionContext();
  return useQuery({ queryKey: ["agents", ctx?.tenantId], queryFn: () => fetchAgents(ctx!), enabled: !!ctx, staleTime: 60_000 });
}

export function useAgentRuns() {
  const ctx = useSessionContext();
  return useQuery({ queryKey: ["agent-runs", ctx?.tenantId], queryFn: () => fetchAgentRuns(ctx!), enabled: !!ctx });
}

export function useAgentRun(runId: string | null) {
  const ctx = useSessionContext();
  return useQuery({
    queryKey: ["agent-run", ctx?.tenantId, runId],
    queryFn: () => fetchAgentRun(ctx!, runId!),
    enabled: !!ctx && !!runId,
  });
}

function useDetectionInvalidation() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["correlation-rules"] });
    qc.invalidateQueries({ queryKey: ["rule-detail"] });
    qc.invalidateQueries({ queryKey: ["agent-runs"] });
    qc.invalidateQueries({ queryKey: ["agent-run"] });
    qc.invalidateQueries({ queryKey: ["alerts"] });
    qc.invalidateQueries({ queryKey: ["detection-analytics"] });
    qc.invalidateQueries({ queryKey: ["audit"] });
  };
}

export function useProposeRule() {
  const ctx = useSessionContext();
  const invalidate = useDetectionInvalidation();
  return useMutation({
    mutationFn: (input: ProposeRuleInput) => proposeRule(ctx!, input),
    onSuccess: invalidate,
  });
}

export function useRunRegression() {
  const ctx = useSessionContext();
  const invalidate = useDetectionInvalidation();
  return useMutation({
    mutationFn: (ruleId: string) => runRuleRegression(ctx!, ruleId),
    onSuccess: invalidate,
  });
}

export function useTransitionRule() {
  const ctx = useSessionContext();
  const invalidate = useDetectionInvalidation();
  return useMutation({
    mutationFn: ({ ruleId, to, note }: { ruleId: string; to: RuleLifecycleState; note?: string }) =>
      transitionRule(ctx!, ruleId, to, note),
    onSuccess: invalidate,
  });
}

export function useAskAgentToProposeRule() {
  const ctx = useSessionContext();
  const invalidate = useDetectionInvalidation();
  return useMutation({
    mutationFn: (techniqueId: string) => askAgentToProposeRule(ctx!, techniqueId),
    onSuccess: invalidate,
  });
}

export function useRecordFeedback() {
  const ctx = useSessionContext();
  const invalidate = useDetectionInvalidation();
  return useMutation({
    mutationFn: ({ runId, feedback }: { runId: string; feedback: AnalystFeedback }) =>
      recordAnalystFeedback(ctx!, runId, feedback),
    onSuccess: invalidate,
  });
}
