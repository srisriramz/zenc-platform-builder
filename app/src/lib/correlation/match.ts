/**
 * Structured, bounded event matching for the correlation engine.
 *
 * Rules match against NORMALIZED events only, through this small typed spec —
 * never free code, eval, SQL, or a user RegExp (SKILL.md #2, #9). Wildcards
 * use the same linear glob matcher as the Log Explorer.
 */
import type { NormalizedEvent, TelemetrySourceFamily } from "@/schemas";
import { globToPredicate } from "@/lib/query/parser";

export interface EventMatch {
  /** any-of the listed event types */
  event_type?: string[];
  /** glob against event_type (e.g. "firewall_*deny*") */
  event_type_glob?: string;
  /** any-of the listed source families */
  source_family?: TelemetrySourceFamily[];
  /** event must carry an entity of this type */
  requires_entity?: NonNullable<NormalizedEvent["entities"]>[number]["entity_type"];
  /** event.attack_technique_refs must include any of these */
  attack_technique_any?: string[];
  /** occurred_at hour (UTC) window, e.g. { after_hour: 0, before_hour: 5 } */
  time_of_day?: { after_hour: number; before_hour: number };
  /** at least one IP entity is an external (RFC 5737 documentation) address */
  external_ip?: boolean;
}

const EXTERNAL_IP = /^(203\.0\.113|198\.51\.100|192\.0\.2)\./;

export function matchesEvent(
  event: NormalizedEvent,
  spec: EventMatch,
  familyOf: (telemetrySourceId: string) => TelemetrySourceFamily | undefined,
): boolean {
  if (event.normalization_status !== "normalized") return false;

  if (spec.event_type && !spec.event_type.includes(event.event_type)) return false;
  if (spec.event_type_glob && !globToPredicate(spec.event_type_glob)(event.event_type)) return false;

  if (spec.source_family) {
    const fam = familyOf(event.telemetry_source_id);
    if (!fam || !spec.source_family.includes(fam)) return false;
  }

  if (spec.requires_entity && !(event.entities ?? []).some((e) => e.entity_type === spec.requires_entity)) return false;

  if (spec.attack_technique_any) {
    const refs = event.attack_technique_refs ?? [];
    if (!spec.attack_technique_any.some((t) => refs.includes(t))) return false;
  }

  if (spec.time_of_day) {
    const h = new Date(event.occurred_at).getUTCHours();
    const { after_hour, before_hour } = spec.time_of_day;
    const inWindow = after_hour <= before_hour ? h >= after_hour && h < before_hour : h >= after_hour || h < before_hour;
    if (!inWindow) return false;
  }

  if (spec.external_ip) {
    const hasExt = (event.entities ?? []).some((e) => e.entity_type === "ip" && EXTERNAL_IP.test(e.value));
    if (!hasExt) return false;
  }

  return true;
}

/** value of a group-by key ("entity.user", "entity.host", "entity.ip", "external_ip") for an event */
export function groupKey(event: NormalizedEvent, key: string): string | undefined {
  if (key === "external_ip") {
    return (event.entities ?? []).find((e) => e.entity_type === "ip" && EXTERNAL_IP.test(e.value))?.value;
  }
  if (key.startsWith("entity.")) {
    const t = key.slice("entity.".length);
    return (event.entities ?? []).find((e) => e.entity_type === t)?.value;
  }
  return undefined;
}
