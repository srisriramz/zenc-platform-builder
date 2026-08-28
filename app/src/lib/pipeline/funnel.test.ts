import { describe, expect, it } from "vitest";
import { buildPipelineFunnel, type FunnelInputs } from "./funnel";

function inputs(over: Partial<FunnelInputs> = {}): FunnelInputs {
  return {
    tenantLabel: "Northwind Bank",
    families: [
      { family: "windows", label: "Windows", volumeWeight: 34, health: "healthy" },
      { family: "firewall", label: "Firewall", volumeWeight: 20, health: "degraded" },
      { family: "identity", label: "Identity", volumeWeight: 6, health: "healthy" },
    ],
    streamEventsPerDay: 158_000_000,
    streamBytesPerDay: 125_000_000_000,
    sampleWindowHours: 72,
    normalizedEvents: 2400,
    quarantinedEvents: 48,
    nativeAlerts: 26,
    thirdPartyAlerts: 3,
    acceptedEnvelopes: 29,
    candidates: 14,
    casesOpened: 4,
    casesPending: 10,
    actionsPlanned: 3,
    actionsExecuted: 1,
    mttdSeconds: 934,
    mttrSeconds: 14_400,
    agentAssistedPct: 100,
    agentAcceptancePct: 88,
    detectionCoveragePct: 32,
    responseCoveragePct: 20,
    ...over,
  };
}

describe("buildPipelineFunnel", () => {
  it("emits the seven stages in pipeline order", () => {
    const f = buildPipelineFunnel(inputs());
    expect(f.stages.map((s) => s.key)).toEqual(["collect", "normalize", "detect", "intake", "correlate", "case", "respond"]);
  });

  it("the funnel graphic never widens — widthPct is monotonically non-increasing", () => {
    const w = buildPipelineFunnel(inputs()).stages.map((s) => s.widthPct);
    for (let i = 1; i < w.length; i++) expect(w[i]).toBeLessThanOrEqual(w[i - 1] + 0.001);
    expect(w[w.length - 1]).toBeLessThan(w[0]);
  });

  it("expresses the alert→incident reduction as a % of the alert-envelopes that entered SOAR", () => {
    const f = buildPipelineFunnel(inputs());
    const byKey = Object.fromEntries(f.stages.map((s) => [s.key, s]));
    expect(byKey.intake.pctOfIntake).toBe(100); // 29/29
    expect(byKey.case.pctOfIntake).toBeLessThan(byKey.correlate.pctOfIntake!);
    expect(byKey.collect.pctOfIntake).toBeUndefined();
    expect(byKey.normalize.pctOfIntake).toBeUndefined();
  });

  it("ranks device families by volume share and the shares are ~100%", () => {
    const f = buildPipelineFunnel(inputs());
    expect(f.families.map((x) => x.label)).toEqual(["Windows", "Firewall", "Identity"]);
    const total = f.families.reduce((s, x) => s + x.sharePct, 0);
    expect(Math.abs(total - 100)).toBeLessThanOrEqual(2);
  });

  it("names the quarantine rate on the normalize stage and the dry-run marker on respond", () => {
    const f = buildPipelineFunnel(inputs());
    const byKey = Object.fromEntries(f.stages.map((s) => [s.key, s]));
    expect(byKey.normalize.sideNote).toMatch(/quarantined/);
    expect(byKey.respond.sideNote).toMatch(/dry-run/i);
  });

  it("maps agents onto stages and keeps QA + Supervisor spanning", () => {
    const f = buildPipelineFunnel(inputs());
    const byKey = Object.fromEntries(f.stages.map((s) => [s.key, s]));
    expect(byKey.collect.agents).toEqual([]);
    expect(byKey.case.agents).toContain("investigation-agent");
    expect(byKey.respond.agents).toContain("response-planner-agent");
    expect(f.spanningAgents).toEqual(["qa-governance-agent", "supervisor"]);
  });

  it("is deterministic", () => {
    expect(buildPipelineFunnel(inputs())).toEqual(buildPipelineFunnel(inputs()));
  });
});
