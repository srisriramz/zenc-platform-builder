import { describe, expect, it } from "vitest";
import type { NormalizedEvent } from "@/schemas";
import { bandForScore, entityRiskSchema } from "@/schemas";
import { deriveEntityRisk } from "./entity-risk";

function ev(partial: Partial<NormalizedEvent> & { event_type: string }): NormalizedEvent {
  return {
    event_id: Math.random().toString(36).slice(2),
    tenant_id: "t1",
    telemetry_source_id: "ts",
    occurred_at: "2026-08-28T10:00:00Z",
    ingested_at: "2026-08-28T10:00:05Z",
    raw_payload_ref: "raw/x",
    normalization_status: "normalized",
    ...partial,
  };
}

describe("bandForScore", () => {
  it("maps score to band deterministically", () => {
    expect(bandForScore(10)).toBe("low");
    expect(bandForScore(30)).toBe("elevated");
    expect(bandForScore(60)).toBe("high");
    expect(bandForScore(85)).toBe("critical");
    expect(bandForScore(100)).toBe("critical");
  });
});

describe("deriveEntityRisk", () => {
  it("returns nothing for a tenant with no events", () => {
    expect(deriveEntityRisk([], "t1")).toEqual([]);
  });

  it("ignores entities with fewer than 3 events", () => {
    const events = [
      ev({ event_type: "windows_security_4625", entities: [{ entity_type: "user", value: "rare" }] }),
      ev({ event_type: "windows_security_4625", entities: [{ entity_type: "user", value: "rare" }] }),
    ];
    expect(deriveEntityRisk(events, "t1").find((r) => r.value === "rare")).toBeUndefined();
  });

  it("scores an entity from its observed signals and traces each signal to a query", () => {
    const noisy = (t: string, extra: Partial<NormalizedEvent> = {}) =>
      ev({ event_type: t, entities: [{ entity_type: "user", value: "svc-x" }], ...extra });
    const events = [
      ...Array.from({ length: 8 }, () => noisy("windows_security_4625")),
      ...Array.from({ length: 3 }, () => noisy("linux_sudo_command")),
      noisy("email_forwarding_rule_created"),
      noisy("windows_powershell_4104", { attack_technique_refs: ["T1059.001"] }),
    ];
    const [risk] = deriveEntityRisk(events, "t1").filter((r) => r.value === "svc-x");
    expect(risk).toBeDefined();
    expect(risk.score).toBeGreaterThan(20);
    expect(risk.score).toBeLessThanOrEqual(100);
    expect(risk.band).toBe(bandForScore(risk.score));
    expect(risk.is_indicative).toBe(true);
    // every signal keeps an evidence query scoped to the entity
    for (const s of risk.signals) {
      expect(s.evidence_query).toContain("entity.user:svc-x");
    }
    expect(entityRiskSchema.safeParse(risk).success).toBe(true);
  });

  it("scopes to a tenant — other tenants' events do not contribute", () => {
    const events = Array.from({ length: 6 }, () =>
      ev({ event_type: "windows_security_4625", tenant_id: "other", entities: [{ entity_type: "user", value: "x" }] }),
    );
    expect(deriveEntityRisk(events, "t1")).toEqual([]);
  });

  it("caps the output at 20 entities, highest score first", () => {
    const events: NormalizedEvent[] = [];
    for (let u = 0; u < 40; u++) {
      for (let i = 0; i < 5; i++) {
        events.push(ev({ event_type: "windows_security_4625", entities: [{ entity_type: "user", value: `u${u}` }] }));
      }
    }
    const out = deriveEntityRisk(events, "t1");
    expect(out.length).toBeLessThanOrEqual(20);
    for (let i = 1; i < out.length; i++) expect(out[i - 1].score).toBeGreaterThanOrEqual(out[i].score);
  });
});
