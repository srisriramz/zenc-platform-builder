/**
 * The ingestion → incident funnel for the "Why a SOC" explainer (`/why-soc`).
 *
 * Pure. Every figure is passed in from the assembled seed store (see
 * `fetchPipelineFunnel` in mock/api.ts) so the page never shows a fabricated
 * number — the funnel narrows because the real data does.
 *
 * Stage counts change unit along the pipeline (a per-day stream at the mouth,
 * then the materialised 72h sample), so `widthPct` is a log-scaled visual
 * weight for the funnel graphic, not a literal stage-to-stage ratio. The
 * honest reduction story lives in `cutFromDetectPct`, computed only across the
 * comparable alert→incident stages.
 */

export type FunnelStageKey =
  | "collect"
  | "normalize"
  | "detect"
  | "intake"
  | "correlate"
  | "case"
  | "respond";

export interface FunnelInputs {
  tenantLabel: string;
  families: { family: string; label: string; volumeWeight: number; health: string }[];
  streamEventsPerDay: number;
  streamBytesPerDay: number;
  sampleWindowHours: number;
  normalizedEvents: number;
  quarantinedEvents: number;
  nativeAlerts: number;
  thirdPartyAlerts: number;
  acceptedEnvelopes: number;
  candidates: number;
  casesOpened: number;
  casesPending: number;
  actionsPlanned: number;
  actionsExecuted: number;
  mttdSeconds: number | null;
  mttrSeconds: number | null;
  agentAssistedPct: number;
  agentAcceptancePct: number;
  detectionCoveragePct: number | null;
  responseCoveragePct: number | null;
}

export interface FunnelFamily {
  label: string;
  family: string;
  sharePct: number;
  health: string;
}

export interface FunnelStage {
  key: FunnelStageKey;
  label: string;
  /** one line on what happens at this stage */
  what: string;
  value: number;
  unit: string;
  /** secondary figure — "~2% quarantined", "+3 third-party", "1 awaiting a decision" */
  sideNote?: string;
  /** 0–100 visual weight for the funnel graphic (log-scaled) */
  widthPct: number;
  /** this stage as a % of the alert-envelopes that entered SOAR — set on detect…respond */
  pctOfIntake?: number;
  /** agent names that operate here */
  agents: string[];
  /** deep link into the live screen for this stage */
  href: string;
  screenLabel: string;
}

export interface PipelineFunnel {
  tenantLabel: string;
  families: FunnelFamily[];
  stages: FunnelStage[];
  /** agents that span the whole pipeline rather than a single stage */
  spanningAgents: string[];
  outcome: {
    mttdSeconds: number | null;
    mttrSeconds: number | null;
    agentAssistedPct: number;
    agentAcceptancePct: number;
    detectionCoveragePct: number | null;
    responseCoveragePct: number | null;
  };
}

const STAGE_META: Record<FunnelStageKey, { label: string; what: string; unit: string; href: string; screenLabel: string; agents: string[] }> = {
  collect: {
    label: "Collect",
    what: "Connectors stream raw telemetry from every device family into ZenC SIEM.",
    unit: "events / day",
    href: "/ingestion",
    screenLabel: "Traffic & Ingestion",
    agents: [],
  },
  normalize: {
    label: "Normalize",
    what: "Each event is parsed to a common shape and validated. A malformed event is quarantined with a reason, never dropped.",
    unit: "events · 72h sample",
    href: "/log-explorer",
    screenLabel: "Log Explorer",
    agents: ["intake-agent"],
  },
  detect: {
    label: "Detect",
    what: "Deterministic correlation rules fire on the normalized stream. No model decides a match; each alert cites the exact events behind it.",
    unit: "alerts",
    href: "/correlation",
    screenLabel: "Correlation",
    agents: ["detection-engineer-agent"],
  },
  intake: {
    label: "Intake",
    what: "Alerts cross into ZenC SOAR through the alert-envelope contract — the same path a third-party EDR uses. The Intake Agent normalizes them.",
    unit: "alert-envelopes",
    href: "/alerts",
    screenLabel: "Alert Intake",
    agents: ["intake-agent"],
  },
  correlate: {
    label: "Correlate",
    what: "Related envelopes are grouped into candidates — within 12h, sharing an entity, joined by a strong pivot. The Triage Agent recommends severity and open-vs-suppress.",
    unit: "candidates",
    href: "/alerts",
    screenLabel: "Alert Intake",
    agents: ["triage-agent"],
  },
  case: {
    label: "Investigate",
    what: "An analyst confirms and a case opens. Enrichment, Investigation, Hunt and the Digital Advisor attach cited context and findings.",
    unit: "cases opened",
    href: "/cases",
    screenLabel: "Cases",
    agents: ["enrichment-agent", "investigation-agent", "hunt-agent", "digital-advisor-agent"],
  },
  respond: {
    label: "Respond",
    what: "The Response Planner proposes a playbook step; a different person approves it; the deterministic Executor runs it as a dry-run and verifies it.",
    unit: "response actions",
    href: "/actions",
    screenLabel: "Response Actions",
    agents: ["response-planner-agent", "reporting-agent"],
  },
};

const STAGE_ORDER: FunnelStageKey[] = ["collect", "normalize", "detect", "intake", "correlate", "case", "respond"];

function logWidth(value: number, max: number, min: number): number {
  if (value <= 0) return min;
  const lv = Math.log10(value + 1);
  const lmax = Math.log10(max + 1);
  const lmin = Math.log10(2);
  const t = (lv - lmin) / Math.max(0.0001, lmax - lmin);
  return Math.round((min + t * (100 - min)) * 10) / 10;
}

export function buildPipelineFunnel(input: FunnelInputs): PipelineFunnel {
  const totalWeight = input.families.reduce((s, f) => s + f.volumeWeight, 0) || 1;
  const families: FunnelFamily[] = [...input.families]
    .sort((a, b) => b.volumeWeight - a.volumeWeight)
    .map((f) => ({
      label: f.label,
      family: f.family,
      sharePct: Math.round((f.volumeWeight / totalWeight) * 100),
      health: f.health,
    }));

  const rawValue = (k: FunnelStageKey): number => {
    switch (k) {
      case "collect":
        return input.streamEventsPerDay;
      case "normalize":
        return input.normalizedEvents;
      case "detect":
        return input.nativeAlerts;
      case "intake":
        return input.acceptedEnvelopes;
      case "correlate":
        return input.candidates;
      case "case":
        return input.casesOpened;
      case "respond":
        return input.actionsExecuted || input.actionsPlanned;
    }
  };

  const maxV = Math.max(...STAGE_ORDER.map(rawValue));
  const intakeV = Math.max(1, input.acceptedEnvelopes);

  const stages: FunnelStage[] = STAGE_ORDER.map((key) => {
    const meta = STAGE_META[key];
    const value = rawValue(key);
    const sideNote =
      key === "normalize"
        ? `${input.quarantinedEvents.toLocaleString()} quarantined (${pct(input.quarantinedEvents, input.normalizedEvents)}%)`
        : key === "detect" && input.thirdPartyAlerts > 0
          ? `+ ${input.thirdPartyAlerts} from third-party sensors`
          : key === "intake"
            ? `${input.thirdPartyAlerts} of them third-party, same contract`
            : key === "case"
              ? `${input.casesPending} candidate${input.casesPending === 1 ? "" : "s"} still awaiting an analyst's call`
              : key === "respond"
                ? "every action dry-run only"
                : key === "collect"
                  ? `${formatShort(input.streamBytesPerDay)}B/day on the wire`
                  : undefined;
    const pctOfIntake =
      key === "detect" || key === "intake" || key === "correlate" || key === "case" || key === "respond"
        ? Math.round((value / intakeV) * 100)
        : undefined;
    return {
      key,
      label: meta.label,
      what: meta.what,
      value,
      unit: meta.unit,
      sideNote,
      widthPct: logWidth(value, maxV, 14),
      pctOfIntake,
      agents: meta.agents,
      href: meta.href,
      screenLabel: meta.screenLabel,
    };
  });

  // the graphic is a funnel — clamp each band to no wider than the one above it
  // even where third-party sensors briefly widen the real count at intake
  for (let i = 1; i < stages.length; i++) {
    stages[i].widthPct = Math.min(stages[i].widthPct, stages[i - 1].widthPct);
  }

  return {
    tenantLabel: input.tenantLabel,
    families,
    stages,
    spanningAgents: ["qa-governance-agent", "supervisor"],
    outcome: {
      mttdSeconds: input.mttdSeconds,
      mttrSeconds: input.mttrSeconds,
      agentAssistedPct: input.agentAssistedPct,
      agentAcceptancePct: input.agentAcceptancePct,
      detectionCoveragePct: input.detectionCoveragePct,
      responseCoveragePct: input.responseCoveragePct,
    },
  };
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function formatShort(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)} T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} G`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} k`;
  return String(Math.round(n));
}
