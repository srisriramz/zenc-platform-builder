"use client";

import { Check, Minus } from "lucide-react";
import { useAdminTenants } from "@/hooks/use-platform";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/primitives";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QueryErrorState, TableSkeleton } from "@/components/states";

function Cell({ on }: { on: boolean }) {
  return on ? (
    <span className="inline-flex items-center gap-1 text-[var(--success)]"><Check className="size-4" /> enabled</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-muted-foreground"><Minus className="size-4" /> off</span>
  );
}

export default function EntitlementsPage() {
  const tenants = useAdminTenants();

  return (
    <>
      <PageHeader
        title="Entitlements"
        description="SIEM, SOC, and Assessment license independently per tenant. Each product must work with the others absent. Assessment stays off until Phase 2 is explicitly reactivated."
      />
      <Card>
        <CardContent className="pt-5">
          {tenants.isLoading && <TableSkeleton cols={4} />}
          {tenants.isError && <QueryErrorState error={tenants.error} onRetry={() => tenants.refetch()} />}
          {tenants.data && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>ZenC SIEM</TableHead>
                  <TableHead>ZenC SOC</TableHead>
                  <TableHead>ZenC Assessment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.data.map((t) => (
                  <TableRow key={t.tenant_id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell><Cell on={t.entitlements.has_siem} /></TableCell>
                    <TableCell><Cell on={t.entitlements.has_soc} /></TableCell>
                    <TableCell><Cell on={t.entitlements.has_assessment} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Changing an entitlement is an audited, deliberate action. In this demo the seed values are fixed; every
            change would be written to the append-only audit log.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
