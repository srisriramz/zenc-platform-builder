/**
 * Deterministic evaluator for the parsed query AST against normalized events.
 * Pure functions, no side effects, no code generation.
 */
import type { NormalizedEvent, TelemetrySourceFamily } from "@/schemas";
import { FREE_TEXT_FIELDS, QUERY_LIMITS } from "./fields";
import { globToPredicate, type QueryNode } from "./parser";

export interface EvalContext {
  /** resolve a normalized event's source family for `source.family` queries */
  familyOf: (telemetrySourceId: string) => TelemetrySourceFamily | undefined;
}

function fieldValues(event: NormalizedEvent, field: string, ctx: EvalContext): string[] {
  if (field.startsWith("entity.")) {
    const kind = field.slice("entity.".length);
    return (event.entities ?? []).filter((e) => e.entity_type === kind).map((e) => e.value);
  }
  if (field === "source.family") {
    const fam = ctx.familyOf(event.telemetry_source_id);
    return fam ? [fam] : [];
  }
  if (field === "attack_technique_refs") return event.attack_technique_refs ?? [];
  const direct = (event as Record<string, unknown>)[field];
  if (direct === undefined || direct === null) return [];
  return [String(direct)];
}

function freeTextHaystack(event: NormalizedEvent, ctx: EvalContext): string {
  const parts: string[] = [event.event_type, event.event_id];
  for (const f of FREE_TEXT_FIELDS) parts.push(...fieldValues(event, f, ctx));
  const fam = ctx.familyOf(event.telemetry_source_id);
  if (fam) parts.push(fam);
  return parts.join("  ").toLowerCase();
}

export function matchEvent(node: QueryNode | null, event: NormalizedEvent, ctx: EvalContext): boolean {
  if (node === null) return true;
  switch (node.type) {
    case "and":
      return node.children.every((c) => matchEvent(c, event, ctx));
    case "or":
      return node.children.some((c) => matchEvent(c, event, ctx));
    case "not":
      return !matchEvent(node.child, event, ctx);
    case "freetext":
      return freeTextHaystack(event, ctx).includes(node.value.toLowerCase());
    case "comparison": {
      const values = fieldValues(event, node.field, ctx);
      switch (node.operator) {
        case "exists":
          return values.length > 0;
        case "eq":
          return values.some((v) => v.toLowerCase() === node.value.toLowerCase());
        case "neq":
          return values.length > 0 && !values.some((v) => v.toLowerCase() === node.value.toLowerCase());
        case "wildcard": {
          const pred = globToPredicate(node.value);
          return values.some((v) => pred(v));
        }
        case "gt":
        case "gte":
        case "lt":
        case "lte": {
          if (values.length === 0) return false;
          const target = Date.parse(node.value);
          return values.some((v) => {
            const t = Date.parse(v);
            if (Number.isNaN(t)) return false;
            if (node.operator === "gt") return t > target;
            if (node.operator === "gte") return t >= target;
            if (node.operator === "lt") return t < target;
            return t <= target;
          });
        }
      }
    }
  }
  return false;
}

export interface TimeRange {
  fromIso: string;
  toIso: string;
}

export interface RunQueryResult {
  rows: NormalizedEvent[];
  totalMatched: number;
  truncated: boolean;
  limit: number;
  scannedCount: number;
  timeRange: TimeRange;
}

export interface RunQueryError {
  error: "time_range_too_wide" | "no_time_range";
  message: string;
}

export function runQuery(
  events: NormalizedEvent[],
  node: QueryNode | null,
  ctx: EvalContext,
  opts: { timeRange: TimeRange; limit?: number },
): RunQueryResult | RunQueryError {
  const { timeRange } = opts;
  const from = Date.parse(timeRange.fromIso);
  const to = Date.parse(timeRange.toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) {
    return { error: "no_time_range", message: "A valid time range is required for every search." };
  }
  const spanDays = (to - from) / 86_400_000;
  if (spanDays > QUERY_LIMITS.maxTimeRangeDays) {
    return {
      error: "time_range_too_wide",
      message: `Time range spans ${Math.round(spanDays)} days; the maximum is ${QUERY_LIMITS.maxTimeRangeDays}. Narrow the range and search again.`,
    };
  }
  const limit = Math.min(opts.limit ?? QUERY_LIMITS.defaultResultRows, QUERY_LIMITS.maxResultRows);

  const inWindow = events.filter((e) => {
    const t = Date.parse(e.occurred_at);
    return t >= from && t <= to;
  });

  const matched = inWindow.filter((e) => matchEvent(node, e, ctx));
  matched.sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at));

  return {
    rows: matched.slice(0, limit),
    totalMatched: matched.length,
    truncated: matched.length > limit,
    limit,
    scannedCount: inWindow.length,
    timeRange,
  };
}
