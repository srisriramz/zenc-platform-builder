"use client";

import * as React from "react";

/**
 * Versioned, tenant-scoped localStorage for NON-SENSITIVE demo convenience
 * state only (saved searches, search history, UI prefs). Never credentials or
 * security evidence (references/frontend-ux-spec.md, security-governance.md).
 * Every access is wrapped in try/catch — private windows and disabled storage
 * must not break the page.
 */
const PREFIX = "zenc.v1";

export function scopedKey(tenantId: string, name: string) {
  return `${PREFIX}.${tenantId}.${name}`;
}

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

export function useScopedStorage<T>(tenantId: string | null, name: string, fallback: T) {
  const key = tenantId ? scopedKey(tenantId, name) : null;
  const [value, setValue] = React.useState<T>(() => (key ? readJson(key, fallback) : fallback));

  // Re-read when the scoped key changes (tenant switch). This is the
  // "adjust state while rendering" pattern — no effect, no cascading render.
  const [lastKey, setLastKey] = React.useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setValue(key ? readJson(key, fallback) : fallback);
  }

  const update = React.useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        if (key) writeJson(key, resolved);
        return resolved;
      });
    },
    [key],
  );

  return [value, update] as const;
}
