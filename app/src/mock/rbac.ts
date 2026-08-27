import { ROLES, TENANT_MAP, USER_MAP, type Permission, type RoleId } from "@/data/platform";

export interface SessionContext {
  userId: string;
  tenantId: string;
}

export class AccessError extends Error {
  constructor(
    public code: "not_authenticated" | "no_role_in_tenant" | "permission_denied" | "entitlement_missing" | "tenant_not_found",
    message: string,
  ) {
    super(message);
    this.name = "AccessError";
  }
}

export function roleInTenant(ctx: SessionContext): RoleId | null {
  const user = USER_MAP[ctx.userId];
  if (!user) return null;
  return user.roles.find((r) => r.tenant_id === ctx.tenantId)?.role ?? null;
}

export function permissionsFor(ctx: SessionContext): Permission[] {
  const role = roleInTenant(ctx);
  return role ? ROLES[role].permissions : [];
}

export function can(ctx: SessionContext, permission: Permission): boolean {
  return permissionsFor(ctx).includes(permission);
}

export function assertCan(ctx: SessionContext, permission: Permission): void {
  const user = USER_MAP[ctx.userId];
  if (!user) throw new AccessError("not_authenticated", "No authenticated demo user.");
  if (!TENANT_MAP[ctx.tenantId]) throw new AccessError("tenant_not_found", "Unknown tenant.");
  if (!roleInTenant(ctx)) {
    throw new AccessError("no_role_in_tenant", `${user.display_name} has no role in this tenant.`);
  }
  if (!can(ctx, permission)) {
    throw new AccessError("permission_denied", `This role does not grant "${permission}".`);
  }
}

export function assertEntitlement(ctx: SessionContext, entitlement: "has_siem" | "has_soc" | "has_assessment"): void {
  const tenant = TENANT_MAP[ctx.tenantId];
  if (!tenant) throw new AccessError("tenant_not_found", "Unknown tenant.");
  if (!tenant.entitlements[entitlement]) {
    const label = entitlement === "has_siem" ? "ZenC SIEM" : entitlement === "has_soc" ? "ZenC SOAR" : "ZenC Assessment";
    throw new AccessError("entitlement_missing", `${tenant.name} is not entitled to ${label}.`);
  }
}
