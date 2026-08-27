import { describe, expect, it } from "vitest";
import { globToPredicate, parseQuery } from "./parser";
import { QUERY_LIMITS } from "./fields";

function ok(q: string) {
  const r = parseQuery(q);
  if (!r.ok) throw new Error(`expected "${q}" to parse, got: ${r.message}`);
  return r;
}
function bad(q: string) {
  const r = parseQuery(q);
  if (r.ok) throw new Error(`expected "${q}" to be rejected`);
  return r;
}

describe("parseQuery — valid queries", () => {
  it("parses an empty query as match-all", () => {
    const r = ok("");
    expect(r.ast).toBeNull();
  });

  it("parses field:value equality", () => {
    const r = ok("event_type:windows_security_4625");
    expect(r.ast).toMatchObject({ type: "comparison", field: "event_type", operator: "eq", value: "windows_security_4625" });
  });

  it("parses quoted values with spaces", () => {
    const r = ok('quarantine_reason:"parse error"');
    expect(r.ast).toMatchObject({ operator: "eq", value: "parse error" });
  });

  it("parses AND / OR / NOT with grouping", () => {
    const r = ok("(source.family:firewall OR source.family:cloud) AND NOT normalization_status:quarantined");
    expect(r.ast?.type).toBe("and");
  });

  it("treats bare terms as free text", () => {
    const r = ok("powershell");
    expect(r.ast).toMatchObject({ type: "freetext", value: "powershell" });
  });

  it("parses exists", () => {
    expect(ok("attack_technique_refs:exists").ast).toMatchObject({ operator: "exists", field: "attack_technique_refs" });
  });

  it("parses datetime range operators", () => {
    const r = ok('occurred_at >= "2026-08-28T00:00:00Z"');
    expect(r.ast).toMatchObject({ operator: "gte", field: "occurred_at" });
  });

  it("parses wildcard match with *", () => {
    const r = ok("entity.host ~ web-*");
    expect(r.ast).toMatchObject({ operator: "wildcard", value: "web-*" });
    expect(r.wildcardCount).toBe(1);
  });

  it("counts conditions", () => {
    expect(ok("event_type:a AND schema_version:2 AND parser_version:x").conditionCount).toBe(3);
  });
});

describe("parseQuery — rejects injection & code", () => {
  for (const q of [
    'event_type:"x"; DROP TABLE events',
    "event_type:$(rm -rf /)",
    "event_type:`whoami`",
    "a:1 || b:2 { }",
    "event_type:x -- comment",
    "event_type:x /* c */",
    "field:\\x41",
  ]) {
    it(`rejects ${JSON.stringify(q)}`, () => {
      const r = bad(q);
      expect(r.message).toBeTruthy();
      expect(typeof r.position === "number" || r.position === undefined).toBe(true);
    });
  }
});

describe("parseQuery — grammar & allowlist errors", () => {
  it("rejects an unknown field", () => {
    expect(bad("definitely_not_a_field:1").message).toMatch(/unknown field/i);
  });

  it("rejects an operator not allowed on the field", () => {
    // occurred_at is datetime — ':' equality is not in its operator set
    expect(bad("occurred_at:2026").message).toMatch(/not allowed on field/i);
  });

  it("rejects a bad enum value", () => {
    expect(bad("normalization_status:sideways").message).toMatch(/not a valid value/i);
  });

  it("rejects a non-ISO datetime", () => {
    expect(bad('occurred_at >= "last tuesday"').message).toMatch(/not a valid ISO/i);
  });

  it("rejects a lone !", () => {
    expect(bad("event_type ! x").message).toMatch(/lone '!'/i);
  });

  it("rejects a dangling AND", () => {
    expect(bad("event_type:x AND").message).toMatch(/dangling and/i);
  });

  it("rejects a missing value", () => {
    expect(bad("event_type:").message).toMatch(/missing value/i);
  });

  it("rejects an unterminated string", () => {
    expect(bad('event_type:"open').message).toMatch(/unterminated/i);
  });

  it("rejects a missing closing paren", () => {
    expect(bad("(event_type:x AND source.family:cloud").message).toMatch(/closing/i);
  });

  it("rejects '~' with no wildcard", () => {
    expect(bad("entity.host ~ plainhost").message).toMatch(/no '\*'/i);
  });
});

describe("parseQuery — bounds", () => {
  it("rejects a query over the length cap", () => {
    expect(bad("a".repeat(QUERY_LIMITS.maxQueryLength + 1)).message).toMatch(/too long/i);
  });

  it("rejects too many conditions", () => {
    const q = Array.from({ length: QUERY_LIMITS.maxConditions + 2 }, (_, i) => `event_type:v${i}`).join(" OR ");
    expect(bad(q).message).toMatch(/too many conditions/i);
  });

  it("rejects grouping nested past the depth cap", () => {
    const depth = QUERY_LIMITS.maxGroupDepth + 1;
    const q = "(".repeat(depth) + "event_type:x" + ")".repeat(depth);
    expect(bad(q).message).toMatch(/nested too deep/i);
  });

  it("rejects too many '*' in one wildcard", () => {
    expect(bad(`entity.host ~ ${"*a".repeat(QUERY_LIMITS.maxWildcardStars + 1)}`).message).toMatch(/too many '\*'/i);
  });
});

describe("globToPredicate", () => {
  it("matches a prefix wildcard", () => {
    const p = globToPredicate("web-*");
    expect(p("web-01")).toBe(true);
    expect(p("db-01")).toBe(false);
  });

  it("matches an infix wildcard", () => {
    const p = globToPredicate("*deny*");
    expect(p("firewall_deny_all")).toBe(true);
    expect(p("firewall_allow")).toBe(false);
  });

  it("is case-insensitive and anchored", () => {
    const p = globToPredicate("HOST-*");
    expect(p("host-9")).toBe(true);
    expect(p("x-host-9")).toBe(false);
  });

  it("never builds a RegExp from input (no catastrophic backtracking possible)", () => {
    const p = globToPredicate("*a*a*a*a*");
    const start = performance.now();
    p("b".repeat(5000));
    expect(performance.now() - start).toBeLessThan(50);
  });
});
