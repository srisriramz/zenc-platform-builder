"use client";

import * as React from "react";
import { CircleUser, Play, RotateCcw, X } from "lucide-react";
import { USER_MAP } from "@/data/platform";
import { DEMO_SCRIPTS } from "@/lib/demo/scripts";
import { useGuidedDemo, useResetDemoState } from "@/hooks/use-demo";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

export default function DemoPage() {
  const demo = useGuidedDemo();
  const resetState = useResetDemoState();
  const [resetNote, setResetNote] = React.useState<string | null>(null);

  return (
    <>
      <PageHeader
        title="Guided Demo"
        description="Scripted walkthroughs of the platform. Each step navigates to the real screen and drives real seeded state — confirming a case, running an agent, requesting and approving a response — so nothing on screen is a mock-up of itself. The non-removable demo notice and every dry-run guarantee stay in force throughout."
      />

      {demo.running && demo.script && (
        <Card className="mb-6 border-primary/40">
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">
              In progress — {demo.script.label}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                step {demo.stepIndex + 1} of {demo.total}
              </span>
            </CardTitle>
            <div className="flex flex-none items-center gap-2">
              <Button size="sm" variant="default" onClick={demo.resume}>
                <Play /> Resume
              </Button>
              <Button size="sm" variant="outline" onClick={demo.restart} disabled={demo.busy}>
                <RotateCcw /> Restart
              </Button>
              <Button size="sm" variant="ghost" onClick={demo.exit} disabled={demo.busy}>
                <X /> Exit
              </Button>
            </div>
          </CardHeader>
          {demo.step && (
            <CardContent className="text-sm text-muted-foreground">
              Next up: <span className="font-medium text-foreground">{demo.step.title}</span> — {demo.step.presenterNote}
            </CardContent>
          )}
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {DEMO_SCRIPTS.map((script) => {
          const personas = [...new Set(script.steps.map((s) => s.persona))]
            .map((id) => USER_MAP[id]?.display_name ?? id);
          const isActive = demo.running && demo.script?.id === script.id;
          return (
            <Card key={script.id} className={isActive ? "border-primary/40" : undefined}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{script.label}</CardTitle>
                  <Badge variant="outline" className="flex-none text-[10px]">
                    {script.durationLabel}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{script.audience}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-relaxed text-muted-foreground">{script.summary}</p>

                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <CircleUser className="size-3.5" />
                  {personas.join(" · ")}
                </div>

                <ol className="space-y-1 text-sm">
                  {script.steps.map((s, i) => (
                    <li key={s.id} className="flex gap-2.5">
                      <span className="w-4 flex-none text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                      <span
                        className={
                          isActive && i === demo.stepIndex ? "font-medium text-foreground" : "text-muted-foreground"
                        }
                      >
                        {s.title}
                      </span>
                    </li>
                  ))}
                </ol>

                <Button
                  className="w-full"
                  size="sm"
                  variant={isActive ? "outline" : "default"}
                  disabled={demo.busy}
                  onClick={() => demo.start(script.id)}
                >
                  <Play /> {isActive ? "Restart this walkthrough" : `Start — ${script.label}`}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Reset demo state</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            The walkthroughs mutate the in-memory session overlay — cases opened, agents run, actions requested and
            approved. Resetting clears all of it and returns every screen to its seeded starting state. A full page
            reload does the same thing.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              resetState();
              if (demo.running) demo.exit();
              setResetNote("Demo state reset to the seeded baseline.");
            }}
          >
            <RotateCcw /> Reset now
          </Button>
          {resetNote && <p className="text-[var(--success)]">{resetNote}</p>}
        </CardContent>
      </Card>
    </>
  );
}
