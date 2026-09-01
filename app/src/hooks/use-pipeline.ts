"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchPipelineFunnel } from "@/mock/api";
import { useSessionContext } from "./use-platform";

/** The ingestion → incident funnel for the /why-soc explainer. */
export function usePipelineFunnel() {
  const ctx = useSessionContext();
  return useQuery({
    queryKey: ["pipeline-funnel", ctx?.userId],
    queryFn: () => fetchPipelineFunnel(ctx!),
    enabled: !!ctx,
    staleTime: 60_000,
  });
}
