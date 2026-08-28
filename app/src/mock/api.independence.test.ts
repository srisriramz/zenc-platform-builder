import { afterEach, describe, expect, it } from "vitest";
import * as api from "./api";
import { resetSession } from "./session-store";
import { getStore } from "./store";

/**
 * `references/testing-acceptance.md` → "Independence": SIEM completes
 * telemetry-to-alert with SOC absent; SOC completes a full case lifecycle with
 * SIEM absent; a product's endpoints degrade with a clear `entitlement_missing`
 * rather than hanging or crashing when the other product is not licensed.
 *
 * `tenant-northwind-markets` = SIEM only. `tenant-summit-cu` = SOC only.
 */

afterEach(() => resetSession());

const ENT_MISSING = /not entitled/i;

// ---- SIEM-only tenant ------------------------------------------------------

describe("SIEM runs with SOC absent (tenant-northwind-markets)", () => {
  const senior = { userId: "user-marcus-senior", tenantId: "tenant-northwind-markets" };

  it("the detect path works — telemetry, rules, and correlated alerts are all reachable", async () => {
    const sources = await api.fetchTelemetrySources(senior);
    expect(sources.length).toBeGreaterThan(0);

    const rules = await api.fetchCorrelationRules(senior);
    expect(rules.some((r) => r.lifecycle_state === "enabled")).toBe(true);

    const alerts = await api.fetchAlerts(senior);
    expect(alerts.length).toBeGreaterThan(0);
    // every alert on a SIEM-only tenant is a native ZenC-SIEM alert
    expect(alerts.every((a) => a.tenant_id === "tenant-northwind-markets")).toBe(true);

    const coverage = await api.fetchCoverageMatrix(senior);
    expect(coverage.rows.length).toBeGreaterThan(0);
  });

  it("every SOAR endpoint refuses with entitlement_missing — no hang, no crash", async () => {
    await expect(api.fetchIntakeQueue(senior)).rejects.toThrow(ENT_MISSING);
    await expect(api.fetchCases(senior)).rejects.toThrow(ENT_MISSING);
    await expect(api.fetchSocDashboard(senior)).rejects.toThrow(ENT_MISSING);
    await expect(api.fetchPlaybooks(senior)).rejects.toThrow(ENT_MISSING);
    await expect(api.fetchApprovalQueue(senior)).rejects.toThrow(ENT_MISSING);
    await expect(api.fetchSocReport(senior)).rejects.toThrow(ENT_MISSING);
  });
});

// ---- SOC-only tenant ------------------------------------------------------

describe("SOC runs a full case lifecycle with SIEM absent (tenant-summit-cu)", () => {
  const analyst = { userId: "user-priya-analyst", tenantId: "tenant-summit-cu" };
  const reviewer = { userId: "user-dana-approver", tenantId: "tenant-summit-cu" };

  it("intake → case → agents → close, entirely on third-party envelopes", async () => {
    const queue = await api.fetchIntakeQueue(analyst);
    // Summit CU's whole stream is third-party — there must be pending intake work
    expect(queue.pending.length).toBeGreaterThan(0);

    const { case_id } = await api.confirmCaseOpen(analyst, queue.pending[0].candidate.candidate_id);
    expect(case_id).toBeTruthy();

    await api.setCaseStatus(analyst, case_id, "investigating", "acceptance test");

    await api.runCaseAgent(analyst, case_id, "enrichment");
    await api.runCaseAgent(analyst, case_id, "investigation");

    const detail = await api.fetchCaseDetail(analyst, case_id);
    expect(detail.case.status).toBe("investigating");
    expect(detail.agentRuns.length).toBeGreaterThan(0);

    const closed = await api.closeCase(analyst, case_id, "true_positive", "acceptance test — resolved");
    expect(closed.status).toBe("closed");
  });

  it("evidence review is a separate person — the analyst submits, an independent reviewer approves", async () => {
    const queue = await api.fetchIntakeQueue(analyst);
    const { case_id } = await api.confirmCaseOpen(analyst, queue.pending[0].candidate.candidate_id);
    const { evidence_id } = await api.addCaseEvidence(analyst, {
      case_id,
      title: "packet capture",
      reference_type: "file",
      reference: "pcap://acceptance/1",
      confidence: 0.8,
    });
    // the case worker holds no evidence.review permission at all — the review
    // function is structurally a different person
    await expect(api.reviewEvidence(analyst, evidence_id, "approved")).rejects.toThrow(/does not grant|permission/i);
    const reviewed = await api.reviewEvidence(reviewer, evidence_id, "approved");
    expect(reviewed.review_state).toBe("approved");
  });

  it("every SIEM endpoint refuses with entitlement_missing — no hang, no crash", async () => {
    await expect(api.fetchTelemetrySources(analyst)).rejects.toThrow(ENT_MISSING);
    await expect(api.fetchCorrelationRules(analyst)).rejects.toThrow(ENT_MISSING);
    await expect(api.fetchAlerts(analyst)).rejects.toThrow(ENT_MISSING);
    await expect(api.fetchCoverageMatrix(analyst)).rejects.toThrow(ENT_MISSING);
    await expect(
      api.searchLogs(analyst, { query: "", fromIso: "2026-08-27T12:00:00.000Z", toIso: "2026-08-28T12:00:00.000Z" }),
    ).rejects.toThrow(ENT_MISSING);
  });

  it("the SOC report degrades — native pipeline stages and coverage are absent, not fabricated", async () => {
    const { report } = await api.fetchSocReport(analyst);
    const nativeStage = report.latency.pipeline.find((p) => p.key === "siem_detection");
    expect(nativeStage?.seconds ?? null).toBeNull();
    expect(report.coverage).toBeNull();
  });
});

// ---- store sanity --------------------------------------------------------

describe("the two tenants really are single-product", () => {
  it("northwind-markets has no seeded SOC state; summit-cu has no seeded SIEM alerts", () => {
    const store = getStore();
    expect(store.cases.some((c) => c.tenant_id === "tenant-northwind-markets")).toBe(false);
    expect(store.alerts.some((a) => a.tenant_id === "tenant-summit-cu")).toBe(false);
    // summit-cu's SOC work exists and is all third-party in origin
    expect(store.socAlerts.some((a) => a.tenant_id === "tenant-summit-cu")).toBe(true);
  });
});
