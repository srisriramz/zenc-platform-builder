import type { EntityRisk, NormalizedEvent, RiskSignal } from "@/schemas";
import { bandForScore } from "@/schemas";
import { DEMO_NOW_ISO } from "@/lib/time";
import { hashString } from "@/lib/prng";

/**
 * Derive the seeded, INDICATIVE entity-risk fixture from the normalized event
 * sample. Transparent, volume-independent scoring — a weighted blend of:
 *  - the *proportion* of the entity's activity that trips a risk signal,
 *  - the presence of inherently-rare signals (data movement, forwarding rules,
 *    IAM changes),
 *  - ATT&CK-technique breadth and external-address exposure,
 *  - off-hours concentration.
 * Not ML, not a baseline model. Each signal keeps a Log Explorer query so a
 * human can see exactly which events drove the score.
 */

const EXTERNAL_IP = /^(203\.0\.113|198\.51\.100|192\.0\.2)\./;

interface Rule {
  kind: RiskSignal["kind"];
  label: (n: number) => string;
  matches: (e: NormalizedEvent) => boolean;
  /** inherently-rare signals contribute a flat bonus on top of the ratio term */
  rareBonus?: number;
  query: string;
}

const RULES: Rule[] = [
  {
    kind: "auth",
    label: (n) => `${n} failed authentication${n === 1 ? "" : "s"}`,
    matches: (e) => ["windows_security_4625", "linux_sshd_failed", "idp_signin_failure"].includes(e.event_type),
    query: "(event_type:windows_security_4625 OR event_type:linux_sshd_failed OR event_type:idp_signin_failure)",
  },
  {
    kind: "process",
    label: (n) => `${n} script / encoded-command execution${n === 1 ? "" : "s"}`,
    matches: (e) => ["windows_powershell_4104", "linux_auditd_execve"].includes(e.event_type),
    query: "(event_type:windows_powershell_4104 OR event_type:linux_auditd_execve)",
  },
  {
    kind: "admin",
    label: (n) => `${n} privilege-elevation / admin action${n === 1 ? "" : "s"}`,
    matches: (e) => ["linux_sudo_command", "windows_service_7045"].includes(e.event_type),
    query: "(event_type:linux_sudo_command OR event_type:windows_service_7045)",
  },
  {
    kind: "admin",
    label: (n) => `${n} identity / IAM change${n === 1 ? "" : "s"}`,
    matches: (e) => ["idp_role_grant", "cloud_iam_policy_change", "cloud_guardrail_disabled"].includes(e.event_type),
    rareBonus: 10,
    query: "(event_type:idp_role_grant OR event_type:cloud_iam_policy_change OR event_type:cloud_guardrail_disabled)",
  },
  {
    kind: "data",
    label: (n) => `${n} data-collection / exfiltration signal${n === 1 ? "" : "s"}`,
    matches: (e) => ["cloud_storage_download", "email_forwarding_rule_created"].includes(e.event_type),
    rareBonus: 14,
    query: "(event_type:cloud_storage_download OR event_type:email_forwarding_rule_created)",
  },
];

function entityKeys(e: NormalizedEvent): { type: "host" | "user"; value: string }[] {
  return (e.entities ?? [])
    .filter((x) => x.entity_type === "host" || x.entity_type === "user")
    .map((x) => ({ type: x.entity_type as "host" | "user", value: x.value }));
}

export function deriveEntityRisk(normalized: NormalizedEvent[], tenantId: string): EntityRisk[] {
  const events = normalized.filter((e) => e.tenant_id === tenantId && e.normalization_status === "normalized");
  if (events.length === 0) return [];

  const times = events.map((e) => Date.parse(e.occurred_at));
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const half = minT + (maxT - minT) / 2;

  const byEntity = new Map<string, { type: "host" | "user"; value: string; events: NormalizedEvent[] }>();
  for (const e of events) {
    for (const k of entityKeys(e)) {
      const id = `${k.type}:${k.value}`;
      if (!byEntity.has(id)) byEntity.set(id, { type: k.type, value: k.value, events: [] });
      byEntity.get(id)!.events.push(e);
    }
  }

  const risks: EntityRisk[] = [];
  for (const { type, value, events: evs } of byEntity.values()) {
    if (evs.length < 4) continue;
    const total = evs.length;

    const signals: RiskSignal[] = [];
    let score = 0;

    for (const rule of RULES) {
      const matched = evs.filter(rule.matches);
      if (matched.length === 0) continue;
      const ratio = matched.length / total;
      const contribution = Math.min(rule.rareBonus ? 24 : 20, ratio * 62 + (rule.rareBonus ?? 0));
      score += contribution;
      signals.push({
        kind: rule.kind,
        label: rule.label(matched.length),
        weight: Math.round(contribution),
        event_count: matched.length,
        evidence_query: `entity.${type}:${value} AND ${rule.query}`,
      });
    }

    // off-hours concentration
    const offHours = evs.filter((e) => new Date(e.occurred_at).getUTCHours() < 5).length;
    if (offHours / total > 0.28) {
      const contribution = Math.min(9, (offHours / total) * 20);
      score += contribution;
      signals.push({
        kind: "anomaly",
        label: `${Math.round((offHours / total) * 100)}% of activity is off-hours (00:00–05:00 UTC)`,
        weight: Math.round(contribution),
        event_count: offHours,
        evidence_query: `entity.${type}:${value}`,
      });
    }

    // external-address exposure
    const extIps = new Set<string>();
    for (const e of evs) for (const en of e.entities ?? []) if (en.entity_type === "ip" && EXTERNAL_IP.test(en.value)) extIps.add(en.value);
    if (extIps.size >= 2) {
      const contribution = Math.min(12, extIps.size * 2.5);
      score += contribution;
      signals.push({
        kind: "network",
        label: `activity involving ${extIps.size} external addresses`,
        weight: Math.round(contribution),
        event_count: extIps.size,
        evidence_query: `entity.${type}:${value} AND (entity.ip ~ 203.0.113.* OR entity.ip ~ 198.51.100.* OR entity.ip ~ 192.0.2.*)`,
      });
    }

    // ATT&CK-technique breadth
    const techniques = new Set<string>();
    for (const e of evs) for (const t of e.attack_technique_refs ?? []) techniques.add(t);
    if (techniques.size >= 2) {
      const contribution = Math.min(16, techniques.size * 3);
      score += contribution;
      signals.push({
        kind: "anomaly",
        label: `activity tagged to ${techniques.size} ATT&CK techniques`,
        weight: Math.round(contribution),
        event_count: techniques.size,
        evidence_query: `entity.${type}:${value} AND attack_technique_refs:exists`,
      });
    }

    if (signals.length === 0) continue;

    score += (hashString(`${tenantId}:${type}:${value}`) % 7) - 3;
    score = Math.max(0, Math.min(100, Math.round(score)));
    if (score < 20) continue;

    const recent = evs.filter((e) => Date.parse(e.occurred_at) >= half).length;
    const older = total - recent || 1;
    const trend = recent > older * 1.4 ? "rising" : recent < older * 0.6 ? "falling" : "steady";

    risks.push({
      tenant_id: tenantId,
      entity_type: type,
      value,
      score,
      band: bandForScore(score),
      trend,
      signals: signals.sort((a, b) => b.weight - a.weight),
      first_seen: evs.reduce((min, e) => (Date.parse(e.occurred_at) < Date.parse(min) ? e.occurred_at : min), evs[0].occurred_at),
      last_updated: DEMO_NOW_ISO,
      is_indicative: true,
    });
  }

  risks.sort((a, b) => b.score - a.score);
  const top = risks.slice(0, 20);

  const perType: Record<string, number[]> = {};
  for (const r of top) (perType[r.entity_type] ??= []).push(r.score);
  for (const r of top) {
    const arr = [...perType[r.entity_type]].sort((a, b) => a - b);
    const median = arr[Math.floor(arr.length / 2)] || 1;
    const ratio = r.score / Math.max(1, median);
    r.peer_context =
      ratio >= 1.4
        ? `${ratio.toFixed(1)}× the median score for ${r.entity_type} entities in this tenant`
        : `near the median score for ${r.entity_type} entities in this tenant`;
  }

  return top;
}
