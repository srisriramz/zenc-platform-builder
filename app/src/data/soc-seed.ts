import type { AgentMessage, AgentRun, AlertEnvelope, AnalystFeedback, Case, Evidence, NormalizedEvent, Task, TelemetrySourceFamily } from "@/schemas";
import { DEMO_NOW_ISO, minus, secondsBetween } from "@/lib/time";
import { hashString } from "@/lib/prng";
import { ROLES, USERS, TENANT_MAP } from "@/data/platform";
import { runIntake } from "@/lib/soc/intake";
import { groupIntoCases } from "@/lib/soc/grouping";
import { triageCandidate } from "@/lib/soc/triage";
import { investigateCase, investigationConfidence, investigationNeedsHandoff } from "@/lib/soc/investigation";
import { adviseCase } from "@/lib/soc/advisor";
import { enrichCase } from "@/lib/soc/enrichment";
import type { EvalContext } from "@/lib/query/evaluate";
import type { CaseCandidate, IntakeItem, TriageResult } from "@/lib/soc/types";

/**
 * The SOAR intake → triage → investigation layer, assembled once from the
 * alert stream exactly the way a running system would.
 *
 * Seeded outcomes below are the demo's starting point — a few candidates a
 * human has already actioned into Cases (with evidence, tasks, and agent runs
 * attached), the rest still pending in the queue.
 */

export interface SocLayer {
  intakeItems: IntakeItem[];
  candidates: CaseCandidate[];
  triageResults: TriageResult[];
  cases: Case[];
  evidence: Evidence[];
  tasks: Task[];
  /** all case-scoped agent runs (triage, enrichment, investigation, advisor) */
  agentRuns: AgentRun[];
  agentMessages: AgentMessage[];
  /** candidate_id -> case_id for candidates a human has already opened */
  candidateCaseId: Record<string, string>;
}

function caseWorkers(tenantId: string): string[] {
  return USERS.filter((u) =>
    u.roles.some((r) => r.tenant_id === tenantId && ROLES[r.role].permissions.includes("case.work")),
  ).map((u) => u.user_id);
}

function reviewerFor(tenantId: string): string | undefined {
  return USERS.find((u) =>
    u.roles.some((r) => r.tenant_id === tenantId && ROLES[r.role].permissions.includes("evidence.review")),
  )?.user_id;
}

export function caseIdFor(tenantId: string, candidateId: string): string {
  const short = tenantId.replace("tenant-", "").replace(/-/g, "");
  return `case-${short}-${(hashString(candidateId) >>> 0).toString(36)}`;
}

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

function contentHash(s: string): string {
  return `sha256:${(hashString(s) >>> 0).toString(16).padStart(8, "0")}${(hashString(s + "salt") >>> 0).toString(16).padStart(8, "0")}`;
}

// --- agent-run builders ------------------------------------------------------

function triageRun(candidate: CaseCandidate, result: TriageResult, subjectId: string): { run: AgentRun; message: AgentMessage } {
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

function simpleRun(
  opts: {
    agentName: AgentMessage["agent_name"];
    runId: string;
    tenantId: string;
    caseId: string;
    at: string;
    promptVersion: string;
    toolVersion: string;
    toolCalls: { tool_name: string; scope_or_bound: string }[];
    claim: string;
    confidence: number;
    supporting?: string[];
    contradictory?: string[];
    escalated?: boolean;
    escalationReason?: AgentMessage["escalation_reason"];
    policyOutcome?: string;
    elapsed: number;
  },
): { run: AgentRun; message: AgentMessage } {
  const message: AgentMessage = {
    message_id: `${opts.runId}-m1`,
    agent_run_id: opts.runId,
    agent_name: opts.agentName,
    tenant_id: opts.tenantId,
    occurred_at: opts.at,
    prompt_version: opts.promptVersion,
    tool_version: opts.toolVersion,
    input_ref: opts.caseId,
    tool_calls: opts.toolCalls.map((t) => ({ tool_name: t.tool_name, called_at: opts.at, scope_or_bound: t.scope_or_bound })),
    claim: opts.claim,
    confidence: opts.confidence,
    evidence: [
      ...(opts.supporting ?? []).map((e) => ({ evidence_ref: e, supports: true, freshness: opts.at })),
      ...(opts.contradictory ?? []).map((e) => ({ evidence_ref: e, supports: false, freshness: opts.at })),
    ],
    escalated: opts.escalated,
    escalation_reason: opts.escalated ? opts.escalationReason ?? "policy_ambiguous_or_absent" : undefined,
    policy_outcome: opts.policyOutcome,
  };
  const run: AgentRun = {
    agent_run_id: opts.runId,
    tenant_id: opts.tenantId,
    case_id: opts.caseId,
    subject_type: "case",
    started_at: opts.at,
    completed_at: opts.at,
    message_ids: [message.message_id],
    total_tool_calls: opts.toolCalls.length,
    elapsed_seconds: opts.elapsed,
    human_touchpoints: [],
    outcome: opts.escalated ? "escalated_pending_human" : "completed",
    analyst_feedback: null,
  };
  return { run, message };
}

// --- the investigation layer for one seeded case ----------------------------

function investigationLayerForCase(
  theCase: Case,
  linkedAlerts: AlertEnvelope[],
  tenantAlerts: AlertEnvelope[],
  tenantCases: Case[],
  events: NormalizedEvent[],
  evalCtx: EvalContext,
): { evidence: Evidence[]; tasks: Task[]; runs: AgentRun[]; messages: AgentMessage[]; extraRunIds: string[] } {
  const evidence: Evidence[] = [];
  const tasks: Task[] = [];
  const runs: AgentRun[] = [];
  const messages: AgentMessage[] = [];
  const t = theCase.triaged_at ?? theCase.created_at;
  const reviewer = reviewerFor(theCase.tenant_id);
  const techniqueIds = [...new Set(linkedAlerts.flatMap((a) => (a.attack_techniques ?? []).map((x) => x.technique_id)))];

  // 1. Enrichment run (content is recomputed live by the API; the run records the touch)
  const enr = enrichCase(theCase, linkedAlerts, tenantAlerts, tenantCases, minus(t, { minutes: -4 }));
  const enrichRun = simpleRun({
    agentName: "enrichment-agent",
    runId: `run-enrich-${theCase.case_id}`,
    tenantId: theCase.tenant_id,
    caseId: theCase.case_id,
    at: minus(t, { minutes: -4 }),
    promptVersion: "enrichment-agent-prompt-v1.0",
    toolVersion: "asset-lookup-tool-v1.0",
    toolCalls: [
      { tool_name: "asset-lookup", scope_or_bound: `${enr.entities.length} entity/entities` },
      { tool_name: "identity-lookup", scope_or_bound: "one entity per call" },
      { tool_name: "ti-lookup", scope_or_bound: "one indicator per call, cached" },
    ],
    claim: `Attached read-only context for ${enr.entities.length} entities. ${enr.notable[0]}`,
    confidence: 0.7,
    supporting: enr.notable.slice(0, 4),
    elapsed: 8,
  });
  runs.push(enrichRun.run);
  messages.push(enrichRun.message);

  // 2. Investigation run — findings become submitted evidence in custody
  const findings = investigateCase(theCase, linkedAlerts, events, evalCtx);
  const investHandoff = investigationNeedsHandoff(findings);
  const investAt = minus(t, { minutes: -12 });
  const investRun = simpleRun({
    agentName: "investigation-agent",
    runId: `run-investigate-${theCase.case_id}`,
    tenantId: theCase.tenant_id,
    caseId: theCase.case_id,
    at: investAt,
    promptVersion: "investigation-agent-prompt-v1.0",
    toolVersion: "log-search-tool-v2.1",
    toolCalls: [
      { tool_name: "case-read", scope_or_bound: "the assigned case" },
      { tool_name: "log-search", scope_or_bound: `≤5000 events, ≤24h, ${findings.length} bounded quer${findings.length === 1 ? "y" : "ies"}` },
    ],
    claim:
      (findings.length === 0
        ? "Ran bounded queries for the case entities; no corroborating telemetry in the sample. The case rests on the source alert."
        : `Ran ${findings.length} bounded, source-cited quer${findings.length === 1 ? "y" : "ies"}. Drafted ${findings.length} finding(s) as submitted evidence — each cites the events it rests on.`) +
      (investHandoff ? " Confidence is below the hand-off threshold — escalating to a human." : ""),
    confidence: findings.length ? investigationConfidence(findings) : 0.35,
    supporting: findings.map((f) => `finding ${f.finding_id}: ${f.matched_count} events`),
    escalated: investHandoff || undefined,
    escalationReason: investHandoff ? "low_confidence" : undefined,
    policyOutcome: investHandoff
      ? "handed to a human — the finding is too weak to stand on its own"
      : "findings written as evidence in 'submitted' state — a human reviews before they count",
    elapsed: 20,
  });
  runs.push(investRun.run);
  messages.push(investRun.message);

  findings.forEach((f, i) => {
    evidence.push({
      evidence_id: `ev-${(hashString(f.finding_id) >>> 0).toString(36)}`,
      tenant_id: theCase.tenant_id,
      origin: "soc",
      linked_case_id: theCase.case_id,
      reference_type: "note",
      reference: `${f.summary}\n\nquery: ${f.query}\nwindow: ${f.window.fromIso} → ${f.window.toIso}\ncited events: ${f.cited_event_ids.join(", ") || "(none — no corroborating local telemetry)"}`,
      title: `Investigation finding — ${linkedAlerts[i]?.title ?? "entity activity"}`,
      submitted_by: "investigation-agent",
      submitted_at: investAt,
      review_state: "submitted",
      confidence: f.confidence,
      content_hash: contentHash(f.summary + f.query),
    });
  });

  // 3. Advisor run (content recomputed live)
  const adv = adviseCase(theCase, techniqueIds, evidence, minus(t, { minutes: -18 }));
  const advRun = simpleRun({
    agentName: "digital-advisor-agent",
    runId: `run-advisor-${theCase.case_id}`,
    tenantId: theCase.tenant_id,
    caseId: theCase.case_id,
    at: minus(t, { minutes: -18 }),
    promptVersion: "digital-advisor-agent-prompt-v1.0",
    toolVersion: "approved-knowledge-read-tool-v1.0",
    toolCalls: [
      { tool_name: "case-read", scope_or_bound: "the assigned case" },
      { tool_name: "approved-knowledge-read", scope_or_bound: `${adv.based_on.knowledge.length} approved lesson(s)` },
    ],
    claim: adv.recommendation.slice(0, 240) + (adv.recommendation.length > 240 ? "…" : ""),
    confidence: adv.based_on.knowledge.length ? 0.65 : 0.4,
    supporting: adv.based_on.knowledge.map((k) => `knowledge:${k.knowledge_id}`),
    contradictory: adv.caveats.slice(0, 2),
    policyOutcome: "advisory only — the Digital Advisor cannot approve or execute an action",
    elapsed: 10,
  });
  runs.push(advRun.run);
  messages.push(advRun.message);

  // 4. One human evidence item
  const humanEv: Evidence = {
    evidence_id: `ev-h-${(hashString(theCase.case_id) >>> 0).toString(36)}`,
    tenant_id: theCase.tenant_id,
    origin: "soc",
    linked_case_id: theCase.case_id,
    reference_type: "file",
    reference: `seed-fixtures/evidence/${theCase.case_id}-analyst-export.txt`,
    title: humanEvidenceTitle(theCase),
    submitted_by: theCase.owner_id,
    submitted_at: minus(t, { minutes: -30 }),
    review_state: theCase.status === "closed" ? "approved" : "submitted",
    confidence: 0.85,
    content_hash: contentHash(theCase.case_id + "analyst-export"),
    ...(theCase.status === "closed" && reviewer
      ? { reviewer_id: reviewer, reviewed_at: minus(t, { minutes: -90 }), reviewer_comment: "Verified against the source console; consistent with the alert." }
      : {}),
  };
  evidence.push(humanEv);

  // 5. Seed tasks from the advisor's suggestions — mix of done / in progress / open
  adv.suggested_tasks.slice(0, 3).forEach((title, i) => {
    const created = minus(t, { minutes: -25 });
    const isDone = i === 0 && theCase.status !== "triaged";
    tasks.push({
      task_id: `task-${(hashString(theCase.case_id + title) >>> 0).toString(36)}`,
      tenant_id: theCase.tenant_id,
      case_id: theCase.case_id,
      title,
      status: isDone ? "done" : i === 1 ? "in_progress" : "open",
      assignee_id: theCase.owner_id,
      due_at: minus(created, { hours: -(4 + i * 4) }),
      created_at: created,
      created_by: theCase.owner_id,
      source: "agent",
      proposed_by_agent: "digital-advisor-agent",
      ...(isDone ? { completed_at: minus(t, { minutes: -70 }), completed_by: theCase.owner_id } : {}),
    });
  });

  return { evidence, tasks, runs, messages, extraRunIds: runs.map((r) => r.agent_run_id) };
}

function humanEvidenceTitle(c: Case): string {
  if (c.title?.toLowerCase().includes("ransomware")) return "EDR detection export — affected endpoint";
  if (c.title?.toLowerCase().includes("phishing")) return "Mail-gateway delivery log export";
  if (c.title?.toLowerCase().includes("travel")) return "Identity provider sign-in log export";
  if (c.title?.toLowerCase().includes("beacon") || c.title?.toLowerCase().includes("cobalt")) return "EDR process + network export";
  if (c.title?.toLowerCase().includes("scan")) return "ASV scan schedule confirmation (email)";
  return "Analyst evidence export";
}

// --- top-level assembly -----------------------------------------------------

export function buildSocLayer(
  allAlerts: AlertEnvelope[],
  normalizedEvents: NormalizedEvent[],
  familyOf: (telemetrySourceId: string) => TelemetrySourceFamily | undefined,
): SocLayer {
  const socTenantIds = Object.values(TENANT_MAP)
    .filter((t) => t.entitlements.has_soc)
    .map((t) => t.tenant_id);
  const evalCtx: EvalContext = { familyOf };

  const intakeItems: IntakeItem[] = [];
  const candidates: CaseCandidate[] = [];
  const triageResults: TriageResult[] = [];
  const cases: Case[] = [];
  const evidence: Evidence[] = [];
  const tasks: Task[] = [];
  const agentRuns: AgentRun[] = [];
  const agentMessages: AgentMessage[] = [];
  const candidateCaseId: Record<string, string> = {};

  for (const tenantId of socTenantIds) {
    const inbound = allAlerts.filter((a) => a.tenant_id === tenantId);
    const { items, accepted } = runIntake(inbound, tenantId);
    intakeItems.push(...items);

    const tenantCandidates = groupIntoCases(accepted, tenantId);
    candidates.push(...tenantCandidates);

    const owners = caseWorkers(tenantId);
    const acceptedById = new Map(accepted.map((a) => [a.envelope_id, a] as const));
    const tenantSeededCases: Case[] = [];
    const usedRuleSeeds = new Set<string>(); // a rule-id seed opens at most one case

    for (const candidate of tenantCandidates) {
      const members = candidate.envelope_ids.map((id) => acceptedById.get(id)!).filter(Boolean);
      const result = triageCandidate(candidate, members, owners);
      triageResults.push(result);

      const firstEnvelope = candidate.envelope_ids[0];
      const ruleIds = [
        ...new Set(members.flatMap((m) => (m.attack_techniques ?? []).map((x) => x.source_rule_id).filter(Boolean) as string[])),
      ];
      const matchingRuleId = ruleIds.find((rid) => SEED_BY_RULE_ID[rid] && !usedRuleSeeds.has(rid));
      const seed = SEED_BY_FIRST_ENVELOPE[firstEnvelope] ?? (matchingRuleId ? SEED_BY_RULE_ID[matchingRuleId] : undefined);
      if (seed && matchingRuleId && !SEED_BY_FIRST_ENVELOPE[firstEnvelope]) usedRuleSeeds.add(matchingRuleId);
      const subjectId = seed ? caseIdFor(tenantId, candidate.candidate_id) : candidate.candidate_id;

      const { run: tRun, message: tMsg } = triageRun(candidate, result, subjectId);
      agentRuns.push(tRun);
      agentMessages.push(tMsg);

      if (!seed) continue;

      const createdAt = minus(DEMO_NOW_ISO, { hours: seed.createdHoursAgo });
      const triagedAt = seed.triagedHoursAgo != null ? minus(DEMO_NOW_ISO, { hours: seed.triagedHoursAgo }) : undefined;
      const severity = result.recommended_severity;
      const caseId = subjectId;
      candidateCaseId[candidate.candidate_id] = caseId;

      const base: Case = {
        case_id: caseId,
        tenant_id: tenantId,
        title: members[0]?.title ?? "Investigation",
        status: seed.status,
        severity,
        owner_id: seed.owner_id,
        linked_alert_ids: candidate.envelope_ids,
        agent_run_ids: [tRun.agent_run_id],
        sla: slaFor(severity, createdAt),
        created_at: createdAt,
        triaged_at: triagedAt,
      };
      const theCase: Case = seed.closure
        ? {
            ...base,
            status: "closed",
            closed_at: minus(DEMO_NOW_ISO, { hours: seed.closure.closedHoursAgo }),
            closure: { classification: seed.closure.classification, reason: seed.closure.reason, closed_by: seed.owner_id },
            sla: { ...base.sla!, status: base.sla!.status === "breached" ? "breached" : "on_track" },
          }
        : base;

      cases.push(theCase);
      tenantSeededCases.push(theCase);

      tRun.case_id = caseId;
      tRun.human_touchpoints = [
        {
          principal_id: seed.owner_id,
          action: "reviewed",
          at: triagedAt ?? createdAt,
          note: `Confirmed: opened case ${caseId} (${result.recommendation === "open" ? "as recommended" : "against the suppress recommendation"})`,
        },
      ];
    }

    // investigation layer for every seeded case past 'new'
    const tenantAlerts = allAlerts.filter((a) => a.tenant_id === tenantId);
    const tenantEvents = normalizedEvents.filter((e) => e.tenant_id === tenantId);
    for (const theCase of tenantSeededCases) {
      if (theCase.status === "new") continue;
      const linked = theCase.linked_alert_ids.map((id) => tenantAlerts.find((a) => a.envelope_id === id)).filter(Boolean) as AlertEnvelope[];
      const layer = investigationLayerForCase(theCase, linked, tenantAlerts, tenantSeededCases, tenantEvents, evalCtx);
      evidence.push(...layer.evidence);
      tasks.push(...layer.tasks);
      agentRuns.push(...layer.runs);
      agentMessages.push(...layer.messages);
      theCase.agent_run_ids = [...(theCase.agent_run_ids ?? []), ...layer.extraRunIds];
      theCase.evidence_ids = layer.evidence.map((e) => e.evidence_id);
      theCase.task_ids = layer.tasks.map((t) => t.task_id);
    }
  }

  // Backfill analyst feedback on a deterministic subset (closed cases' investigation
  // runs) so the agent-acceptance-rate KPI (lib/soc/reporting.ts) has real signal out
  // of the box instead of every run showing analyst_feedback: null.
  for (const c of cases) {
    if (c.status !== "closed" || !c.closure) continue;
    const investRun = agentRuns.find((r) => r.agent_run_id === `run-investigate-${c.case_id}`);
    if (!investRun) continue;
    const acceptance: NonNullable<AnalystFeedback["acceptance"]> =
      c.closure.classification === "false_positive" || c.closure.classification === "benign_true_positive"
        ? "rejected"
        : c.closure.classification === "duplicate" || c.closure.classification === "suppressed"
          ? "modified"
          : "accepted";
    investRun.analyst_feedback = {
      human_determination:
        acceptance === "accepted"
          ? "Findings held up — closed as reported."
          : acceptance === "rejected"
            ? "Findings didn't hold up on review — closed differently than proposed."
            : "Findings were directionally right but needed adjustment before closing.",
      acceptance,
      maps_to_closure_classification: c.closure.classification,
    };
  }

  return { intakeItems, candidates, triageResults, cases, evidence, tasks, agentRuns, agentMessages, candidateCaseId };
}
