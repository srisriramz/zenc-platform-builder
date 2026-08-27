"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Read/write URL search params without losing the rest of the query string.
 * This is how dashboards drill into operational screens: a stat tile or chart
 * mark links to `/log-explorer?q=…` or `/telemetry?source=…`, and the target
 * screen hydrates its state from the params on mount.
 *
 * Components using this must sit inside a <Suspense> boundary (Next App Router
 * requirement for useSearchParams).
 */
export function useNavParams() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const setParams = React.useCallback(
    (updates: Record<string, string | number | null | undefined>, opts?: { replace?: boolean }) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === undefined || value === "") next.delete(key);
        else next.set(key, String(value));
      }
      const qs = next.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (opts?.replace ?? true) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [params, pathname, router],
  );

  return { params, setParams };
}

/** Build a href for another screen with params, for use in <Link>. */
export function drillHref(path: string, params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}
