/**
 * Deterministic correlation engine. Given normalized events and enabled rules,
 * it produces alert-envelope (v1.2) objects. No LLM, no randomness per run —
 * the same events + rules always yield the same alerts (SKILL.md #2).
 *
 * Every produced `attack_techniques` entry cites the specific normalized-event
 * IDs that matched (SKILL.md #10) — never a bare tag.
 */
import type { AlertEnvelope, HealthState, NormalizedEvent, TelemetrySourceFamily } from "@/schemas";
import { hashString } from "@/lib/prng";
import { minus } from "@/lib/time";
import type { SeededRule } from "@/data/correlation-rules";
import { groupKey, matchesEvent } from "./match";

export interface CorrelationContext {
  familyOf: (telemetrySourceId: string) => TelemetrySourceFamily | undefined;
  healthOf: (telemetrySourceId: string) => HealthState | undefined;
}

export interface RuleFiring {
  rule: SeededRule;
  alerts: AlertEnvelope[];
}

const HEALTH_RANK: Record<HealthState, number> = { healthy: 0, unknown: 1, degraded: 2, stale: 3 };

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}

function worstHealth(events: NormalizedEvent[], ctx: CorrelationContext): HealthState {
  let worst: HealthState = "healthy";
  for (const e of events) {
    const h = ctx.healthOf(e.telemetry_source_id) ?? "unknown";
    if (HEALTH_RANK[h] > HEALTH_RANK[worst]) worst = h;
  }
  return worst;
}

function correlationDelaySeconds(seed: string): number {
  return 2 + (hashString(seed) % 14);
}

function buildAlert(
  rule: SeededRule,
  contributing: NormalizedEvent[],
  groupValue: string | undefined,
  ctx: CorrelationContext,
): AlertEnvelope {
  const ordered = [...contributing].sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
  const occurred_at = ordered[0].occurred_at;
  const lastIngest = ordered.reduce((max, e) => (Date.parse(e.ingested_at) > Date.parse(max) ? e.ingested_at : max), ordered[0].ingested_at);
  const envelope_id = `env-${rule.rule_id}-${(hashString(`${rule.rule_id}:${groupValue ?? ""}:${ordered[0].event_id}`) >>> 0).toString(36)}`;
  const correlated_at = minus(lastIngest, { seconds: -correlationDelaySeconds(envelope_id) });

  const entityIndex = new Map<string, { entity_type: NonNullable<NormalizedEvent["entities"]>[number]["entity_type"]; value: string }>();
  for (const e of ordered) for (const en of e.entities ?? []) entityIndex.set(`${en.entity_type}:${en.value}`, en);
  const entities = [...entityIndex.values()].slice(0, 12);

  const contributingIds = ordered.map((e) => e.event_id);
  const attack_techniques = rule.attack_mapping.map((m) => {
    const tagged = ordered.filter((e) => (e.attack_technique_refs ?? []).some((t) => t === m.technique_id || m.technique_id.startsWith(t)));
    const refs = tagged.length > 0 ? tagged.map((e) => e.event_id) : contributingIds;
    return {
      tactic: m.tactic,
      technique_id: m.technique_id,
      technique_name: m.technique_name,
      ...(m.sub_technique_id ? { sub_technique_id: m.sub_technique_id } : {}),
      contributing_event_refs: refs,
      source_rule_id: rule.rule_id,
    };
  });

  const hourBucket = occurred_at.slice(0, 13);

  return {
    envelope_id,
    schema_version: "1.2",
    tenant_id: rule.tenant_id,
    source: { system: "zenc-siem", connector_id: "corr-engine-01", health: worstHealth(ordered, ctx) },
    source_alert_id: `${rule.rule_id}:${groupValue ?? "single"}:${hourBucket}`,
    occurred_at,
    correlated_at,
    received_at: correlated_at,
    severity: rule.severity ?? "medium",
    confidence: rule.confidence ?? 0.5,
    sector_tags: rule.sector_tags,
    title: rule.alert_title,
    description: rule.alert_summary(ordered.length, groupValue),
    entities,
    attack_techniques,
    dedupe_key: `${rule.rule_id}:${groupValue ?? "single"}:${hourBucket}`,
    raw_payload_ref: `seed-fixtures/alerts/${envelope_id}.json`,
    validation_status: "valid",
  };
}

// --- per rule-type matching ---------------------------------------------------

function fireSingleEvent(rule: SeededRule, events: NormalizedEvent[], ctx: CorrelationContext): AlertEnvelope[] {
  if (rule.definition.kind !== "single_event") return [];
  const { match } = rule.definition;
  const matched = events.filter((e) => matchesEvent(e, match, ctx.familyOf));
  // one alert per (primary entity, day) to keep volume sane
  const groups = new Map<string, NormalizedEvent[]>();
  for (const e of matched) {
    const primary = groupKey(e, "entity.user") ?? groupKey(e, "entity.host") ?? e.event_id;
    push(groups, `${primary}::${e.occurred_at.slice(0, 10)}`, e);
  }
  return [...groups.entries()].map(([k, evs]) => buildAlert(rule, evs, k.split("::")[0], ctx));
}

function fireThreshold(rule: SeededRule, events: NormalizedEvent[], ctx: CorrelationContext): AlertEnvelope[] {
  if (rule.definition.kind !== "threshold") return [];
  const def = rule.definition;
  const matched = events.filter((e) => matchesEvent(e, def.match, ctx.familyOf));
  const byKey = new Map<string, NormalizedEvent[]>();
  for (const e of matched) {
    const k = groupKey(e, def.group_by);
    if (k) push(byKey, k, e);
  }
  const alerts: AlertEnvelope[] = [];
  for (const [k, evs] of byKey) {
    evs.sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
    // sliding window: find the densest window that meets the threshold
    let best: NormalizedEvent[] = [];
    for (let i = 0; i < evs.length; i++) {
      const windowEnd = Date.parse(evs[i].occurred_at) + def.window_seconds * 1000;
      const window = evs.filter((e, j) => j >= i && Date.parse(e.occurred_at) <= windowEnd);
      if (window.length >= def.threshold && window.length > best.length) best = window;
    }
    if (best.length >= def.threshold) alerts.push(buildAlert(rule, best, k, ctx));
  }
  return alerts;
}

function fireSequence(rule: SeededRule, events: NormalizedEvent[], ctx: CorrelationContext): AlertEnvelope[] {
  if (rule.definition.kind !== "sequence") return [];
  const def = rule.definition;
  const byKey = new Map<string, NormalizedEvent[]>();
  for (const e of events) {
    const k = groupKey(e, def.join_by);
    if (k) push(byKey, k, e);
  }
  const alerts: AlertEnvelope[] = [];
  for (const [k, evs] of byKey) {
    evs.sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
    let stepIdx = 0;
    let stepCount = 0;
    let anchorT = -Infinity;
    let trail: NormalizedEvent[] = [];
    const windowMs = def.within_seconds * 1000;

    const reset = () => {
      stepIdx = 0;
      stepCount = 0;
      anchorT = -Infinity;
      trail = [];
    };

    for (const e of evs) {
      const t = Date.parse(e.occurred_at);
      // if we've started a sequence and this event is past the window, restart
      if (anchorT !== -Infinity && t - anchorT > windowMs) reset();

      if (!matchesEvent(e, def.steps[stepIdx].match, ctx.familyOf)) continue;

      if (anchorT === -Infinity) anchorT = t;
      trail.push(e);
      stepCount++;

      if (stepCount >= (def.steps[stepIdx].min_count ?? 1)) {
        stepIdx++;
        stepCount = 0;
        if (stepIdx === def.steps.length) {
          alerts.push(buildAlert(rule, trail.slice(), k, ctx));
          reset();
        }
      }
    }
  }
  return alerts;
}

function fireEntityJoin(rule: SeededRule, events: NormalizedEvent[], ctx: CorrelationContext): AlertEnvelope[] {
  if (rule.definition.kind !== "entity_join") return [];
  const def = rule.definition;
  const byKey = new Map<string, NormalizedEvent[]>();
  for (const e of events) {
    const k = groupKey(e, def.join_by);
    if (k) push(byKey, k, e);
  }
  const alerts: AlertEnvelope[] = [];
  for (const [k, evs] of byKey) {
    const lefts = evs.filter((e) => matchesEvent(e, def.left, ctx.familyOf));
    const rights = evs.filter((e) => matchesEvent(e, def.right, ctx.familyOf));
    for (const l of lefts) {
      const r = rights.find((x) => Math.abs(Date.parse(x.occurred_at) - Date.parse(l.occurred_at)) <= def.within_seconds * 1000);
      if (r) {
        alerts.push(buildAlert(rule, [l, r], k, ctx));
        break; // one alert per join key
      }
    }
  }
  return alerts;
}

export function runCorrelation(events: NormalizedEvent[], rules: SeededRule[], ctx: CorrelationContext): RuleFiring[] {
  const enabled = rules.filter((r) => r.lifecycle_state === "enabled");
  return enabled.map((rule) => {
    const tenantEvents = events.filter((e) => e.tenant_id === rule.tenant_id);
    let alerts: AlertEnvelope[] = [];
    switch (rule.definition.kind) {
      case "single_event":
        alerts = fireSingleEvent(rule, tenantEvents, ctx);
        break;
      case "threshold":
        alerts = fireThreshold(rule, tenantEvents, ctx);
        break;
      case "sequence":
        alerts = fireSequence(rule, tenantEvents, ctx);
        break;
      case "entity_join":
        alerts = fireEntityJoin(rule, tenantEvents, ctx);
        break;
    }
    // dedup by dedupe_key
    const seen = new Set<string>();
    alerts = alerts.filter((a) => (a.dedupe_key && seen.has(a.dedupe_key) ? false : (seen.add(a.dedupe_key ?? a.envelope_id), true)));
    return { rule, alerts };
  });
}
