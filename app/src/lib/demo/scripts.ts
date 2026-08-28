/**
 * Guided-demo scripts (references/launch-demo-spec.md).
 *
 * Each step is a real beat: a `route` the controller navigates to, a `persona`
 * it signs in as, a presenter note, and an optional `action` that drives real
 * seeded mock state — no step is a static screenshot. Actions are idempotent:
 * they check `vars` (and, where cheap, current state) and no-op if the beat has
 * already run, so Prev/Next and Resume are safe. Failures are swallowed and
 * surfaced by the controller as "couldn't run live — Restart to retry" rather
 * than throwing the walkthrough off the rails.
 *
 * Scoped deliberately smaller than the full spec: two modes (12-minute
 * technical, 5-minute executive), manual navigation only. Autoplay, kiosk mode,
 * and the other walkthroughs in the spec are follow-on work that reuses this
 * same controller.
 */
import * as api from "@/mock/api";
import type { SessionContext } from "@/mock/rbac";

export interface DemoStepContext {
  ctx: SessionContext;
  vars: Record<string, string>;
}

export interface DemoStep {
  id: string;
  title: string;
  /** target route; `:caseId` etc. are resolved from `vars` at navigation time */
  route: string;
  /** the seeded user this step is performed as */
  persona: string;
  /** shown in the controller strip and the /demo outline */
  presenterNote: string;
  /** real mutation / resolution; returns vars to merge. Idempotent. */
  action?: (c: DemoStepContext) => Promise<Record<string, string> | void>;
}

export interface DemoScript {
  id: string;
  label: string;
  audience: string;
  durationLabel: string;
  tenantId: string;
  summary: string;
  steps: DemoStep[];
}

const NWB = "tenant-northwind-bank";
const PRIYA = "user-priya-analyst"; // analyst @ NWB — telemetry, cases, request actions
const DANA = "user-dana-approver"; // approver @ NWB — the independent second set of eyes
const AVA = "user-ava-ciso"; // ciso @ NWB — read-only executive view

/** Resolve `:name` placeholders in a route against the running script's vars. */
export function resolveRoute(route: string, vars: Record<string, string>): string {
  const resolved = route.replace(/:(\w+)/g, (_m, key: string) => vars[key] ?? "");
  // a placeholder that never got filled (e.g. no case opened) — fall back to the list
  if (resolved.includes("//") || resolved.endsWith("/")) return route.split("/:")[0] || "/";
  return resolved;
}

// --- action helpers -------------------------------------------------------

async function tryPlan(ctx: SessionContext, caseId: string) {
  try {
    return (await api.planCaseResponse(ctx, caseId)).plan;
  } catch {
    return null;
  }
}

const SEV_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, informational: 0 };

// --- the 12-minute technical walkthrough ---------------------------------

const technical: DemoScript = {
  id: "technical-12min",
  label: "Technical walkthrough",
  audience: "Analyst / technical buyer",
  durationLabel: "~12 min",
  tenantId: NWB,
  summary:
    "Telemetry → a deterministic correlation rule fires → the alert crosses into SOAR through the envelope contract → agents triage, enrich and investigate → an analyst requests a response → a different person approves it → the deterministic executor runs it as a dry-run and verifies it → the case closes → it all rolls up to the executive view.",
  steps: [
    {
      id: "dashboard",
      title: "Start of shift — SIEM dashboard",
      route: "/siem-dashboard",
      persona: PRIYA,
      presenterNote:
        "This is where a SOC analyst starts. Everything on screen is seeded synthetic data on a frozen clock — but it behaves like a live product, not a slide deck.",
    },
    {
      id: "telemetry",
      title: "Telemetry & connectors",
      route: "/telemetry",
      persona: PRIYA,
      presenterNote:
        "Every telemetry source is synthetic, but each carries real connector health. A family with no healthy connector is an honest visibility gap — we don't paper over it.",
    },
    {
      id: "logs",
      title: "Log Explorer — the data is queryable",
      route: "/log-explorer",
      persona: PRIYA,
      presenterNote:
        "The corpus is real and queryable, not a screenshot. Run a query against the seeded telemetry to establish that before anything correlates.",
    },
    {
      id: "correlation",
      title: "A correlation rule fires",
      route: "/correlation",
      persona: PRIYA,
      presenterNote:
        "A deterministic correlation rule produced this alert — no LLM decided the match. The alert carries a structured ATT&CK technique claim you can click straight through to the specific contributing events.",
    },
    {
      id: "intake",
      title: "The alert crosses into SOAR",
      route: "/alerts",
      persona: PRIYA,
      presenterNote:
        "The alert enters the Respond product through the alert-envelope contract — the exact same path a third-party EDR uses. The Intake Agent normalized it; nothing here is a private back-channel.",
    },
    {
      id: "open-case",
      title: "Analyst opens a case",
      route: "/cases/:caseId",
      persona: PRIYA,
      presenterNote:
        "The analyst confirms the triage recommendation and a case opens. Every step from here operates on real case state that you can inspect afterwards.",
      action: async ({ ctx, vars }) => {
        if (vars.caseId) return;
        try {
          const q = await api.fetchIntakeQueue(ctx);
          const cand = q.pending[0];
          if (cand) {
            const { case_id } = await api.confirmCaseOpen(ctx, cand.candidate.candidate_id);
            return { caseId: case_id };
          }
        } catch {
          /* fall through to a seeded case */
        }
        const cases = await api.fetchCases(ctx, {});
        const pick =
          cases.find((c) => c.status === "triaged") ?? cases.find((c) => c.status !== "closed") ?? cases[0];
        if (pick) return { caseId: pick.case_id };
      },
    },
    {
      id: "triage",
      title: "Triage rationale on the case",
      route: "/cases/:caseId",
      persona: PRIYA,
      presenterNote:
        "The Triage Agent's severity and grouping call — with its rationale — is on the Overview tab. The analyst moves the case into investigation.",
      action: async ({ ctx, vars }) => {
        if (!vars.caseId) return;
        try {
          const cases = await api.fetchCases(ctx, {});
          const c = cases.find((x) => x.case_id === vars.caseId);
          if (c && (c.status === "triaged" || c.status === "new")) {
            await api.setCaseStatus(ctx, vars.caseId, "investigating", "Guided demo — beginning investigation.");
          }
        } catch {
          /* non-fatal */
        }
      },
    },
    {
      id: "enrich",
      title: "Enrichment Agent attaches context",
      route: "/cases/:caseId",
      persona: PRIYA,
      presenterNote:
        "The Enrichment Agent pulls asset owner, identity and threat-intel context onto the case — every item cited, nothing asserted without a source.",
      action: async ({ ctx, vars }) => {
        if (!vars.caseId || vars.enriched) return;
        try {
          await api.runCaseAgent(ctx, vars.caseId, "enrichment");
          return { enriched: "1" };
        } catch {
          /* non-fatal */
        }
      },
    },
    {
      id: "investigate",
      title: "Investigation Agent drafts findings",
      route: "/cases/:caseId",
      persona: PRIYA,
      presenterNote:
        "The Investigation Agent drafts findings against the seeded telemetry, each with the query that produced it. If its confidence is low it escalates to a human instead of guessing.",
      action: async ({ ctx, vars }) => {
        if (!vars.caseId || vars.investigated) return;
        try {
          await api.runCaseAgent(ctx, vars.caseId, "investigation");
          return { investigated: "1" };
        } catch {
          /* non-fatal */
        }
      },
    },
    {
      id: "agent-trail",
      title: "The agent trail is inspectable",
      route: "/agents/runs",
      persona: PRIYA,
      presenterNote:
        "Every agent run is on the record — prompt version, each tool call with its scope bound, evidence refs, and whether a human touched it. This is the audit surface a reviewer works from.",
    },
    {
      id: "plan",
      title: "Response Planner proposes a step",
      route: "/cases/:caseId",
      persona: PRIYA,
      presenterNote:
        "The Response Planner matches an enabled playbook to the case and proposes a step — labelled with its action class and D3FEND mapping. It drafts only; it cannot submit anything for execution.",
      action: async ({ ctx, vars }) => {
        if (vars.actionType) return;
        let caseId = vars.caseId;
        let plan = caseId ? await tryPlan(ctx, caseId) : null;
        let a3 = plan?.steps.find((s) => s.action_class === "A3");
        if (!a3) {
          // fall back to a seeded case that has a matching containment playbook
          const cases = await api.fetchCases(ctx, {});
          for (const alt of cases.filter((c) => c.status !== "closed" && c.case_id !== vars.caseId)) {
            const p = await tryPlan(ctx, alt.case_id);
            const s = p?.steps.find((x) => x.action_class === "A3");
            if (p && s) {
              caseId = alt.case_id;
              plan = p;
              a3 = s;
              break;
            }
          }
        }
        if (plan && a3) {
          return {
            caseId: caseId ?? "",
            playbookId: plan.playbook_id ?? "",
            stepId: a3.step_id,
            actionType: a3.action_type,
            actionTarget: a3.target ?? "",
            actionSummary: a3.description ?? "",
          };
        }
      },
    },
    {
      id: "request",
      title: "Analyst requests the action",
      route: "/cases/:caseId",
      persona: PRIYA,
      presenterNote:
        "The analyst submits the step for approval. The action is dry-run — the flag is fixed, not a toggle the analyst can flip. They cannot approve it themselves.",
      action: async ({ ctx, vars }) => {
        if (vars.actionRequestId || !vars.caseId || !vars.actionType) return;
        try {
          const res = await api.requestAction(ctx, {
            case_id: vars.caseId,
            playbook_id: vars.playbookId || undefined,
            playbook_step_id: vars.stepId || undefined,
            action_class: "A3",
            action_type: vars.actionType,
            summary: vars.actionSummary || undefined,
            target: vars.actionTarget || undefined,
          });
          return { actionRequestId: res.action_request_id };
        } catch {
          /* non-fatal */
        }
      },
    },
    {
      id: "approve",
      title: "A different person approves",
      route: "/approvals",
      persona: DANA,
      presenterNote:
        "We are now signed in as Dana, an Approver — a different person. Watch the principal names: the requester can never approve their own action. This separation is enforced, not a convention.",
      action: async ({ ctx, vars }) => {
        if (!vars.actionRequestId) return;
        try {
          const q = await api.fetchApprovalQueue(ctx);
          const row = q.rows.find((r) => r.request.action_request_id === vars.actionRequestId);
          if (row) await api.approveAction(ctx, vars.actionRequestId);
        } catch {
          /* non-fatal */
        }
      },
    },
    {
      id: "execute",
      title: "Deterministic executor runs the dry-run",
      route: "/actions",
      persona: PRIYA,
      presenterNote:
        "Back as the analyst. The Response Executor is a deterministic service, not an agent — it runs the action as a dry-run and then verifies it. The rollback path is right here, demonstrable, not just claimed.",
      action: async ({ ctx, vars }) => {
        if (!vars.actionRequestId || vars.executed) return;
        try {
          const log = await api.fetchActionLog(ctx);
          const row = log.find((a) => a.request.action_request_id === vars.actionRequestId);
          if (row && ["verified", "executed", "rolled_back"].includes(row.request.status)) return { executed: "1" };
          await api.executeActionRequest(ctx, vars.actionRequestId);
          return { executed: "1" };
        } catch {
          /* non-fatal */
        }
      },
    },
    {
      id: "close",
      title: "Case closes with a classification",
      route: "/cases/:caseId",
      persona: PRIYA,
      presenterNote:
        "The analyst closes the case with a closure classification. Nothing about the response touched a production system — it was a dry-run start to finish.",
      action: async ({ ctx, vars }) => {
        if (!vars.caseId) return;
        try {
          const cases = await api.fetchCases(ctx, {});
          const c = cases.find((x) => x.case_id === vars.caseId);
          if (c && c.status !== "closed") {
            await api.closeCase(
              ctx,
              vars.caseId,
              "true_positive",
              "Guided demo — response executed as a dry-run and verified; closing the case.",
            );
          }
        } catch {
          /* non-fatal */
        }
      },
    },
    {
      id: "summary",
      title: "It rolls up to the executive view",
      route: "/analytics?view=executive",
      persona: AVA,
      presenterNote:
        "And the executive altitude: MTTD to MTTR, where the pipeline time actually goes, detection and defensive coverage — every number rolled up from exactly the steps we just walked, for the CISO who was never in the console.",
    },
  ],
};

// --- the 5-minute executive walkthrough (read-only) ----------------------

const executive: DemoScript = {
  id: "executive-5min",
  label: "Executive walkthrough",
  audience: "CISO / executive buyer",
  durationLabel: "~5 min",
  tenantId: NWB,
  summary:
    "Posture first — coverage and mean-time metrics — then one incident end to end, its dry-run response, and the board-ready narrative the Reporting Agent drafts. No console operations; entirely read-only.",
  steps: [
    {
      id: "posture",
      title: "Security posture at a glance",
      route: "/analytics?view=executive",
      persona: AVA,
      presenterNote:
        "Start with posture: ATT&CK detection coverage, defensive (response) coverage, MTTD through MTTR, and how many critical incidents are open right now.",
    },
    {
      id: "operations",
      title: "The operational picture underneath",
      route: "/soc-dashboard",
      persona: AVA,
      presenterNote:
        "One level down: queue depth, analyst workload, SLA position. This is what the numbers above are built from — the CISO can drill without needing an analyst seat.",
    },
    {
      id: "incident",
      title: "One incident, end to end",
      route: "/cases/:caseId",
      persona: AVA,
      presenterNote:
        "A single incident. The timeline shows detection, which agents assisted, the approved response, and the closure classification — the whole arc on one screen.",
      action: async ({ ctx, vars }) => {
        if (vars.caseId) return;
        const cases = await api.fetchCases(ctx, {});
        const pick = [...cases].sort((a, b) => (SEV_RANK[b.severity ?? ""] ?? 0) - (SEV_RANK[a.severity ?? ""] ?? 0))[0];
        if (pick) return { caseId: pick.case_id };
      },
    },
    {
      id: "response",
      title: "Every response was a dry-run",
      route: "/actions",
      persona: AVA,
      presenterNote:
        "Each response action, its approval, its verification, and its rollback path. Nothing here touched production — that is the standing guarantee, visible on the record.",
    },
    {
      id: "report",
      title: "The board-ready narrative",
      route: "/reporting",
      persona: AVA,
      presenterNote:
        "The Reporting Agent drafts the narrative from these same KPIs — and marks it a draft that needs human sign-off before it leaves the building. The agent writes; a person signs.",
    },
  ],
};

export const DEMO_SCRIPTS: DemoScript[] = [technical, executive];

export function getDemoScript(id: string): DemoScript | undefined {
  return DEMO_SCRIPTS.find((s) => s.id === id);
}
