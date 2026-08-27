import { DEMO_NOW_ISO, minus } from "@/lib/time";

export type TimeRangePreset = "15m" | "1h" | "6h" | "24h" | "72h" | "7d" | "custom";

export interface TimeRangeSelection {
  preset: TimeRangePreset;
  fromIso: string;
  toIso: string;
}

const PRESET_MINUTES: Record<Exclude<TimeRangePreset, "custom">, number> = {
  "15m": 15,
  "1h": 60,
  "6h": 360,
  "24h": 1440,
  "72h": 4320,
  "7d": 10080,
};

export const TIME_PRESETS: { value: TimeRangePreset; label: string }[] = [
  { value: "15m", label: "Last 15 min" },
  { value: "1h", label: "Last hour" },
  { value: "6h", label: "Last 6 hours" },
  { value: "24h", label: "Last 24 hours" },
  { value: "72h", label: "Last 72 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "custom", label: "Custom range" },
];

export function resolvePreset(preset: Exclude<TimeRangePreset, "custom">): TimeRangeSelection {
  return {
    preset,
    toIso: DEMO_NOW_ISO,
    fromIso: minus(DEMO_NOW_ISO, { minutes: PRESET_MINUTES[preset] }),
  };
}

export const DEFAULT_RANGE = resolvePreset("24h");
