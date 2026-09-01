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
  fetchPlaybooks,
  fetchPlaybookDetail,
  transitionPlaybook,
  planCaseResponse,
  requestAction,
  fetchApprovalQueue,
  approveAction,
  denyAction,
  executeActionRequest,
  rollbackActionRequest,
  fetchActionLog,
  fetchCaseOrchestration,
  fetchKillSwitches,
  fetchSocReport,
  runReportingAgent,
  toggleKillSwitch,
  type AddEvidenceInput,
  type AddTaskInput,
  type CaseFilter,
  type RequestActionInput,
} from "@/mock/api";
import type { CaseStatus, ClosureClassification, PlaybookLifecycleState, TaskStatus } from "@/schemas";
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

export function usePlaybooks() {
  const ctx = useSessionContext();
  return useQuery({ queryKey: ["playbooks", ctx?.tenantId], queryFn: () => fetchPlaybooks(ctx!), enabled: !!ctx });
}

export function usePlaybookDetail(playbookId: string | null) {
  const ctx = useSessionContext();
  return useQuery({
    queryKey: ["playbook-detail", ctx?.tenantId, playbookId],
    queryFn: () => fetchPlaybookDetail(ctx!, playbookId!),
    enabled: !!ctx && !!playbookId,
  });
}

export function useApprovalQueue() {
  const ctx = useSessionContext();
  return useQuery({ queryKey: ["approval-queue", ctx?.tenantId], queryFn: () => fetchApprovalQueue(ctx!), enabled: !!ctx });
}

export function useActionLog() {
  const ctx = useSessionContext();
  return useQuery({ queryKey: ["action-log", ctx?.tenantId], queryFn: () => fetchActionLog(ctx!), enabled: !!ctx });
}

export function useCaseOrchestration(caseId: string | null) {
  const ctx = useSessionContext();
  return useQuery({
    queryKey: ["case-orchestration", ctx?.tenantId, caseId],
    queryFn: () => fetchCaseOrchestration(ctx!, caseId!),
    enabled: !!ctx && !!caseId,
  });
}

export function useKillSwitches() {
  const ctx = useSessionContext();
  return useQuery({ queryKey: ["kill-switches", ctx?.tenantId], queryFn: () => fetchKillSwitches(ctx!), enabled: !!ctx });
}

export function useSocReport() {
  const ctx = useSessionContext();
  return useQuery({ queryKey: ["soc-report", ctx?.tenantId], queryFn: () => fetchSocReport(ctx!), enabled: !!ctx });
}

export function useRunReportingAgent() {
  const ctx = useSessionContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => runReportingAgent(ctx!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["soc-report"] });
      qc.invalidateQueries({ queryKey: ["agent-runs"] });
    },
  });
}

function useSocInvalidation() {
  const qc = useQueryClient();
  return () => {
    for (const k of [
      "intake-queue", "cases", "case-detail", "soc-dashboard", "evidence-queue",
      "agent-runs", "agent-run", "audit", "playbooks", "playbook-detail",
      "approval-queue", "action-log", "case-orchestration", "kill-switches", "policies",
    ]) {
      qc.invalidateQueries({ queryKey: [k] });
    }
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

export function useTransitionPlaybook() {
  const ctx = useSessionContext();
  const invalidate = useSocInvalidation();
  return useMutation({
    mutationFn: ({ playbookId, to, note }: { playbookId: string; to: PlaybookLifecycleState; note?: string }) =>
      transitionPlaybook(ctx!, playbookId, to, note),
    onSuccess: invalidate,
  });
}

export function usePlanCaseResponse() {
  const ctx = useSessionContext();
  const invalidate = useSocInvalidation();
  return useMutation({ mutationFn: (caseId: string) => planCaseResponse(ctx!, caseId), onSuccess: invalidate });
}

export function useRequestAction() {
  const ctx = useSessionContext();
  const invalidate = useSocInvalidation();
  return useMutation({ mutationFn: (input: RequestActionInput) => requestAction(ctx!, input), onSuccess: invalidate });
}

export function useApproveAction() {
  const ctx = useSessionContext();
  const invalidate = useSocInvalidation();
  return useMutation({ mutationFn: (id: string) => approveAction(ctx!, id), onSuccess: invalidate });
}

export function useDenyAction() {
  const ctx = useSessionContext();
  const invalidate = useSocInvalidation();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => denyAction(ctx!, id, reason),
    onSuccess: invalidate,
  });
}

export function useExecuteAction() {
  const ctx = useSessionContext();
  const invalidate = useSocInvalidation();
  return useMutation({ mutationFn: (id: string) => executeActionRequest(ctx!, id), onSuccess: invalidate });
}

export function useRollbackAction() {
  const ctx = useSessionContext();
  const invalidate = useSocInvalidation();
  return useMutation({ mutationFn: (id: string) => rollbackActionRequest(ctx!, id), onSuccess: invalidate });
}

export function useToggleKillSwitch() {
  const ctx = useSessionContext();
  const invalidate = useSocInvalidation();
  return useMutation({
    mutationFn: ({ key, engaged, reason }: { key: string; engaged: boolean; reason?: string }) =>
      toggleKillSwitch(ctx!, key, engaged, reason),
    onSuccess: invalidate,
  });
}
