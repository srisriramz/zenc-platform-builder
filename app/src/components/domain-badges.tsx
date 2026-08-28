import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/primitives";
import type { CaseStatus, EvidenceReviewState, HealthState, Severity, TaskStatus } from "@/schemas";
import type { RuleLifecycleState } from "@/schemas";

const SEV_STYLE: Record<Severity, string> = {
  critical: "bg-[color-mix(in_oklch,var(--sev-critical)_18%,transparent)] text-[var(--sev-critical)] border-transparent",
  high: "bg-[color-mix(in_oklch,var(--sev-high)_18%,transparent)] text-[var(--sev-high)] border-transparent",
  medium: "bg-[color-mix(in_oklch,var(--sev-medium)_22%,transparent)] text-[var(--sev-medium)] border-transparent",
  low: "bg-[color-mix(in_oklch,var(--sev-low)_20%,transparent)] text-[var(--sev-low)] border-transparent",
  informational: "bg-secondary text-secondary-foreground border-transparent",
};

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  return <Badge className={cn(SEV_STYLE[severity], "capitalize", className)}>{severity}</Badge>;
}

const HEALTH_STYLE: Record<HealthState, { label: string; variant: Parameters<typeof Badge>[0]["variant"] }> = {
  healthy: { label: "Healthy", variant: "success" },
  degraded: { label: "Degraded", variant: "warning" },
  stale: { label: "Stale", variant: "danger" },
  unknown: { label: "Unknown", variant: "outline" },
};

export function HealthBadge({ health, className }: { health: HealthState; className?: string }) {
  const h = HEALTH_STYLE[health];
  const unsettled = health === "degraded" || health === "stale";
  return (
    <Badge variant={h.variant} className={className}>
      <span className={cn("size-1.5 rounded-full bg-current", unsettled && "motion-safe:animate-pulse")} aria-hidden />
      {h.label}
    </Badge>
  );
}

const LIFECYCLE_STYLE: Record<RuleLifecycleState, Parameters<typeof Badge>[0]["variant"]> = {
  draft: "outline",
  test: "info",
  peer_review: "warning",
  approved: "primary",
  enabled: "success",
  disabled: "outline",
  retired: "outline",
};

export function LifecycleBadge({ state, className }: { state: RuleLifecycleState; className?: string }) {
  return (
    <Badge variant={LIFECYCLE_STYLE[state]} className={cn("capitalize", className)}>
      {state.replace("_", " ")}
    </Badge>
  );
}

const CASE_STATUS_STYLE: Record<CaseStatus, Parameters<typeof Badge>[0]["variant"]> = {
  new: "info",
  triaged: "primary",
  investigating: "warning",
  contained: "primary",
  recovering: "info",
  closed: "outline",
  reopened: "warning",
};

export function CaseStatusBadge({ status, className }: { status: CaseStatus; className?: string }) {
  return (
    <Badge variant={CASE_STATUS_STYLE[status]} className={cn("capitalize", className)}>
      {status}
    </Badge>
  );
}

const SLA_STYLE: Record<string, { variant: Parameters<typeof Badge>[0]["variant"]; label: string }> = {
  on_track: { variant: "success", label: "On track" },
  at_risk: { variant: "warning", label: "At risk" },
  breached: { variant: "danger", label: "Breached" },
};

export function SlaBadge({ status, className }: { status: "on_track" | "at_risk" | "breached"; className?: string }) {
  const s = SLA_STYLE[status];
  return (
    <Badge variant={s.variant} className={className}>
      {s.label}
    </Badge>
  );
}

const EVIDENCE_STYLE: Record<EvidenceReviewState, { variant: Parameters<typeof Badge>[0]["variant"]; label: string }> = {
  submitted: { variant: "info", label: "Submitted" },
  under_review: { variant: "warning", label: "Under review" },
  approved: { variant: "success", label: "Approved" },
  rejected: { variant: "danger", label: "Rejected" },
};

export function EvidenceStateBadge({ state, className }: { state: EvidenceReviewState; className?: string }) {
  const s = EVIDENCE_STYLE[state];
  return (
    <Badge variant={s.variant} className={className}>
      {s.label}
    </Badge>
  );
}

const TASK_STYLE: Record<TaskStatus, Parameters<typeof Badge>[0]["variant"]> = {
  open: "outline",
  in_progress: "info",
  blocked: "warning",
  done: "success",
  cancelled: "outline",
};

export function TaskStatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <Badge variant={TASK_STYLE[status]} className={cn("capitalize", className)}>
      {status.replace("_", " ")}
    </Badge>
  );
}

const ACTION_CLASS_STYLE: Record<string, { variant: Parameters<typeof Badge>[0]["variant"]; label: string }> = {
  A0: { variant: "outline", label: "A0 · reasoning" },
  A1: { variant: "outline", label: "A1 · read-only" },
  A2: { variant: "info", label: "A2 · reversible internal" },
  A3: { variant: "warning", label: "A3 · security control" },
  A4: { variant: "danger", label: "A4 · broad / privileged" },
};

export function ActionClassBadge({ actionClass, className }: { actionClass: string; className?: string }) {
  const s = ACTION_CLASS_STYLE[actionClass] ?? { variant: "outline" as const, label: actionClass };
  return (
    <Badge variant={s.variant} className={className}>
      {s.label}
    </Badge>
  );
}

const ACTION_STATUS_STYLE: Record<string, Parameters<typeof Badge>[0]["variant"]> = {
  draft: "outline",
  pending_approval: "warning",
  approved: "info",
  denied: "danger",
  expired: "outline",
  executed: "primary",
  verified: "success",
  rolled_back: "outline",
};

export function ActionStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant={ACTION_STATUS_STYLE[status] ?? "outline"} className={cn("capitalize", className)}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

export function FamilyLabel({ family }: { family: string }) {
  const map: Record<string, string> = {
    windows: "Windows",
    linux_syslog: "Linux / syslog",
    firewall: "Firewall",
    cloud: "Cloud",
    identity: "Identity",
    email: "Email",
  };
  return <span>{map[family] ?? family}</span>;
}
