import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BadgeCheck,
  Boxes,
  BriefcaseBusiness,
  Building2,
  Crosshair,
  FileCheck,
  FileClock,
  Fingerprint,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LineChart,
  Network,
  Radar,
  ScrollText,
  ShieldHalf,
  SlidersHorizontal,
  Siren,
  Table2,
  Users,
  Waves,
  Waypoints,
  Workflow,
  Zap,
} from "lucide-react";
import type { Permission } from "@/data/platform";
import type { ProductArea } from "@/store/session";

export interface NavItem {
  href: string;
  label: string;
  section: "SIEM" | "SOAR" | "Analytics" | "Platform";
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
  { href: "/ingestion", label: "Traffic & Ingestion", section: "SIEM", product: "siem", icon: Waves, requires: "has_siem", permission: "siem.view" },
  { href: "/log-explorer", label: "Log Explorer", section: "SIEM", product: "siem", icon: Table2, requires: "has_siem", permission: "siem.query" },
  { href: "/entities", label: "Entities at Risk", section: "SIEM", product: "siem", icon: Fingerprint, requires: "has_siem", permission: "siem.view" },
  { href: "/correlation", label: "Correlation", section: "SIEM", product: "siem", icon: Radar, requires: "has_siem", permission: "siem.view" },
  { href: "/detections", label: "Detection Engineering", section: "SIEM", product: "siem", icon: ShieldHalf, requires: "has_siem", permission: "rule.view" },
  { href: "/coverage", label: "ATT&CK × D3FEND Coverage", section: "SIEM", product: "siem", icon: Boxes, requires: "has_siem", permission: "siem.view", milestone: "M5" },

  // ---- SOAR (Respond product; internal key stays "soc") ----
  { href: "/soc-dashboard", label: "SOAR Dashboard", section: "SOAR", product: "soc", icon: Gauge, requires: "has_soc", permission: "soc.view" },
  { href: "/alerts", label: "Alert Intake", section: "SOAR", product: "soc", icon: Siren, requires: "has_soc", permission: "soc.view" },
  { href: "/cases", label: "Cases", section: "SOAR", product: "soc", icon: BriefcaseBusiness, requires: "has_soc", permission: "soc.view" },
  { href: "/evidence", label: "Evidence Review", section: "SOAR", product: "soc", icon: FileCheck, requires: "has_soc", permission: "soc.view" },
  { href: "/hunt", label: "Threat Hunt", section: "SOAR", product: "soc", icon: Crosshair, requires: "has_soc", permission: "soc.view" },
  { href: "/agents", label: "Agents", section: "SOAR", product: "soc", icon: Workflow, requires: "has_soc", permission: "soc.view" },
  { href: "/agents/runs", label: "Agent Runs", section: "SOAR", product: "soc", icon: Waypoints, requires: "has_soc", permission: "soc.view" },
  { href: "/playbooks", label: "Playbooks", section: "SOAR", product: "soc", icon: ScrollText, requires: "has_soc", permission: "soc.view" },
  { href: "/approvals", label: "Approval Queue", section: "SOAR", product: "soc", icon: BadgeCheck, requires: "has_soc", permission: "soc.view" },
  { href: "/actions", label: "Response Actions", section: "SOAR", product: "soc", icon: Zap, requires: "has_soc", permission: "soc.view" },
  { href: "/reporting", label: "SOAR Reporting", section: "SOAR", product: "soc", icon: Activity, requires: "has_soc", permission: "soc.view", milestone: "M5" },

  // ---- Analytics (cross-product reporting layer; degrades when a product is absent) ----
  { href: "/analytics", label: "Analytics", section: "Analytics", product: "platform", icon: LineChart, permission: "reporting.view" },

  // ---- Platform ----
  { href: "/tenants", label: "Tenants", section: "Platform", product: "platform", icon: Building2, permission: "admin.identity" },
  { href: "/users", label: "Users & Roles", section: "Platform", product: "platform", icon: Users, permission: "admin.identity" },
  { href: "/entitlements", label: "Entitlements", section: "Platform", product: "platform", icon: KeyRound, permission: "admin.identity" },
  { href: "/policies", label: "Policies & Kill Switches", section: "Platform", product: "platform", icon: SlidersHorizontal, permission: "admin.policy" },
  { href: "/audit", label: "Audit Trail", section: "Platform", product: "platform", icon: FileClock, permission: "audit.view" },
];
