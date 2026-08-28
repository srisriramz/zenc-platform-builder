/**
 * Shared platform services — seeded demo data.
 * Identity/Access, Tenant/Partner, Entitlements, Policy Engine, Feature Flags.
 * All synthetic. No real organisation, person, or credential.
 */

export type RoleId =
  | "analyst"
  | "senior_analyst"
  | "approver"
  | "soc_manager"
  | "ciso"
  | "admin"
  | "reviewer"
  | "auditor";

export interface Role {
  id: RoleId;
  label: string;
  description: string;
  /** coarse RBAC permission slugs this role grants */
  permissions: Permission[];
}

export type Permission =
  | "siem.view"
  | "siem.query"
  | "siem.export"
  | "rule.view"
  | "rule.propose"
  | "rule.review"
  | "rule.enable" // human-only transition; never granted to an agent principal
  | "soc.view"
  | "case.work"
  | "action.request"
  | "action.approve"
  | "evidence.review"
  | "reporting.view" // cross-product analytics / KPI dashboards
  | "admin.identity"
  | "admin.policy"
  | "audit.view";

export const ROLES: Record<RoleId, Role> = {
  analyst: {
    id: "analyst",
    label: "SOC Analyst",
    description: "Works telemetry and cases; can query, triage, and request actions.",
    permissions: ["siem.view", "siem.query", "siem.export", "rule.view", "soc.view", "case.work", "action.request", "reporting.view"],
  },
  senior_analyst: {
    id: "senior_analyst",
    label: "Senior Analyst / Detection Engineer",
    description: "Analyst plus detection-rule authoring and peer review.",
    permissions: [
      "siem.view", "siem.query", "siem.export", "rule.view", "rule.propose", "rule.review",
      "soc.view", "case.work", "action.request", "reporting.view",
    ],
  },
  approver: {
    id: "approver",
    label: "Approver",
    description: "Independent approval of action requests, rule promotion to enabled, and case evidence review — the second-set-of-eyes function.",
    permissions: ["siem.view", "rule.view", "rule.review", "rule.enable", "soc.view", "action.approve", "evidence.review", "audit.view"],
  },
  soc_manager: {
    id: "soc_manager",
    label: "SOC Manager",
    description: "Read-only operational oversight — queue depth, workload, closure mix, KPI dashboards. Does not work cases or approve actions.",
    permissions: ["siem.view", "rule.view", "soc.view", "reporting.view", "audit.view"],
  },
  ciso: {
    id: "ciso",
    label: "CISO",
    description: "Read-only executive view — coverage, MTTD/MTTR trend, incident posture across SIEM and SOAR. No operational actions.",
    permissions: ["siem.view", "soc.view", "reporting.view", "audit.view"],
  },
  admin: {
    id: "admin",
    label: "Platform Admin",
    description: "Identity, entitlement, and policy administration. Not an approver by default.",
    permissions: ["siem.view", "soc.view", "rule.view", "reporting.view", "admin.identity", "admin.policy", "audit.view"],
  },
  reviewer: {
    id: "reviewer",
    label: "Reviewer",
    description: "Evidence review and (Phase 2) Assessment submission review.",
    permissions: ["siem.view", "soc.view", "evidence.review", "audit.view"],
  },
  auditor: {
    id: "auditor",
    label: "Auditor",
    description: "Read-only access to audit trail and platform state. Cannot change anything.",
    permissions: ["siem.view", "soc.view", "rule.view", "reporting.view", "audit.view"],
  },
};

export interface Entitlements {
  has_siem: boolean;
  has_soc: boolean;
  has_assessment: boolean; // Phase 2 — off everywhere until reactivated
}

export interface TenantPolicy {
  /** default autonomy ceiling for newly-added agent capability */
  default_autonomy_level: "L1" | "L2" | "L3" | "L4";
  /** action classes this tenant policy pre-authorises without per-request approval */
  pre_authorized_action_classes: ("A0" | "A1" | "A2" | "A3" | "A4")[];
  /** rule promotion always requires one independent human approver — not tenant-configurable */
  rule_promotion_requires_independent_human_approval: true;
  /** self-approval is never permitted — not tenant-configurable */
  self_approval_permitted: false;
  kill_switch: {
    scope: "tenant";
    engaged: boolean;
    engaged_reason?: string;
  };
}

export interface Tenant {
  tenant_id: string;
  partner_id: string;
  name: string;
  sector: string;
  entitlements: Entitlements;
  policy: TenantPolicy;
}

export interface Partner {
  partner_id: string;
  name: string;
  kill_switch: { scope: "partner"; engaged: boolean; engaged_reason?: string };
}

export interface User {
  user_id: string;
  display_name: string;
  email: string;
  /** roles are per-tenant */
  roles: { tenant_id: string; role: RoleId }[];
}

export const GLOBAL_KILL_SWITCH = {
  scope: "global" as const,
  engaged: false as boolean,
  engaged_reason: undefined as string | undefined,
};

export const PARTNERS: Partner[] = [
  { partner_id: "partner-meridian-mssp", name: "Meridian Managed Security", kill_switch: { scope: "partner", engaged: false } },
];

const basePolicy = (): TenantPolicy => ({
  default_autonomy_level: "L2",
  pre_authorized_action_classes: ["A0", "A1"],
  rule_promotion_requires_independent_human_approval: true,
  self_approval_permitted: false,
  kill_switch: { scope: "tenant", engaged: false },
});

export const TENANTS: Tenant[] = [
  {
    tenant_id: "tenant-northwind-bank",
    partner_id: "partner-meridian-mssp",
    name: "Northwind Bank (demo)",
    sector: "BFSI",
    entitlements: { has_siem: true, has_soc: true, has_assessment: false },
    policy: basePolicy(),
  },
  {
    tenant_id: "tenant-northwind-markets",
    partner_id: "partner-meridian-mssp",
    name: "Northwind Markets (demo)",
    sector: "BFSI",
    entitlements: { has_siem: true, has_soc: false, has_assessment: false },
    policy: basePolicy(),
  },
  {
    tenant_id: "tenant-summit-cu",
    partner_id: "partner-meridian-mssp",
    name: "Summit Credit Union (demo)",
    sector: "BFSI",
    entitlements: { has_siem: false, has_soc: true, has_assessment: false },
    policy: { ...basePolicy(), kill_switch: { scope: "tenant", engaged: false } },
  },
];

export const TENANT_MAP: Record<string, Tenant> = Object.fromEntries(
  TENANTS.map((t) => [t.tenant_id, t]),
);

export const USERS: User[] = [
  {
    user_id: "user-priya-analyst",
    display_name: "Priya Nair",
    email: "priya.nair@demo.zenc.example",
    roles: [
      { tenant_id: "tenant-northwind-bank", role: "analyst" },
      { tenant_id: "tenant-summit-cu", role: "analyst" },
    ],
  },
  {
    user_id: "user-marcus-senior",
    display_name: "Marcus Bell",
    email: "marcus.bell@demo.zenc.example",
    roles: [
      { tenant_id: "tenant-northwind-bank", role: "senior_analyst" },
      { tenant_id: "tenant-northwind-markets", role: "senior_analyst" },
    ],
  },
  {
    user_id: "user-dana-approver",
    display_name: "Dana Osei",
    email: "dana.osei@demo.zenc.example",
    roles: [
      { tenant_id: "tenant-northwind-bank", role: "approver" },
      { tenant_id: "tenant-northwind-markets", role: "approver" },
      { tenant_id: "tenant-summit-cu", role: "approver" },
    ],
  },
  {
    user_id: "user-ravi-manager",
    display_name: "Ravi Menon",
    email: "ravi.menon@demo.zenc.example",
    roles: [
      { tenant_id: "tenant-northwind-bank", role: "soc_manager" },
      { tenant_id: "tenant-summit-cu", role: "soc_manager" },
    ],
  },
  {
    user_id: "user-ava-ciso",
    display_name: "Ava Chen",
    email: "ava.chen@demo.zenc.example",
    roles: [
      { tenant_id: "tenant-northwind-bank", role: "ciso" },
      { tenant_id: "tenant-northwind-markets", role: "ciso" },
      { tenant_id: "tenant-summit-cu", role: "ciso" },
    ],
  },
  {
    user_id: "user-sam-admin",
    display_name: "Sam Whitfield",
    email: "sam.whitfield@demo.zenc.example",
    roles: [
      { tenant_id: "tenant-northwind-bank", role: "admin" },
      { tenant_id: "tenant-northwind-markets", role: "admin" },
      { tenant_id: "tenant-summit-cu", role: "admin" },
    ],
  },
  {
    user_id: "user-lena-reviewer",
    display_name: "Lena Fischer",
    email: "lena.fischer@demo.zenc.example",
    roles: [{ tenant_id: "tenant-northwind-bank", role: "reviewer" }],
  },
  {
    user_id: "user-omar-auditor",
    display_name: "Omar Haddad",
    email: "omar.haddad@demo.zenc.example",
    roles: [
      { tenant_id: "tenant-northwind-bank", role: "auditor" },
      { tenant_id: "tenant-northwind-markets", role: "auditor" },
      { tenant_id: "tenant-summit-cu", role: "auditor" },
    ],
  },
];

export const USER_MAP: Record<string, User> = Object.fromEntries(USERS.map((u) => [u.user_id, u]));
