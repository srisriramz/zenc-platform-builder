"use client";

import Link from "next/link";
import { useAdminTenants } from "@/hooks/use-platform";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QueryErrorState, TableSkeleton } from "@/components/states";

export default function TenantsPage() {
  const tenants = useAdminTenants();

  return (
    <>
      <PageHeader
        title="Tenants"
        description="Partner- and tenant-scoped isolation. Each tenant's data is separate in the mock store; no query crosses a tenant boundary."
      >
        <Button asChild size="sm">
          <Link href="/onboarding">New tenant</Link>
        </Button>
      </PageHeader>
      <Card>
        <CardContent className="pt-5">
          {tenants.isLoading && <TableSkeleton cols={5} />}
          {tenants.isError && <QueryErrorState error={tenants.error} onRetry={() => tenants.refetch()} />}
          {tenants.data && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Sector</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Autonomy default</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.data.map((t) => (
                  <TableRow key={t.tenant_id}>
                    <TableCell>
                      <div className="font-medium">{t.name}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{t.tenant_id}</div>
                    </TableCell>
                    <TableCell>{t.sector}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{t.partner_id}</TableCell>
                    <TableCell className="space-x-1">
                      {t.entitlements.has_siem && <Badge variant="primary">SIEM</Badge>}
                      {t.entitlements.has_soc && <Badge variant="primary">SOAR</Badge>}
                      {t.entitlements.has_assessment && <Badge variant="outline">Assessment</Badge>}
                      {!t.entitlements.has_siem && !t.entitlements.has_soc && <span className="text-muted-foreground">none</span>}
                    </TableCell>
                    <TableCell>{t.policy.default_autonomy_level}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
