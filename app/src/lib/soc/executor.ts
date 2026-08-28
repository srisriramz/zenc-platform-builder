/**
 * The deterministic Response Executor. It is NOT an agent (SKILL.md
 * non-negotiable #2) — no LLM, no judgement. It only ever acts on an already
 * `approved` action-request and does exactly what the request says.
 *
 * Required mechanics (soc-spec.md, agentic-architecture.md):
 *  1. precondition re-check immediately before running (state may have moved)
 *  2. kill-switch halt — global / partner / tenant, each halts pending AND
 *     in-flight execution (a multi-step playbook stops between steps)
 *  3. idempotent execution — safe to retry, safe if already applied
 *  4. a verification step afterward (did the intended state actually change?)
 *  5. a rollback path for reversible actions; irreversible ones are marked
 *     BEFORE execution, not after
 *
 * Everything is dry-run / simulation-only in this build.
 */
import type { ActionRequest } from "@/schemas";
import { isExecutable } from "./action-approval";

/** action types that can be undone once applied */
const REVERSIBLE_ACTION_TYPES = new Set([
  "isolate_host",
  "block_ip",
  "block_domain",
  "disable_account",
  "revoke_sessions",
  "quarantine_message",
  "add_firewall_rule",
]);

export function isReversible(actionType: string): boolean {
  return REVERSIBLE_ACTION_TYPES.has(actionType);
}

export interface ExecutorContext {
  killSwitch: { global: boolean; partner: boolean; tenant: boolean; engaged_reason?: string };
  caseOpen: boolean;
  executedBy: string;
  nowIso: string;
}

export type ExecutionOutcome =
  | {
      ok: true;
      patch: Pick<ActionRequest, "status" | "execution" | "verification" | "rollback">;
      idempotent_noop: boolean;
    }
  | { ok: false; code: "not_approved" | "expired" | "kill_switch" | "precondition_failed"; message: string };

export function executeAction(request: ActionRequest, ctx: ExecutorContext): ExecutionOutcome {
  // idempotency — already executed → return the recorded result, do nothing new
  if ((request.status === "executed" || request.status === "verified") && request.execution) {
    return {
      ok: true,
      idempotent_noop: true,
      patch: { status: request.status, execution: request.execution, verification: request.verification, rollback: request.rollback },
    };
  }

  // 1. only an approved, non-expired request may execute
  const gate = isExecutable(request, ctx.nowIso);
  if (!gate.ok) {
    return { ok: false, code: gate.code === "expired" ? "expired" : "not_approved", message: gate.message };
  }

  // 2. kill-switch halt (any scope) — halts pending AND in-flight
  const engaged =
    ctx.killSwitch.global ? "global" : ctx.killSwitch.partner ? "partner" : ctx.killSwitch.tenant ? "tenant" : null;
  if (engaged) {
    return {
      ok: false,
      code: "kill_switch",
      message: `Execution halted — the ${engaged} kill switch is engaged${ctx.killSwitch.engaged_reason ? ` (${ctx.killSwitch.engaged_reason})` : ""}. Pending and in-flight actions are both stopped for this scope.`,
    };
  }

  // 3. precondition re-check — the case must still be open
  if (!ctx.caseOpen) {
    return { ok: false, code: "precondition_failed", message: "Precondition re-check failed: the case is no longer open." };
  }

  // 4. execute (dry-run) + verification + rollback marker
  const reversible = request.reversible ?? isReversible(request.action_type);
  const targetPart = request.target ? ` on ${request.target}` : "";
  return {
    ok: true,
    idempotent_noop: false,
    patch: {
      status: "verified",
      execution: {
        executed_at: ctx.nowIso,
        executed_by: ctx.executedBy,
        precondition_recheck_passed: true,
        idempotent_noop: false,
        result_note: `DRY RUN — ${request.action_type}${targetPart} simulated. No real change was made.`,
      },
      verification: {
        verified_at: ctx.nowIso,
        outcome_confirmed: true,
        notes: `DRY RUN — simulated post-state is consistent with the requested action.`,
      },
      rollback: { reversible },
    },
  };
}

export type RollbackOutcome =
  | { ok: true; patch: Pick<ActionRequest, "status" | "rollback"> }
  | { ok: false; code: "not_executed" | "irreversible"; message: string };

export function rollbackAction(request: ActionRequest, ctx: { rolledBackBy: string; nowIso: string }): RollbackOutcome {
  if (request.status !== "executed" && request.status !== "verified") {
    return { ok: false, code: "not_executed", message: "Only an executed action can be rolled back." };
  }
  const reversible = request.rollback?.reversible ?? request.reversible ?? isReversible(request.action_type);
  if (!reversible) {
    return { ok: false, code: "irreversible", message: "This action was marked irreversible before execution — there is no rollback path." };
  }
  return {
    ok: true,
    patch: {
      status: "rolled_back",
      rollback: { reversible: true, rolled_back_at: ctx.nowIso, rolled_back_by: ctx.rolledBackBy },
    },
  };
}
