/**
 * The Log Explorer query surface is a STRUCTURED, BOUNDED surface — never a
 * code editor. This file is the single source of truth for which fields are
 * queryable and which operators each one accepts. Anything not listed here is
 * rejected by the parser with a specific error (SKILL.md principle #9,
 * references/security-governance.md).
 */

export type FieldKind = "string" | "datetime" | "enum" | "string_array";

export type QueryOperator =
  | "eq" // field:value
  | "neq" // field != value
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "wildcard" // field ~ val*ue   (bounded glob, compiled to an anchored, escaped matcher — never a user RegExp)
  | "exists"; // field exists

export interface FieldDef {
  /** canonical queryable name, e.g. "event_type" or "entity.host" */
  name: string;
  kind: FieldKind;
  label: string;
  operators: QueryOperator[];
  /** allowed values for enum fields — used by the builder and to reject typos */
  enumValues?: readonly string[];
  /** included in free-text substring search */
  freeText?: boolean;
}

const STRING_OPS: QueryOperator[] = ["eq", "neq", "wildcard", "exists"];
const DATETIME_OPS: QueryOperator[] = ["gt", "gte", "lt", "lte", "exists"];
const ARRAY_OPS: QueryOperator[] = ["eq", "neq", "wildcard", "exists"];

export const QUERY_FIELDS: readonly FieldDef[] = [
  { name: "event_id", kind: "string", label: "Event ID", operators: STRING_OPS },
  { name: "telemetry_source_id", kind: "string", label: "Source ID", operators: STRING_OPS },
  {
    name: "source.family",
    kind: "enum",
    label: "Source family",
    operators: ["eq", "neq", "exists"],
    enumValues: ["windows", "linux_syslog", "firewall", "cloud", "identity", "email"],
  },
  { name: "event_type", kind: "string", label: "Event type", operators: STRING_OPS, freeText: true },
  { name: "occurred_at", kind: "datetime", label: "Occurred at", operators: DATETIME_OPS },
  { name: "ingested_at", kind: "datetime", label: "Ingested at", operators: DATETIME_OPS },
  {
    name: "normalization_status",
    kind: "enum",
    label: "Normalization status",
    operators: ["eq", "neq", "exists"],
    enumValues: ["normalized", "quarantined"],
  },
  { name: "quarantine_reason", kind: "string", label: "Quarantine reason", operators: STRING_OPS, freeText: true },
  { name: "parser_version", kind: "string", label: "Parser version", operators: STRING_OPS },
  { name: "schema_version", kind: "string", label: "Schema version", operators: STRING_OPS },
  { name: "attack_technique_refs", kind: "string_array", label: "ATT&CK technique (event-tagged)", operators: ARRAY_OPS },
  { name: "entity.host", kind: "string_array", label: "Host", operators: ARRAY_OPS, freeText: true },
  { name: "entity.user", kind: "string_array", label: "User", operators: ARRAY_OPS, freeText: true },
  { name: "entity.ip", kind: "string_array", label: "IP", operators: ARRAY_OPS, freeText: true },
  { name: "entity.domain", kind: "string_array", label: "Domain", operators: ARRAY_OPS, freeText: true },
  { name: "entity.hash", kind: "string_array", label: "Hash", operators: ARRAY_OPS, freeText: true },
  { name: "entity.cloud_resource", kind: "string_array", label: "Cloud resource", operators: ARRAY_OPS, freeText: true },
  { name: "entity.email_address", kind: "string_array", label: "Email address", operators: ARRAY_OPS, freeText: true },
] as const;

export const FIELD_MAP: Record<string, FieldDef> = Object.fromEntries(
  QUERY_FIELDS.map((f) => [f.name, f]),
);

export const FREE_TEXT_FIELDS = QUERY_FIELDS.filter((f) => f.freeText).map((f) => f.name);

/** Hard bounds — every tool call, human- or agent-issued, is subject to these. */
export const QUERY_LIMITS = {
  maxQueryLength: 2000,
  maxConditions: 24,
  maxGroupDepth: 5,
  maxWildcardsPerQuery: 8,
  maxWildcardStars: 4,
  maxResultRows: 1000,
  maxTimeRangeDays: 90,
  defaultResultRows: 100,
} as const;

export const OPERATOR_TOKENS: Record<string, QueryOperator> = {
  ":": "eq",
  "=": "eq",
  "!=": "neq",
  ">": "gt",
  ">=": "gte",
  "<": "lt",
  "<=": "lte",
  "~": "wildcard",
};
