import type { AgentMessage, AgentRun, AlertEnvelope, Case } from "@/schemas";
import { DEMO_NOW_ISO, minus, secondsBetween } from "@/lib/time";
import { hashString } from "@/lib/prng";
import { ROLES, USERS, TENANT_MAP } from "@/data/platform";
import { runIntake } from "@/lib/soc/intake";
import { groupIntoCases } from "@/lib/soc/grouping";
import { triageCandidate } from "@/lib/soc/triage";
import type { CaseCandidate, IntakeItem, TriageResult } from "@/lib/soc/types";

/**
 * The SOAR intake & triage layer, assembled once from the alert stream (native
 * ZenC SIEM alerts + the seeded third-party fixtures) exactly the way a running
 * system would: intake → grouping → triage recommendation → human decision.
 *
 * Seeded outcomes below are the demo's starting point — a few candidates a
 * human has already actioned into Cases, the rest still pending in the queue.
 */

export interface SocLayer {
  intakeItems: IntakeItem[];
  candidates: CaseCandidate[];
  triageResults: TriageResult[];
  triageRuns: AgentRun[];
  triageMessages: AgentMessage[];
  cases: Case[];
  /** candidate_id -> case_id for candidates a human has already opened */
  candidateCaseId: Record<string, string>;
}

/** users whose role in a tenant grants case.work — the Triage Agent's owner pool */
function caseWorkers(tenantId: string): string[] {
  return USERS.filter((u) =>
    u.roles.some((r) => r.tenant_id === tenantId && ROLES[r.role].permissions.includes("case.work")),
  ).map((u) => u.user_id);
}

export function caseIdFor(tenantId: string, candidateId: string): string {
  const short = tenantId.replace("tenant-", "").replace(/-/g, "");
  return `case-${short}-${(hashString(candidateId) >>> 0).toString(36)}`;
}

/**
 * Which candidates start life as Cases, keyed by the lexicographically-first
 * envelope in the group (stable and readable), plus one keyed by a native
 * producing-rule id. Everything else stays pending in the intake queue.
 */
type SeedState = {
  status: Case["status"];
  owner_id: string;
  createdHoursAgo: number;
  triagedHoursAgo?: number;
  closure?: { classification: NonNullable<Case["closure"]>["classification"]; reason?: string; closedHoursAgo: number };
};

const SEED_BY_FIRST_ENVELOPE: Record<string, SeedState> = {
  "env-tp-scu-0001": { status: "investigating", owner_id: "user-priya-analyst", createdHoursAgo: 3, triagedHoursAgo: 3 },
  "env-tp-scu-0002": { status: "triaged", owner_id: "user-priya-analyst", createdHoursAgo: 8, triagedHoursAgo: 7 },
  "env-tp-scu-0003": {
    status: "closed",
    owner_id: "user-priya-analyst",
    createdHoursAgo: 11,
    triagedHoursAgo: 10,
    closure: { classification: "true_positive", reason: "6 mailboxes confirmed delivered; messages purged, sender blocked, users notified.", closedHoursAgo: 6 },
  },
  "env-tp-nwb-0001": { status: "investigating", owner_id: "user-priya-analyst", createdHoursAgo: 5, triagedHoursAgo: 5 },
};

/** native-alert candidates seeded as cases, keyed by a contributing rule id */
const SEED_BY_RULE_ID: Record<string, SeedState> = {
  "rule-nwb-cred-brute-force": { status: "triaged", owner_id: "user-marcus-senior", createdHoursAgo: 9, triagedHoursAgo: 8 },
  "rule-nwb-external-port-scan": {
    status: "closed",
    owner_id: "user-marcus-senior",
    createdHoursAgo: 16,
    triagedHoursAgo: 15,
    closure: { classification: "false_positive", reason: "Source matched the scheduled external ASV scan window; confirmed with the vulnerability-management team.", closedHoursAgo: 12 },
  },
};

const SLA_HOURS: Record<string, number> = { critical: 4, high: 8, medium: 24, low: 72, informational: 72 };

function slaFor(severity: string, createdAtIso: string): NonNullable<Case["sla"]> {
  const dueAt = minus(createdAtIso, { hours: -(SLA_HOURS[severity] ?? 24) });
  const remainingS = secondsBetween(DEMO_NOW_ISO, dueAt);
  const totalS = (SLA_HOURS[severity] ?? 24) * 3600;
  const status = remainingS <= 0 ? "breached" : remainingS < totalS * 0.25 ? "at_risk" : "on_track";
  return { due_at: dueAt, status };
}

function triageRun(
  candidate: CaseCandidate,
  result: TriageResult,
  subjectId: string,
): { run: AgentRun; message: AgentMessage } {
  const runId = `run-triage-${candidate.candidate_id}`;
  const at = minus(candidate.last_occurred_at, { minutes: -3 });
  const message: AgentMessage = {
    message_id: `${runId}-m1`,
    agent_run_id: runId,
    agent_name: "triage-agent",
    tenant_id: candidate.tenant_id,
    occurred_at: at,
    prompt_version: "triage-agent-prompt-v1.0",
    tool_version: "alert-read-tool-v1.1",
    input_ref: candidate.candidate_id,
    tool_calls: [
      { tool_name: "alert-read", called_at: at, scope_or_bound: `${candidate.envelope_ids.length} envelope(s)` },
      { tool_name: "case-history-read", called_at: at, scope_or_bound: "last 30 days, same tenant" },
    ],
    claim: result.claim,
    confidence: result.confidence,
    evidence: [
      ...result.supporting.map((e) => ({ evidence_ref: e, supports: true, freshness: at })),
      ...result.contradictory.map((e) => ({ evidence_ref: e, supports: false, freshness: at })),
    ],
    escalated: true,
    escalation_reason: "policy_ambiguous_or_absent",
    policy_outcome: `recommendation "${result.recommendation}" handed to a human — the Triage Agent cannot open or suppress a case (L2)`,
  };
  const run: AgentRun = {
    agent_run_id: runId,
    tenant_id: candidate.tenant_id,
    case_id: subjectId,
    subject_type: "case",
    started_at: at,
    completed_at: at,
    message_ids: [message.message_id],
    total_tool_calls: 2,
    elapsed_seconds: 6,
    human_touchpoints: [],
    outcome: "escalated_pending_human",
    analyst_feedback: null,
  };
  return { run, message };
}

export function buildSocLayer(allAlerts: AlertEnvelope[]): SocLayer {
  const socTenantIds = Object.values(TENANT_MAP)
    .filter((t) => t.entitlements.has_soc)
    .map((t) => t.tenant_id);

  const intakeItems: IntakeItem[] = [];
  const candidates: CaseCandidate[] = [];
  const triageResults: TriageResult[] = [];
  const triageRuns: AgentRun[] = [];
  const triageMessages: AgentMessage[] = [];
  const cases: Case[] = [];
  const candidateCaseId: Record<string, string> = {};

  for (const tenantId of socTenantIds) {
    const inbound = allAlerts.filter((a) => a.tenant_id === tenantId);
    const { items, accepted } = runIntake(inbound, tenantId);
    intakeItems.push(...items);

    const tenantCandidates = groupIntoCases(accepted, tenantId);
    candidates.push(...tenantCandidates);

    const owners = caseWorkers(tenantId);
    const acceptedById = new Map(accepted.map((a) => [a.envelope_id, a] as const));

    for (const candidate of tenantCandidates) {
      const members = candidate.envelope_ids.map((id) => acceptedById.get(id)!).filter(Boolean);
      const result = triageCandidate(candidate, members, owners);
      triageResults.push(result);

      const firstEnvelope = candidate.envelope_ids[0];
      const ruleIds = new Set(
        members.flatMap((m) => (m.attack_techniques ?? []).map((t) => t.source_rule_id).filter(Boolean) as string[]),
      );
      const seed =
        SEED_BY_FIRST_ENVELOPE[firstEnvelope] ??
        [...ruleIds].map((rid) => SEED_BY_RULE_ID[rid]).find(Boolean);

      const subjectId = seed ? caseIdFor(tenantId, candidate.candidate_id) : candidate.candidate_id;
      const { run, message } = triageRun(candidate, result, subjectId);
      triageRuns.push(run);
      triageMessages.push(message);

      if (!seed) continue;

      const createdAt = minus(DEMO_NOW_ISO, { hours: seed.createdHoursAgo });
      const triagedAt = seed.triagedHoursAgo != null ? minus(DEMO_NOW_ISO, { hours: seed.triagedHoursAgo }) : undefined;
      const severity = result.recommended_severity;
      const caseId = subjectId;
      candidateCaseId[candidate.candidate_id] = caseId;

      const title = members[0]?.title ?? "Investigation";
      const base: Case = {
        case_id: caseId,
        tenant_id: tenantId,
        title,
        status: seed.status,
        severity,
        owner_id: seed.owner_id,
        linked_alert_ids: candidate.envelope_ids,
        agent_run_ids: [run.agent_run_id],
        sla: slaFor(severity, createdAt),
        created_at: createdAt,
        triaged_at: triagedAt,
      };

      if (seed.closure) {
        const closedAt = minus(DEMO_NOW_ISO, { hours: seed.closure.closedHoursAgo });
        cases.push({
          ...base,
          status: "closed",
          closed_at: closedAt,
          closure: { classification: seed.closure.classification, reason: seed.closure.reason, closed_by: seed.owner_id },
          sla: { ...base.sla!, status: base.sla!.status === "breached" ? "breached" : "on_track" },
        });
      } else {
        cases.push(base);
      }

      run.case_id = caseId;
      run.human_touchpoints = [
        {
          principal_id: seed.owner_id,
          action: "reviewed",
          at: triagedAt ?? createdAt,
          note: `Confirmed: opened case ${caseId} (${result.recommendation === "open" ? "as recommended" : "against the suppress recommendation"})`,
        },
      ];
    }
  }

  return { intakeItems, candidates, triageResults, triageRuns, triageMessages, cases, candidateCaseId };
}
