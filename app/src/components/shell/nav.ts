import type { Permission } from "@/data/platform";
import type { ProductArea } from "@/store/session";

export interface NavItem {
  href: string;
  label: string;
  section: "SIEM" | "SOC" | "Platform";
  product: ProductArea | "platform";
  /** entitlement gate */
  requires?: "has_siem" | "has_soc";
  /** RBAC gate — item hidden if the role lacks this permission */
  permission?: Permission;
  /** milestone in which this screen becomes real; until then it renders a roadmap stub */
  milestone?: "M2" | "M3" | "M4" | "M5";
}

export const NAV_ITEMS: NavItem[] = [
  // ---- SIEM ----
  { href: "/siem-dashboard", label: "SIEM Dashboard", section: "SIEM", product: "siem", requires: "has_siem", permission: "siem.view" },
  { href: "/telemetry", label: "Telemetry & Connectors", section: "SIEM", product: "siem", requires: "has_siem", permission: "siem.view" },
  { href: "/log-explorer", label: "Log Explorer", section: "SIEM", product: "siem", requires: "has_siem", permission: "siem.query" },
  { href: "/correlation", label: "Correlation", section: "SIEM", product: "siem", requires: "has_siem", permission: "siem.view", milestone: "M2" },
  { href: "/detections", label: "Detection Engineering", section: "SIEM", product: "siem", requires: "has_siem", permission: "rule.view", milestone: "M3" },
  { href: "/coverage", label: "ATT&CK × D3FEND Coverage", section: "SIEM", product: "siem", requires: "has_siem", permission: "siem.view", milestone: "M5" },

  // ---- SOC ----
  { href: "/soc-dashboard", label: "SOC Dashboard", section: "SOC", product: "soc", requires: "has_soc", permission: "soc.view", milestone: "M4" },
  { href: "/alerts", label: "Alert Intake", section: "SOC", product: "soc", requires: "has_soc", permission: "soc.view", milestone: "M4" },
  { href: "/cases", label: "Cases", section: "SOC", product: "soc", requires: "has_soc", permission: "case.work", milestone: "M4" },
  { href: "/agents/runs", label: "Agent Runs", section: "SOC", product: "soc", requires: "has_soc", permission: "soc.view", milestone: "M4" },
  { href: "/approvals", label: "Approval Queue", section: "SOC", product: "soc", requires: "has_soc", permission: "soc.view", milestone: "M4" },
  { href: "/playbooks", label: "Playbooks", section: "SOC", product: "soc", requires: "has_soc", permission: "soc.view", milestone: "M4" },
  { href: "/reporting", label: "SOC Reporting", section: "SOC", product: "soc", requires: "has_soc", permission: "soc.view", milestone: "M5" },

  // ---- Platform (shared services, kept minimal) ----
  { href: "/tenants", label: "Tenants", section: "Platform", product: "platform", permission: "admin.identity" },
  { href: "/users", label: "Users & Roles", section: "Platform", product: "platform", permission: "admin.identity" },
  { href: "/entitlements", label: "Entitlements", section: "Platform", product: "platform", permission: "admin.identity" },
  { href: "/policies", label: "Policies & Kill Switches", section: "Platform", product: "platform", permission: "admin.policy" },
  { href: "/audit", label: "Audit Trail", section: "Platform", product: "platform", permission: "audit.view" },
];
