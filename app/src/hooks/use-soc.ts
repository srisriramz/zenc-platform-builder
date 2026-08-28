"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addCaseEvidence,
  addCaseTask,
  assignCaseOwner,
  closeCase,
  confirmCaseOpen,
  fetchCaseDetail,
  fetchCases,
  fetchEvidenceQueue,
  fetchIntakeQueue,
  fetchSocDashboard,
  huntQuery,
  openCaseFromHunt,
  reviewEvidence,
  runCaseAgent,
  setCaseStatus,
  suppressCandidate,
  updateTaskStatus,
  type AddEvidenceInput,
  type AddTaskInput,
  type CaseFilter,
} from "@/mock/api";
import type { CaseStatus, ClosureClassification, TaskStatus } from "@/schemas";
import type { HuntInput } from "@/lib/soc/hunt";
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

export function useEvidenceQueue(filter: { state?: string } = {}) {
  const ctx = useSessionContext();
  return useQuery({
    queryKey: ["evidence-queue", ctx?.tenantId, filter],
    queryFn: () => fetchEvidenceQueue(ctx!, filter),
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
    qc.invalidateQueries({ queryKey: ["evidence-queue"] });
    qc.invalidateQueries({ queryKey: ["agent-runs"] });
    qc.invalidateQueries({ queryKey: ["agent-run"] });
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

export function useAddEvidence() {
  const ctx = useSessionContext();
  const invalidate = useSocInvalidation();
  return useMutation({ mutationFn: (input: AddEvidenceInput) => addCaseEvidence(ctx!, input), onSuccess: invalidate });
}

export function useReviewEvidence() {
  const ctx = useSessionContext();
  const invalidate = useSocInvalidation();
  return useMutation({
    mutationFn: ({ evidenceId, decision, comment }: { evidenceId: string; decision: "approved" | "rejected" | "under_review"; comment?: string }) =>
      reviewEvidence(ctx!, evidenceId, decision, comment),
    onSuccess: invalidate,
  });
}

export function useAddTask() {
  const ctx = useSessionContext();
  const invalidate = useSocInvalidation();
  return useMutation({ mutationFn: (input: AddTaskInput) => addCaseTask(ctx!, input), onSuccess: invalidate });
}

export function useUpdateTaskStatus() {
  const ctx = useSessionContext();
  const invalidate = useSocInvalidation();
  return useMutation({
    mutationFn: ({ taskId, to }: { taskId: string; to: TaskStatus }) => updateTaskStatus(ctx!, taskId, to),
    onSuccess: invalidate,
  });
}

export function useRunCaseAgent() {
  const ctx = useSessionContext();
  const invalidate = useSocInvalidation();
  return useMutation({
    mutationFn: ({ caseId, agent }: { caseId: string; agent: "enrichment" | "investigation" | "advisor" }) =>
      runCaseAgent(ctx!, caseId, agent),
    onSuccess: invalidate,
  });
}

export function useHuntQuery() {
  const ctx = useSessionContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: HuntInput) => huntQuery(ctx!, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-runs"] }),
  });
}

export function useOpenCaseFromHunt() {
  const ctx = useSessionContext();
  const invalidate = useSocInvalidation();
  return useMutation({
    mutationFn: (input: { eventIds: string[]; title: string }) => openCaseFromHunt(ctx!, input),
    onSuccess: invalidate,
  });
}
