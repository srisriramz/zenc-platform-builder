/**
 * ATT&CK × D3FEND coverage matrix — the pure derivation.
 *
 * Per technique we stage coverage HONESTLY along the detection pipeline
 * (native-siem-spec.md "Detection coverage") rather than a binary flag:
 *
 *   no telemetry → telemetry available → activity observed → rule present
 *   → alerts correlated
 *
 * Response is a separate axis: an enabled playbook whose steps carry a
 * response-side D3FEND mapping and that applies to the technique.
 *
 * Coverage % is computed against the SEEDED ATT&CK slice, not the full
 * matrix (references/assumptions-and-limitations.md).
 */
import type { AttackTactic, AttackTechnique } from "@/data/frameworks/attack";

export type CoverageStage =
  | "no_telemetry"
  | "telemetry"
  | "activity"
  | "detected"
  | "correlated";

export const STAGE_ORDER: CoverageStage[] = ["no_telemetry", "telemetry", "activity", "detected", "correlated"];

export const STAGE_LABEL: Record<CoverageStage, string> = {
  no_telemetry: "No telemetry",
  telemetry: "Telemetry available",
  activity: "Activity observed",
  detected: "Rule present",
  correlated: "Alerts correlated",
};

export interface CoverageRuleRef {
  rule_id: string;
  name: string;
  fired: boolean;
}
export interface CoveragePlaybookRef {
  playbook_id: string;
  name: string;
  d3fend: { id: string; name: string }[];
}

export interface CoverageRow {
  technique_id: string;
  name: string;
  is_sub_technique: boolean;
  parent_technique_id?: string;
  tactic_shortnames: string[];
  data_source_families: string[];
  stage: CoverageStage;
  telemetry: boolean;
  activity_observed: boolean;
  detected: boolean;
  correlated: boolean;
  responded: boolean;
  detecting_rules: CoverageRuleRef[];
  responding_playbooks: CoveragePlaybookRef[];
  /** detect-side D3FEND from the producing rule(s) — informational */
  detect_d3fend: { id: string; name: string }[];
}

export interface CoverageKpis {
  techniques_in_scope: number;
  detected: number;
  correlated: number;
  responded: number;
  detection_coverage_pct: number;
  response_coverage_pct: number;
  telemetry_gap: number;
}

export interface CoverageMatrix {
  rows: CoverageRow[];
  kpis: CoverageKpis;
  byTactic: { tactic: AttackTactic; rows: CoverageRow[]; detected: number; responded: number }[];
}

export interface CoverageInputs {
  techniques: AttackTechnique[];
  tactics: AttackTactic[];
  /** telemetry-source families connected for the tenant (any health) */
  connectedFamilies: Set<string>;
  /** …of those, families with at least one non-stale source */
  liveFamilies: Set<string>;
  /** technique ids that appear in normalized-event attack_technique_refs in the sample */
  observedTechniqueIds: Set<string>;
  /** enabled correlation rules for the tenant */
  enabledRules: {
    rule_id: string;
    name: string;
    attack_mapping: { technique_id: string }[];
    d3fend_mapping?: { d3fend_technique_id: string; d3fend_technique_name: string }[];
  }[];
  /** rule_id → fired at least one alert on the sample */
  firedRuleIds: Set<string>;
  /** enabled playbooks for the tenant (empty when the tenant has no SOAR) */
  enabledPlaybooks: {
    playbook_id: string;
    name: string;
    applies_to_techniques: string[];
    steps: { d3fend_mapping?: { d3fend_technique_id: string; d3fend_technique_name: string }[] }[];
  }[];
}

export function buildCoverageMatrix(input: CoverageInputs): CoverageMatrix {
  const rulesByTechnique = new Map<string, CoverageInputs["enabledRules"]>();
  for (const r of input.enabledRules) {
    for (const m of r.attack_mapping) {
      const arr = rulesByTechnique.get(m.technique_id) ?? [];
      arr.push(r);
      rulesByTechnique.set(m.technique_id, arr);
    }
  }

  const playbooksByTechnique = new Map<string, CoverageInputs["enabledPlaybooks"]>();
  for (const p of input.enabledPlaybooks) {
    const hasResponseStep = p.steps.some((s) => (s.d3fend_mapping?.length ?? 0) > 0);
    if (!hasResponseStep) continue;
    for (const tid of p.applies_to_techniques) {
      const arr = playbooksByTechnique.get(tid) ?? [];
      arr.push(p);
      playbooksByTechnique.set(tid, arr);
    }
  }

  const rows: CoverageRow[] = input.techniques.map((t) => {
    const telemetry = t.data_source_families.some((f) => input.connectedFamilies.has(f));
    const activity_observed = input.observedTechniqueIds.has(t.technique_id);
    const matchedRules = rulesByTechnique.get(t.technique_id) ?? [];
    const detected = matchedRules.length > 0;
    const correlated = matchedRules.some((r) => input.firedRuleIds.has(r.rule_id));
    const matchedPlaybooks = playbooksByTechnique.get(t.technique_id) ?? [];
    const responded = matchedPlaybooks.length > 0;

    let stage: CoverageStage = "no_telemetry";
    if (telemetry) stage = "telemetry";
    if (activity_observed) stage = "activity";
    if (detected) stage = "detected";
    if (correlated) stage = "correlated";

    const detect_d3fend = dedupeD3(
      matchedRules.flatMap((r) => (r.d3fend_mapping ?? []).map((d) => ({ id: d.d3fend_technique_id, name: d.d3fend_technique_name }))),
    );

    return {
      technique_id: t.technique_id,
      name: t.name,
      is_sub_technique: t.is_sub_technique,
      parent_technique_id: t.parent_technique_id,
      tactic_shortnames: t.tactic_shortnames,
      data_source_families: t.data_source_families,
      stage,
      telemetry,
      activity_observed,
      detected,
      correlated,
      responded,
      detecting_rules: matchedRules.map((r) => ({ rule_id: r.rule_id, name: r.name, fired: input.firedRuleIds.has(r.rule_id) })),
      responding_playbooks: matchedPlaybooks.map((p) => ({
        playbook_id: p.playbook_id,
        name: p.name,
        d3fend: dedupeD3(p.steps.flatMap((s) => (s.d3fend_mapping ?? []).map((d) => ({ id: d.d3fend_technique_id, name: d.d3fend_technique_name })))),
      })),
      detect_d3fend,
    };
  });

  const inScope = rows.length;
  const detected = rows.filter((r) => r.detected).length;
  const correlated = rows.filter((r) => r.correlated).length;
  const responded = rows.filter((r) => r.responded).length;

  const kpis: CoverageKpis = {
    techniques_in_scope: inScope,
    detected,
    correlated,
    responded,
    detection_coverage_pct: pct(detected, inScope),
    response_coverage_pct: pct(responded, inScope),
    telemetry_gap: rows.filter((r) => !r.telemetry).length,
  };

  const orderedTactics = [...input.tactics].sort((a, b) => a.order - b.order);
  const byTactic = orderedTactics
    .map((tactic) => {
      const tRows = rows
        .filter((r) => r.tactic_shortnames.includes(tactic.shortname))
        .sort((a, b) => techniqueSort(a, b));
      return {
        tactic,
        rows: tRows,
        detected: tRows.filter((r) => r.detected).length,
        responded: tRows.filter((r) => r.responded).length,
      };
    })
    .filter((g) => g.rows.length > 0);

  return { rows: rows.sort(techniqueSort), kpis, byTactic };
}

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 100);
}

function dedupeD3(items: { id: string; name: string }[]): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const it of items) seen.set(it.id, it.name);
  return [...seen.entries()].map(([id, name]) => ({ id, name }));
}

/** parent techniques before their sub-techniques, then by id */
function techniqueSort(a: CoverageRow, b: CoverageRow): number {
  const ap = a.parent_technique_id ?? a.technique_id;
  const bp = b.parent_technique_id ?? b.technique_id;
  if (ap !== bp) return ap < bp ? -1 : 1;
  if (a.is_sub_technique !== b.is_sub_technique) return a.is_sub_technique ? 1 : -1;
  return a.technique_id < b.technique_id ? -1 : 1;
}
