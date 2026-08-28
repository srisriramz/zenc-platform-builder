"use client";

import Link from "next/link";
import { useAgents } from "@/hooks/use-siem";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/states";

export default function AgentsPage() {
  const agents = useAgents();

  return (
    <>
      <PageHeader
        title="Agents"
        description="The 12 bounded agents. Each has a fixed autonomy ceiling, a fixed tool allowlist, and a fixed output schema it cannot request its way out of. Agents recommend; deterministic services and humans execute."
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/agents/runs">Agent runs</Link>
        </Button>
      </PageHeader>

      {agents.isLoading && <LoadingState label="Loading roster…" />}

      {agents.data && (
        <div className="grid gap-4 md:grid-cols-2">
          {agents.data.map((a) => (
            <Card key={a.name} className={a.status === "live" ? "border-primary/40" : undefined}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span>{a.label}</span>
                  <span className="flex items-center gap-1.5">
                    <Badge variant="outline">{a.default_autonomy}</Badge>
                    <Badge variant={a.status === "live" ? "success" : "outline"}>{a.status === "live" ? "live" : "M4"}</Badge>
                  </span>
                </CardTitle>
                <p className="text-sm text-muted-foreground">{a.purpose}</p>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Tool allowlist (exhaustive)</p>
                  <ul className="space-y-1">
                    {a.tools.map((t) => (
                      <li key={t.name} className="flex items-baseline gap-2">
                        <Badge variant={t.access === "write" ? "warning" : "outline"} className="font-mono text-[10px]">
                          {t.access}
                        </Badge>
                        <span className="font-mono text-xs">{t.name}</span>
                        <span className="text-xs text-muted-foreground">— {t.bound}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Never does</p>
                  <ul className="list-inside list-disc text-xs text-muted-foreground">
                    {a.never_does.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
