import type { AlertEnvelope, Entity, Severity } from "@/schemas";
import { hashString } from "@/lib/prng";
import type { CaseCandidate } from "./types";

/**
 * Deterministic case grouping. Two accepted alerts belong in the same case when
 * they are close in time AND share an entity AND the link is a strong pivot —
 * either a shared ATT&CK technique or a shared user/host (build-soc.md:
 * "group alerts into cases by shared entity + overlapping time window +
 * related technique"). No LLM, no randomness: the same alert set always yields
 * the same candidates.
 */

const WINDOW_MS = 12 * 60 * 60 * 1000;
const SEV_RANK: Record<Severity, number> = { informational: 0, low: 1, medium: 2, high: 3, critical: 4 };

function entityKey(e: Entity): string {
  return `${e.entity_type}:${e.value.toLowerCase()}`;
}

function techniqueIds(a: AlertEnvelope): Set<string> {
  return new Set((a.attack_techniques ?? []).map((t) => t.technique_id));
}

function sharedEntities(a: AlertEnvelope, b: AlertEnvelope): Entity[] {
  const bKeys = new Map((b.entities ?? []).map((e) => [entityKey(e), e] as const));
  return (a.entities ?? []).filter((e) => bKeys.has(entityKey(e)));
}

function linkReason(a: AlertEnvelope, b: AlertEnvelope): string | null {
  if (Math.abs(Date.parse(a.occurred_at) - Date.parse(b.occurred_at)) > WINDOW_MS) return null;
  const shared = sharedEntities(a, b);
  if (shared.length === 0) return null;

  const aTech = techniqueIds(a);
  const sharedTech = [...techniqueIds(b)].filter((t) => aTech.has(t));
  const strongEntity = shared.find((e) => e.entity_type === "user" || e.entity_type === "host");

  if (sharedTech.length > 0) {
    return `shared ${shared[0].entity_type} ${shared[0].value} and technique ${sharedTech[0]}, within 12h`;
  }
  if (strongEntity) {
    return `shared ${strongEntity.entity_type} ${strongEntity.value}, within 12h`;
  }
  return null;
}

class UnionFind {
  private parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    this.parent.set(x, root);
    return root;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
  }
}

export function groupIntoCases(accepted: AlertEnvelope[], tenantId: string): CaseCandidate[] {
  const alerts = accepted
    .filter((a) => a.tenant_id === tenantId)
    .slice()
    .sort((a, b) => (a.envelope_id < b.envelope_id ? -1 : 1));

  const uf = new UnionFind();
  const reasons = new Map<string, string>(); // "min+max" pair -> reason
  for (let i = 0; i < alerts.length; i++) {
    uf.find(alerts[i].envelope_id);
    for (let j = i + 1; j < alerts.length; j++) {
      const reason = linkReason(alerts[i], alerts[j]);
      if (reason) {
        uf.union(alerts[i].envelope_id, alerts[j].envelope_id);
        reasons.set(`${alerts[i].envelope_id}|${alerts[j].envelope_id}`, reason);
      }
    }
  }

  const groups = new Map<string, AlertEnvelope[]>();
  for (const a of alerts) {
    const root = uf.find(a.envelope_id);
    const arr = groups.get(root) ?? [];
    arr.push(a);
    groups.set(root, arr);
  }

  return [...groups.values()]
    .map((members): CaseCandidate => {
      const ids = members.map((m) => m.envelope_id).sort();
      const entityIndex = new Map<string, Entity>();
      const techIndex = new Map<string, { technique_id: string; technique_name: string; tactic: string }>();
      let maxSev: Severity = "informational";
      let first = members[0].occurred_at;
      let last = members[0].occurred_at;
      for (const m of members) {
        for (const e of m.entities ?? []) entityIndex.set(entityKey(e), e);
        for (const t of m.attack_techniques ?? [])
          techIndex.set(t.technique_id, { technique_id: t.technique_id, technique_name: t.technique_name, tactic: t.tactic });
        if (SEV_RANK[m.severity] > SEV_RANK[maxSev]) maxSev = m.severity;
        if (Date.parse(m.occurred_at) < Date.parse(first)) first = m.occurred_at;
        if (Date.parse(m.occurred_at) > Date.parse(last)) last = m.occurred_at;
      }

      const rationale =
        members.length === 1
          ? "single alert — no correlated activity in the window"
          : reasons.get(`${ids[0]}|${ids[1]}`) ??
            [...reasons.values()][0] ??
            `${members.length} alerts sharing an entity within 12h`;

      return {
        candidate_id: `cand-${(hashString(ids.join("+")) >>> 0).toString(36)}`,
        tenant_id: tenantId,
        envelope_ids: ids,
        entities: [...entityIndex.values()].slice(0, 12),
        techniques: [...techIndex.values()],
        first_occurred_at: first,
        last_occurred_at: last,
        max_severity: maxSev,
        grouping_rationale: rationale,
      };
    })
    .sort((a, b) => Date.parse(b.last_occurred_at) - Date.parse(a.last_occurred_at));
}
