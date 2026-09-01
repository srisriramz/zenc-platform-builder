"use client";

import { useAdminTenants, useAdminUsers } from "@/hooks/use-platform";
import { ROLES } from "@/data/platform";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/primitives";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QueryErrorState, TableSkeleton } from "@/components/states";

export default function UsersPage() {
  const users = useAdminUsers();
  const tenants = useAdminTenants();
  const tenantName = (id: string) => tenants.data?.find((t) => t.tenant_id === id)?.name ?? id;

  return (
    <>
      <PageHeader
        title="Users & Roles"
        description="RBAC roles (analyst, senior analyst, approver, SOC manager, CISO, admin, reviewer, auditor, super admin) assigned per tenant. Agent tool access is allowlisted separately — never inherited from a user."
      />

      <Card>
        <CardContent className="pt-5">
          {users.isLoading && <TableSkeleton cols={3} />}
          {users.isError && <QueryErrorState error={users.error} onRetry={() => users.refetch()} />}
          {users.data && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Key permissions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.data.flatMap((u) =>
                  u.roles.map((r) => (
                    <TableRow key={`${u.user_id}:${r.tenant_id}`}>
                      <TableCell>
                        <div className="font-medium">{u.display_name}</div>
                        <div className="text-[11px] text-muted-foreground">{u.email}</div>
                      </TableCell>
                      <TableCell>{tenantName(r.tenant_id)}</TableCell>
                      <TableCell>{ROLES[r.role].label}</TableCell>
                      <TableCell className="space-x-1">
                        {ROLES[r.role].permissions.slice(0, 4).map((p) => (
                          <Badge key={p} variant="outline" className="font-mono text-[10px]">
                            {p}
                          </Badge>
                        ))}
                        {ROLES[r.role].permissions.length > 4 && (
                          <span className="text-[11px] text-muted-foreground">+{ROLES[r.role].permissions.length - 4}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )),
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Role reference</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {Object.values(ROLES).map((role) => (
            <div key={role.id} className="rounded-md border border-border p-3">
              <p className="text-sm font-medium">{role.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{role.description}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
