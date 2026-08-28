import { afterEach, describe, expect, it } from "vitest";
import * as api from "./api";
import { resetSession } from "./session-store";

/**
 * `references/testing-acceptance.md` → "UI states": the timeout, server-error,
 * slow (loading), degraded-source and partial-result states must be reachable
 * on demand. The `sim` control (⌘K → Simulation) drives them through `gate()`;
 * this pins that the fault actually reaches the data layer for each mode.
 */

afterEach(() => {
  api.setSimMode("normal");
  resetSession();
});

const ctx = { userId: "user-priya-analyst", tenantId: "tenant-northwind-bank" };
const siem = { userId: "user-marcus-senior", tenantId: "tenant-northwind-bank" };

describe("the simulation control drives every fault state", () => {
  it("timeout — the request rejects with a simulated timeout", async () => {
    api.setSimMode("timeout");
    await expect(api.fetchCases(ctx)).rejects.toThrow(/timed out \(simulated\)/i);
  });

  it("server_error — the request rejects with a simulated service error", async () => {
    api.setSimMode("server_error");
    await expect(api.fetchCases(ctx)).rejects.toThrow(/returned an error.*simulated/i);
  });

  it("slow — the request still resolves, just later (loading state is exercised, not an error)", async () => {
    api.setSimMode("slow");
    const started = Date.now();
    const cases = await api.fetchCases(ctx);
    expect(Array.isArray(cases)).toBe(true);
    expect(Date.now() - started).toBeGreaterThan(1500);
  });

  it("degraded_source — a telemetry source comes back explicitly marked degraded", async () => {
    api.setSimMode("degraded_source");
    const sources = await api.fetchTelemetrySources(siem);
    expect(sources.some((s) => s.health === "degraded")).toBe(true);
  });

  it("partial — a log search returns a truncated result set flagged as partial", async () => {
    api.setSimMode("partial");
    const res = await api.searchLogs(siem, {
      query: "",
      fromIso: "2026-08-25T12:00:00.000Z",
      toIso: "2026-08-28T12:00:00.000Z",
    });
    expect(res.partial).toBe(true);
    expect(res.result.truncated).toBe(true);
  });

  it("normal — no fault; a clean result", async () => {
    api.setSimMode("normal");
    await expect(api.fetchCases(ctx)).resolves.toBeInstanceOf(Array);
  });
});
