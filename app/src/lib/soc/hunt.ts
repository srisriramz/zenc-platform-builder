import type { NormalizedEvent } from "@/schemas";
import { parseQuery, type ParseError } from "@/lib/query/parser";
import { runQuery, type EvalContext } from "@/lib/query/evaluate";

/**
 * Hunt Agent logic (L1). Runs an ANALYST-INITIATED query against a bounded
 * scope and time window. Bounds (references/agentic-architecture.md):
 *   - the safe query parser only
 *   - ≤ 7 days per window
 *   - ≤ 5000 events per call
 *
 * The Hunt Agent never auto-creates a case — turning a hunt result into a
 * case is an explicit analyst action downstream of this function.
 */

const MAX_WINDOW_DAYS = 7;
const MAX_EVENTS = 5000;

export interface HuntInput {
  query: string;
  fromIso: string;
  toIso: string;
  includeQuarantined?: boolean;
}

export interface HuntResult {
  query: string;
  window: { fromIso: string; toIso: string };
  matched_count: number;
  scanned_count: number;
  truncated: boolean;
  rows: NormalizedEvent[];
  by_event_type: { key: string; count: number }[];
  by_host: { key: string; count: number }[];
  by_user: { key: string; count: number }[];
}

export type HuntError = { error: "bad_query"; detail: ParseError } | { error: "window_too_wide"; message: string } | { error: "no_window"; message: string };

function tally(rows: NormalizedEvent[], get: (e: NormalizedEvent) => string[]): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const e of rows) for (const v of get(e)) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count).slice(0, 8);
}

export function runHunt(input: HuntInput, events: NormalizedEvent[], evalCtx: EvalContext): HuntResult | HuntError {
  const from = Date.parse(input.fromIso);
  const to = Date.parse(input.toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return { error: "no_window", message: "A hunt needs a valid time window." };
  if ((to - from) / 86_400_000 > MAX_WINDOW_DAYS) {
    return { error: "window_too_wide", message: `A hunt window is capped at ${MAX_WINDOW_DAYS} days.` };
  }

  const parsed = parseQuery(input.query);
  if (!parsed.ok) return { error: "bad_query", detail: parsed };

  let pool = events;
  if (!input.includeQuarantined) pool = pool.filter((e) => e.normalization_status === "normalized");

  const run = runQuery(pool, parsed.ast, evalCtx, { timeRange: { fromIso: input.fromIso, toIso: input.toIso }, limit: MAX_EVENTS });
  if ("error" in run) {
    return run.error === "time_range_too_wide"
      ? { error: "window_too_wide", message: run.message }
      : { error: "no_window", message: run.message };
  }

  return {
    query: input.query,
    window: { fromIso: input.fromIso, toIso: input.toIso },
    matched_count: run.totalMatched,
    scanned_count: run.scannedCount,
    truncated: run.truncated,
    rows: run.rows.slice(0, 100),
    by_event_type: tally(run.rows, (e) => [e.event_type]),
    by_host: tally(run.rows, (e) => (e.entities ?? []).filter((x) => x.entity_type === "host").map((x) => x.value)),
    by_user: tally(run.rows, (e) => (e.entities ?? []).filter((x) => x.entity_type === "user").map((x) => x.value)),
  };
}
