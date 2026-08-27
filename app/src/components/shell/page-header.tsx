import * as React from "react";
import { Rocket } from "lucide-react";

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function MilestoneStub({ milestone, children }: { milestone: string; children: React.ReactNode }) {
  return (
    <div className="grid-noise anim-fade flex flex-col items-start gap-3 rounded-xl border border-dashed border-border bg-card/40 p-8">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/12 px-2.5 py-1 text-xs font-medium text-primary">
        <Rocket className="size-3.5" />
        Planned for milestone {milestone}
      </span>
      <div className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}
