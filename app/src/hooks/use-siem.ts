"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  fetchEventLineage,
  fetchQuarantineQueue,
  fetchTelemetrySources,
  searchLogs,
  type LogSearchInput,
} from "@/mock/api";
import { useSession } from "@/store/session";
import { useSessionContext } from "./use-platform";

export function useTelemetrySources() {
  const ctx = useSessionContext();
  const sim = useSession((s) => s.sim);
  return useQuery({
    queryKey: ["telemetry-sources", ctx?.tenantId, sim],
    queryFn: () => fetchTelemetrySources(ctx!),
    enabled: !!ctx,
  });
}

export function useQuarantineQueue() {
  const ctx = useSessionContext();
  const sim = useSession((s) => s.sim);
  return useQuery({
    queryKey: ["quarantine", ctx?.tenantId, sim],
    queryFn: () => fetchQuarantineQueue(ctx!),
    enabled: !!ctx,
  });
}

export function useLogSearch(input: LogSearchInput | null) {
  const ctx = useSessionContext();
  const sim = useSession((s) => s.sim);
  return useQuery({
    queryKey: ["log-search", ctx?.tenantId, sim, input],
    queryFn: () => searchLogs(ctx!, input!),
    enabled: !!ctx && !!input,
    placeholderData: keepPreviousData,
  });
}

export function useEventLineage(eventId: string | null) {
  const ctx = useSessionContext();
  return useQuery({
    queryKey: ["event-lineage", ctx?.tenantId, eventId],
    queryFn: () => fetchEventLineage(ctx!, eventId!),
    enabled: !!ctx && !!eventId,
  });
}
