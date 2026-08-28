/**
 * Seeded asset + identity registry. This is the read-only context the
 * Enrichment Agent attaches to a case — it is NOT telemetry and NOT evidence.
 * All synthetic. Hostnames/users match the entities in the seeded alerts.
 */

export interface Asset {
  asset_id: string;
  tenant_id: string;
  hostname: string;
  asset_type: "server" | "workstation" | "domain_controller" | "file_server" | "cloud_workload";
  environment: "production" | "corporate" | "dmz";
  criticality: "critical" | "high" | "moderate" | "low";
  owner_team: string;
  location: string;
  os: string;
}

export interface IdentityRecord {
  tenant_id: string;
  /** username or email as it appears on an alert entity */
  principal: string;
  kind: "employee" | "service_account" | "break_glass" | "contractor";
  department?: string;
  privileged: boolean;
  mfa_enrolled: boolean;
  status: "active" | "disabled";
}

export const ASSETS: Asset[] = [
  // Summit Credit Union
  { asset_id: "ast-scu-01", tenant_id: "tenant-summit-cu", hostname: "scu-fs-02", asset_type: "file_server", environment: "production", criticality: "critical", owner_team: "Infrastructure", location: "Branch DC / Rack B", os: "Windows Server 2022" },
  { asset_id: "ast-scu-02", tenant_id: "tenant-summit-cu", hostname: "scu-dc-01", asset_type: "domain_controller", environment: "production", criticality: "critical", owner_team: "Identity", location: "Branch DC / Rack A", os: "Windows Server 2019" },
  { asset_id: "ast-scu-03", tenant_id: "tenant-summit-cu", hostname: "scu-teller-14", asset_type: "workstation", environment: "corporate", criticality: "moderate", owner_team: "Retail Banking", location: "Elm Street Branch", os: "Windows 11" },
  { asset_id: "ast-scu-04", tenant_id: "tenant-summit-cu", hostname: "scu-batch-run", asset_type: "server", environment: "production", criticality: "high", owner_team: "Core Banking", location: "Branch DC / Rack C", os: "RHEL 9" },
  // Northwind Bank
  { asset_id: "ast-nwb-01", tenant_id: "tenant-northwind-bank", hostname: "nwb-ws-05", asset_type: "workstation", environment: "corporate", criticality: "moderate", owner_team: "Corporate Lending", location: "HQ / Floor 4", os: "Windows 11" },
  { asset_id: "ast-nwb-02", tenant_id: "tenant-northwind-bank", hostname: "nwb-srv-04", asset_type: "server", environment: "production", criticality: "high", owner_team: "Payments Platform", location: "Primary DC", os: "Windows Server 2022" },
  { asset_id: "ast-nwb-03", tenant_id: "tenant-northwind-bank", hostname: "nwb-dc-01", asset_type: "domain_controller", environment: "production", criticality: "critical", owner_team: "Identity", location: "Primary DC", os: "Windows Server 2022" },
  { asset_id: "ast-nwb-04", tenant_id: "tenant-northwind-bank", hostname: "nwb-jump-01", asset_type: "server", environment: "dmz", criticality: "high", owner_team: "Platform Security", location: "DMZ segment", os: "Windows Server 2019" },
];

export const IDENTITIES: IdentityRecord[] = [
  { tenant_id: "tenant-summit-cu", principal: "scu-svc-fileshare", kind: "service_account", department: "Infrastructure", privileged: true, mfa_enrolled: false, status: "active" },
  { tenant_id: "tenant-summit-cu", principal: "scu-teller-14", kind: "employee", department: "Retail Banking", privileged: false, mfa_enrolled: true, status: "active" },
  { tenant_id: "tenant-summit-cu", principal: "scu-cloud-admin", kind: "employee", department: "Cloud Platform", privileged: true, mfa_enrolled: true, status: "active" },
  { tenant_id: "tenant-summit-cu", principal: "scu-batch-run", kind: "service_account", department: "Core Banking", privileged: false, mfa_enrolled: false, status: "active" },
  { tenant_id: "tenant-northwind-bank", principal: "nwb-breakglass", kind: "break_glass", department: "Platform Security", privileged: true, mfa_enrolled: true, status: "active" },
  { tenant_id: "tenant-northwind-bank", principal: "agarcia@demo.zenc.example", kind: "employee", department: "Treasury", privileged: false, mfa_enrolled: true, status: "active" },
  { tenant_id: "tenant-northwind-bank", principal: "cfo-office@northwind-secure.test", kind: "contractor", department: "unknown (external look-alike domain)", privileged: false, mfa_enrolled: false, status: "disabled" },
];

export function assetFor(tenantId: string, hostname: string): Asset | undefined {
  const h = hostname.toLowerCase();
  return ASSETS.find((a) => a.tenant_id === tenantId && a.hostname.toLowerCase() === h);
}

export function identityFor(tenantId: string, principal: string): IdentityRecord | undefined {
  const p = principal.toLowerCase();
  return IDENTITIES.find((i) => i.tenant_id === tenantId && i.principal.toLowerCase() === p);
}
