/**
 * Simulated API layer. Every call:
 *  - runs a fault-injection check first (so every required UI state is reachable),
 *  - enforces tenant entitlement + RBAC,
 *  - only ever returns data scoped to ctx.tenantId,
 *  - adds deterministic-ish latency.
 *
 * No real network. This is the seam a real backend would replace.
 */
import { getStore } from "./store";
import { AccessError, assertCan, assertEntitlement, can, permissionsFor, roleInTenant, type SessionContext } from "./rbac";
import { parseQuery, type ParseError } from "@/lib/query/parser";
import { runQuery, type EvalContext, type RunQueryError, type RunQueryResult } from "@/lib/query/evaluate";
import type { NormalizedEvent } from "@/schemas";
import { TENANT_MAP } from "@/data/platform";

export type SimMode = "normal" | "slow" | "timeout" | "server_error" | "degraded_source" | "partial";

export class SimulatedFault extends Error {
  constructor(public kind: "timeout" | "server_error", message: string) {
    super(message);
    this.name = "SimulatedFault";
  }
}
export class QueryParseFault extends Error {
  constructor(public detail: ParseError) {
    super(detail.message);
    this.name = "QueryParseFault";
  }
}

let currentSim: SimMode = "normal";
export function setSimMode(mode: SimMode) {
  currentSim = mode;
}
export function getSimMode(): SimMode {
  return currentSim;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function gate(op: string, cost = 180) {
  switch (currentSim) {
    case "timeout":
      await delay(1200);
      throw new SimulatedFault("timeout", `The request for "${op}" timed out (simulated).`);
    case "server_error":
      await delay(300);
      throw new SimulatedFault("server_error", `The mock service returned an error for "${op}" (simulated).`);
    case "slow":
      await delay(cost + 2200);
      return;
    default:
      await delay(cost);
  }
}

// ---------------------------------------------------------------------------
// Shared / platform
// ---------------------------------------------------------------------------

export async function fetchBootstrap(userId: string) {
  await gate("bootstrap", 90);
  const store = getStore();
  const user = store.users.find((u) => u.user_id === userId);
  if (!user) throw new AccessError("not_authenticated", "Unknown demo user.");
  return {
    demoNowIso: store.demoNowIso,
    user,
    tenants: store.tenants
      .filter((t) => user.roles.some((r) => r.tenant_id === t.tenant_id))
      .map((t) => ({
        tenant_id: t.tenant_id,
        name: t.name,
        sector: t.sector,
        entitlements: t.entitlements,
        role: user.roles.find((r) => r.tenant_id === t.tenant_id)!.role,
        kill_switch: t.policy.kill_switch,
      })),
    globalKillSwitch: store.killSwitches.global,
    allUsers: store.users.map((u) => ({ user_id: u.user_id, display_name: u.display_name })),
  };
}

export type BootstrapData = Awaited<ReturnType<typeof fetchBootstrap>>;
export type TenantView = BootstrapData["tenants"][number];
export type SessionCapabilities = Awaited<ReturnType<typeof fetchSessionCapabilities>>;

export async function fetchSessionCapabilities(ctx: SessionContext) {
  await gate("capabilities", 60);
  return {
    role: roleInTenant(ctx),
    permissions: permissionsFor(ctx),
    tenant: TENANT_MAP[ctx.tenantId]
      ? {
          name: TENANT_MAP[ctx.tenantId].name,
          entitlements: TENANT_MAP[ctx.tenantId].entitlements,
          policy: TENANT_MAP[ctx.tenantId].policy,
        }
      : null,
  };
}

export async function fetchAudit(ctx: SessionContext) {
  await gate("audit");
  assertCan(ctx, "audit.view");
  return getStore().audit.filter((a) => a.tenant_id === ctx.tenantId);
}

export async function fetchAdminTenants(ctx: SessionContext) {
  await gate("admin-tenants");
  assertCan(ctx, "admin.identity");
  return getStore().tenants;
}

export async function fetchAdminUsers(ctx: SessionContext) {
  await gate("admin-users");
  assertCan(ctx, "admin.identity");
  return getStore().users;
}

export async function fetchPolicies(ctx: SessionContext) {
  await gate("policies");
  if (!can(ctx, "admin.policy") && !can(ctx, "audit.view")) {
    assertCan(ctx, "admin.policy");
  }
  const store = getStore();
  return {
    globalKillSwitch: store.killSwitches.global,
    partners: store.partners,
    tenants: store.tenants.map((t) => ({ tenant_id: t.tenant_id, name: t.name, policy: t.policy })),
  };
}

export async function fetchFrameworks() {
  await gate("frameworks", 70);
  return getStore().frameworks;
}

// ---------------------------------------------------------------------------
// SIEM — telemetry
// ---------------------------------------------------------------------------

export async function fetchTelemetrySources(ctx: SessionContext) {
  await gate("telemetry-sources");
  assertEntitlement(ctx, "has_siem");
  assertCan(ctx, "siem.view");
  const rows = getStore().telemetrySources.filter((s) => s.tenant_id === ctx.tenantId);
  if (currentSim === "degraded_source") {
    return rows.map((r, i) => (i === 0 ? { ...r, health: "degraded" as const, health_note: "Injected degraded state (simulation)." } : r));
  }
  return rows;
}

export interface QuarantineItem {
  event: NormalizedEvent;
  source_family: string;
}

export async function fetchQuarantineQueue(ctx: SessionContext): Promise<QuarantineItem[]> {
  await gate("quarantine");
  assertEntitlement(ctx, "has_siem");
  assertCan(ctx, "siem.view");
  const store = getStore();
  const familyOf = makeFamilyResolver(ctx.tenantId);
  return store.normalizedEvents
    .filter((e) => e.tenant_id === ctx.tenantId && e.normalization_status === "quarantined")
    .map((event) => ({ event, source_family: familyOf(event.telemetry_source_id) ?? "unknown" }));
}

// ---------------------------------------------------------------------------
// SIEM — Entity risk (seeded, indicative UEBA fixture)
// ---------------------------------------------------------------------------

export async function fetchEntityRisk(ctx: SessionContext) {
  await gate("entity-risk", 140);
  assertEntitlement(ctx, "has_siem");
  assertCan(ctx, "siem.view");
  return getStore().entityRisk.filter((r) => r.tenant_id === ctx.tenantId);
}

export async function fetchEntityRiskDetail(ctx: SessionContext, entityType: string, value: string) {
  await gate("entity-risk-detail");
  assertEntitlement(ctx, "has_siem");
  assertCan(ctx, "siem.view");
  const risk = getStore().entityRisk.find(
    (r) => r.tenant_id === ctx.tenantId && r.entity_type === entityType && r.value === value,
  );
  if (!risk) throw new AccessError("permission_denied", "No risk record for that entity in this tenant.");
  return risk;
}

// ---------------------------------------------------------------------------
// SIEM — Log Explorer
// ---------------------------------------------------------------------------

function makeFamilyResolver(tenantId: string) {
  const map = new Map(
    getStore().telemetrySources.filter((s) => s.tenant_id === tenantId).map((s) => [s.telemetry_source_id, s.family]),
  );
  return (id: string) => map.get(id);
}

export interface LogSearchInput {
  query: string;
  fromIso: string;
  toIso: string;
  limit?: number;
  includeQuarantined?: boolean;
}

export interface LogSearchResponse {
  result: RunQueryResult;
  histogram: { bucketStartIso: string; count: number }[];
  fieldStats: { field: string; values: { value: string; count: number }[]; distinct: number }[];
  partial?: boolean;
}

export async function searchLogs(ctx: SessionContext, input: LogSearchInput): Promise<LogSearchResponse> {
  await gate("log-search", 260);
  assertEntitlement(ctx, "has_siem");
  assertCan(ctx, "siem.query");

  const parsed = parseQuery(input.query);
  if (!parsed.ok) throw new QueryParseFault(parsed);

  const store = getStore();
  const familyOf = makeFamilyResolver(ctx.tenantId);
  const evalCtx: EvalContext = { familyOf };

  // Tenant scoping is applied here regardless of anything in the query text.
  let pool = store.normalizedEvents.filter((e) => e.tenant_id === ctx.tenantId);
  if (!input.includeQuarantined) pool = pool.filter((e) => e.normalization_status === "normalized");

  const timeRange = { fromIso: input.fromIso, toIso: input.toIso };
  const run = runQuery(pool, parsed.ast, evalCtx, { timeRange, limit: input.limit });
  if ("error" in run) {
    // surfaced to the caller as a typed rejected-query state
    const e = run as RunQueryError;
    throw new QueryParseFault({ ok: false, message: e.message, hint: "Adjust the time range." });
  }

  // Full matched set (bounded) for histogram + field statistics — these
  // summarise every match in the window, not just the returned page.
  const fullRun = runQuery(pool, parsed.ast, evalCtx, { timeRange, limit: 5000 });
  const allMatched = "error" in fullRun ? [] : fullRun.rows;

  const histogram = buildHistogram(allMatched, input.fromIso, input.toIso);
  const fieldStats = buildFieldStats(allMatched, familyOf);

  const partial = currentSim === "partial";
  return {
    result: partial ? { ...run, rows: run.rows.slice(0, Math.ceil(run.rows.length / 2)), truncated: true } : run,
    histogram,
    fieldStats,
    partial,
  };
}

function buildHistogram(rows: NormalizedEvent[], fromIso: string, toIso: string) {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  const span = Math.max(1, to - from);
  const buckets = 48;
  const size = span / buckets;
  const counts = new Array(buckets).fill(0);
  for (const e of rows) {
    const idx = Math.min(buckets - 1, Math.max(0, Math.floor((Date.parse(e.occurred_at) - from) / size)));
    counts[idx]++;
  }
  return counts.map((count, i) => ({ bucketStartIso: new Date(from + i * size).toISOString(), count }));
}

function buildFieldStats(rows: NormalizedEvent[], familyOf: (id: string) => string | undefined) {
  const fields: { field: string; get: (e: NormalizedEvent) => string[] }[] = [
    { field: "event_type", get: (e) => [e.event_type] },
    { field: "source.family", get: (e) => { const f = familyOf(e.telemetry_source_id); return f ? [f] : []; } },
    { field: "normalization_status", get: (e) => [e.normalization_status] },
    { field: "entity.user", get: (e) => (e.entities ?? []).filter((x) => x.entity_type === "user").map((x) => x.value) },
    { field: "entity.host", get: (e) => (e.entities ?? []).filter((x) => x.entity_type === "host").map((x) => x.value) },
    { field: "entity.ip", get: (e) => (e.entities ?? []).filter((x) => x.entity_type === "ip").map((x) => x.value) },
    { field: "attack_technique_refs", get: (e) => e.attack_technique_refs ?? [] },
  ];
  return fields.map(({ field, get }) => {
    const tally = new Map<string, number>();
    for (const e of rows) for (const v of get(e)) tally.set(v, (tally.get(v) ?? 0) + 1);
    const values = [...tally.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
    return { field, values: values.slice(0, 10), distinct: values.length };
  });
}

export async function fetchEventLineage(ctx: SessionContext, eventId: string) {
  await gate("lineage");
  assertEntitlement(ctx, "has_siem");
  assertCan(ctx, "siem.view");
  const store = getStore();
  const event = store.normalizedEvents.find((e) => e.event_id === eventId && e.tenant_id === ctx.tenantId);
  if (!event) throw new AccessError("permission_denied", "Event not found in this tenant.");
  const raw = store.rawEvents.find((r) => r.raw_payload_ref === event.raw_payload_ref) ?? null;
  const related = store.normalizedEvents
    .filter((e) => e.tenant_id === ctx.tenantId && e.event_id !== eventId)
    .filter((e) => {
      const a = new Set((event.entities ?? []).map((x) => `${x.entity_type}:${x.value}`));
      return (e.entities ?? []).some((x) => a.has(`${x.entity_type}:${x.value}`));
    })
    .sort((a, b) => Math.abs(Date.parse(a.occurred_at) - Date.parse(event.occurred_at)) - Math.abs(Date.parse(b.occurred_at) - Date.parse(event.occurred_at)))
    .slice(0, 8);
  return { event, raw, related };
}
