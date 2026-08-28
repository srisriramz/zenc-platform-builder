"use client";

import * as React from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import { useCorrelationRules } from "@/hooks/use-siem";
import { useNavParams } from "@/lib/use-nav";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/primitives";
import { EntitlementMissingState, LoadingState, QueryErrorState, TableSkeleton } from "@/components/states";
import { RuleCatalog } from "@/components/siem/correlation/rule-catalog";
import { RuleDetail } from "@/components/siem/correlation/rule-detail";

export default function DetectionsPage() {
  return (
    <React.Suspense fallback={<LoadingState label="Loading rules…" />}>
      <DetectionsInner />
    </React.Suspense>
  );
}

function DetectionsInner() {
  const { params, setParams } = useNavParams();
  const selectedRule = params.get("rule");
  const rules = useCorrelationRules();

  if (rules.isError) {
    return (
      <>
        <PageHeader title="Detection Engineering" />
        {(rules.error as { code?: string })?.code === "entitlement_missing" ? (
          <EntitlementMissingState message="Detection Engineering needs ZenC SIEM." />
        ) : (
          <QueryErrorState error={rules.error} onRetry={() => rules.refetch()} />
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Detection Engineering"
        description="The correlation-rule catalog and lifecycle. Rules only reach 'enabled' after human peer review and approval — always."
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/correlation">Alert stream</Link>
        </Button>
      </PageHeader>

      <div className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 flex-none" />
        <span>
          The rule catalog, structured logic, ATT&amp;CK / D3FEND mappings, regression results, and lifecycle are live.
          The <span className="font-medium text-foreground">authoring workflow</span> — the Detection Engineer Agent
          proposing a rule, a live regression run, peer review, and the human-only enable — arrives in{" "}
          <span className="font-medium text-foreground">M3</span> (see <code>templates/build-detection-rule.md</code>).
        </span>
      </div>

      <Card>
        <CardContent className="pt-5">
          {rules.isLoading ? (
            <TableSkeleton cols={7} />
          ) : (
            <RuleCatalog rules={rules.data ?? []} selectedId={selectedRule} onSelect={(r) => setParams({ rule: r.rule_id })} />
          )}
        </CardContent>
      </Card>

      {selectedRule && (
        <div className="mt-4">
          <RuleDetail ruleId={selectedRule} onClose={() => setParams({ rule: null })} />
        </div>
      )}
    </>
  );
}
