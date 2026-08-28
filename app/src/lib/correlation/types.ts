import type { EventMatch } from "./match";

/**
 * Structured rule definitions per rule_type. The correlation-rule schema keeps
 * `definition` as an open object; these are the shapes the deterministic
 * engine actually understands. A rule builder (M3) would produce exactly
 * these — there is no free-text / code path.
 */
export type GroupByKey = "entity.user" | "entity.host" | "entity.ip" | "external_ip";

export interface SingleEventDefinition {
  kind: "single_event";
  match: EventMatch;
}

export interface ThresholdDefinition {
  kind: "threshold";
  match: EventMatch;
  group_by: GroupByKey;
  threshold: number;
  window_seconds: number;
}

export interface SequenceDefinition {
  kind: "sequence";
  /** each step must occur at least `min_count` times (default 1), in order */
  steps: { match: EventMatch; min_count?: number }[];
  join_by: GroupByKey;
  within_seconds: number;
}

export interface EntityJoinDefinition {
  kind: "entity_join";
  left: EventMatch;
  right: EventMatch;
  join_by: GroupByKey;
  within_seconds: number;
}

export type RuleDefinition =
  | SingleEventDefinition
  | ThresholdDefinition
  | SequenceDefinition
  | EntityJoinDefinition;
