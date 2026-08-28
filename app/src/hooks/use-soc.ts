"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assignCaseOwner,
  closeCase,
  confirmCaseOpen,
  fetchCaseDetail,
  fetchCases,
  fetchIntakeQueue,
  fetchSocDashboard,
  setCaseStatus,
  suppressCandidate,
  type CaseFilter,
} from "@/mock/api";
import type { CaseStatus, ClosureClassification } from "@/schemas";
import { useSession } from "@/store/session";
import { useSessionContext } from "./use-platform";

export function useIntakeQueue() {
  const ctx = useSessionContext();
  const sim = useSession((s) => s.sim);
  return useQuery({
    queryKey: ["intake-queue", ctx?.tenantId, sim],
    queryFn: () => fetchIntakeQueue(ctx!),
    enabled: !!ctx,
  });
}

export function useCases(filter: CaseFilter = {}) {
  const ctx = useSessionContext();
  const sim = useSession((s) => s.sim);
  return useQuery({
    queryKey: ["cases", ctx?.tenantId, sim, filter],
    queryFn: () => fetchCases(ctx!, filter),
    enabled: !!ctx,
  });
}

export function useCaseDetail(caseId: string | null) {
  const ctx = useSessionContext();
  return useQuery({
    queryKey: ["case-detail", ctx?.tenantId, caseId],
    queryFn: () => fetchCaseDetail(ctx!, caseId!),
    enabled: !!ctx && !!caseId,
  });
}

export function useSocDashboard() {
  const ctx = useSessionContext();
  return useQuery({
    queryKey: ["soc-dashboard", ctx?.tenantId],
    queryFn: () => fetchSocDashboard(ctx!),
    enabled: !!ctx,
  });
}

function useSocInvalidation() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["intake-queue"] });
    qc.invalidateQueries({ queryKey: ["cases"] });
    qc.invalidateQueries({ queryKey: ["case-detail"] });
    qc.invalidateQueries({ queryKey: ["soc-dashboard"] });
    qc.invalidateQueries({ queryKey: ["agent-runs"] });
    qc.invalidateQueries({ queryKey: ["audit"] });
  };
}

export function useConfirmCaseOpen() {
  const ctx = useSessionContext();
  const invalidate = useSocInvalidation();
  return useMutation({
    mutationFn: (candidateId: string) => confirmCaseOpen(ctx!, candidateId),
    onSuccess: invalidate,
  });
}

export function useSuppressCandidate() {
  const ctx = useSessionContext();
  const invalidate = useSocInvalidation();
  return useMutation({
    mutationFn: ({ candidateId, reason }: { candidateId: string; reason: string }) =>
      suppressCandidate(ctx!, candidateId, reason),
    onSuccess: invalidate,
  });
}

export function useSetCaseStatus() {
  const ctx = useSessionContext();
  const invalidate = useSocInvalidation();
  return useMutation({
    mutationFn: ({ caseId, to, note }: { caseId: string; to: CaseStatus; note?: string }) =>
      setCaseStatus(ctx!, caseId, to, note),
    onSuccess: invalidate,
  });
}

export function useAssignCaseOwner() {
  const ctx = useSessionContext();
  const invalidate = useSocInvalidation();
  return useMutation({
    mutationFn: ({ caseId, ownerId }: { caseId: string; ownerId: string }) => assignCaseOwner(ctx!, caseId, ownerId),
    onSuccess: invalidate,
  });
}

export function useCloseCase() {
  const ctx = useSessionContext();
  const invalidate = useSocInvalidation();
  return useMutation({
    mutationFn: ({ caseId, classification, reason }: { caseId: string; classification: ClosureClassification; reason?: string }) =>
      closeCase(ctx!, caseId, classification, reason),
    onSuccess: invalidate,
  });
}
