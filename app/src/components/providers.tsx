"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSession } from "@/store/session";
import { setSimMode } from "@/mock/api";
import { AccessError } from "@/mock/rbac";

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (count, error) => {
          // Never retry an auth/entitlement failure or a rejected query.
          if (error instanceof AccessError) return false;
          if (error instanceof Error && error.name === "QueryParseFault") return false;
          return count < 1;
        },
      },
    },
  });
}

let browserClient: QueryClient | undefined;
function getClient() {
  if (typeof window === "undefined") return makeClient();
  if (!browserClient) browserClient = makeClient();
  return browserClient;
}

function ThemeSync() {
  const theme = useSession((s) => s.theme);
  React.useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.classList.toggle("dark", dark);
    };
    apply();
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [theme]);
  return null;
}

function SimSync() {
  const sim = useSession((s) => s.sim);
  React.useEffect(() => {
    setSimMode(sim);
  }, [sim]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(getClient);
  return (
    <QueryClientProvider client={client}>
      <ThemeSync />
      <SimSync />
      {children}
    </QueryClientProvider>
  );
}
