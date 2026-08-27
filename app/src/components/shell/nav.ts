import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BadgeCheck,
  Boxes,
  BriefcaseBusiness,
  Building2,
  FileClock,
  Gauge,
  KeyRound,
  LayoutDashboard,
  Network,
  Radar,
  ScrollText,
  ShieldHalf,
  SlidersHorizontal,
  Siren,
  Table2,
  Users,
  Workflow,
} from "lucide-react";
import type { Permission } from "@/data/platform";
import type { ProductArea } from "@/store/session";

export interface NavItem {
  href: string;
  label: string;
  section: "SIEM" | "SOC" | "Platform";
  product: ProductArea | "platform";
  icon: LucideIcon;
  requires?: "has_siem" | "has_soc";
  permission?: Permission;
  milestone?: "M2" | "M3" | "M4" | "M5";
}

export const NAV_ITEMS: NavItem[] = [
  // ---- SIEM ----
  { href: "/siem-dashboard", label: "SIEM Dashboard", section: "SIEM", product: "siem", icon: LayoutDashboard, requires: "has_siem", permission: "siem.view" },
  { href: "/telemetry", label: "Telemetry & Connectors", section: "SIEM", product: "siem", icon: Network, requires: "has_siem", permission: "siem.view" },
  { href: "/log-explorer", label: "Log Explorer", section: "SIEM", product: "siem", icon: Table2, requires: "has_siem", permission: "siem.query" },
  { href: "/correlation", label: "Correlation", section: "SIEM", product: "siem", icon: Radar, requires: "has_siem", permission: "siem.view", milestone: "M2" },
  { href: "/detections", label: "Detection Engineering", section: "SIEM", product: "siem", icon: ShieldHalf, requires: "has_siem", permission: "rule.view", milestone: "M3" },
  { href: "/coverage", label: "ATT&CK × D3FEND Coverage", section: "SIEM", product: "siem", icon: Boxes, requires: "has_siem", permission: "siem.view", milestone: "M5" },

  // ---- SOC ----
  { href: "/soc-dashboard", label: "SOC Dashboard", section: "SOC", product: "soc", icon: Gauge, requires: "has_soc", permission: "soc.view", milestone: "M4" },
  { href: "/alerts", label: "Alert Intake", section: "SOC", product: "soc", icon: Siren, requires: "has_soc", permission: "soc.view", milestone: "M4" },
  { href: "/cases", label: "Cases", section: "SOC", product: "soc", icon: BriefcaseBusiness, requires: "has_soc", permission: "case.work", milestone: "M4" },
  { href: "/agents/runs", label: "Agent Runs", section: "SOC", product: "soc", icon: Workflow, requires: "has_soc", permission: "soc.view", milestone: "M4" },
  { href: "/approvals", label: "Approval Queue", section: "SOC", product: "soc", icon: BadgeCheck, requires: "has_soc", permission: "soc.view", milestone: "M4" },
  { href: "/playbooks", label: "Playbooks", section: "SOC", product: "soc", icon: ScrollText, requires: "has_soc", permission: "soc.view", milestone: "M4" },
  { href: "/reporting", label: "SOC Reporting", section: "SOC", product: "soc", icon: Activity, requires: "has_soc", permission: "soc.view", milestone: "M5" },

  // ---- Platform ----
  { href: "/tenants", label: "Tenants", section: "Platform", product: "platform", icon: Building2, permission: "admin.identity" },
  { href: "/users", label: "Users & Roles", section: "Platform", product: "platform", icon: Users, permission: "admin.identity" },
  { href: "/entitlements", label: "Entitlements", section: "Platform", product: "platform", icon: KeyRound, permission: "admin.identity" },
  { href: "/policies", label: "Policies & Kill Switches", section: "Platform", product: "platform", icon: SlidersHorizontal, permission: "admin.policy" },
  { href: "/audit", label: "Audit Trail", section: "Platform", product: "platform", icon: FileClock, permission: "audit.view" },
];
