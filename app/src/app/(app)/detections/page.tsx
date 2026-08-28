"use client";

import * as React from "react";
import { Bot, Info, Plus } from "lucide-react";
import { useCorrelationRules, useAskAgentToProposeRule } from "@/hooks/use-siem";
import { useFrameworks } from "@/hooks/use-platform";
import { useNavParams } from "@/lib/use-nav";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/primitives";
import { Menu, MenuItem, MenuLabel } from "@/components/ui/menu";
import { EntitlementMissingState, LoadingState, QueryErrorState, TableSkeleton } from "@/components/states";
import { RuleCatalog } from "@/components/siem/correlation/rule-catalog";
import { RuleDetail } from "@/components/siem/correlation/rule-detail";
import { RuleBuilder } from "@/components/siem/correlation/rule-builder";

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
  const building = params.get("new") === "1";
  const rules = useCorrelationRules();
  const frameworks = useFrameworks();
  const askAgent = useAskAgentToProposeRule();

  // techniques with no enabled rule = coverage gaps the agent can target
  const enabledTechniques = new Set(
    (rules.data ?? []).filter((r) => r.lifecycle_state === "enabled").flatMap((r) => r.attack_mapping.map((m) => m.technique_id)),
  );
  const gapTechniques = (frameworks.data?.attackTechniques ?? [])
    .filter((t) => !t.is_sub_technique && !enabledTechniques.has(t.technique_id))
    .slice(0, 12);

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
        description="The correlation-rule catalog and lifecycle: draft → test → peer review → approved → enabled. A rule only reaches enabled after human peer review and approval — always, and never by the agent that proposed it."
      >
        <Menu
          align="end"
          trigger={
            <Button variant="outline" size="sm" disabled={askAgent.isPending}>
              <Bot className="size-3.5" />
              {askAgent.isPending ? "Agent working…" : "Ask the agent"}
            </Button>
          }
        >
          {(close) => (
            <>
              <MenuLabel>Propose a rule for an uncovered technique</MenuLabel>
              {gapTechniques.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">No coverage gaps in the seeded set.</div>}
              {gapTechniques.map((t) => (
                <MenuItem
                  key={t.technique_id}
                  onClick={() => {
                    close();
                    askAgent.mutate(t.technique_id, { onSuccess: (r) => setParams({ rule: r.rule_id, new: null }) });
                  }}
                >
                  <span className="font-mono text-xs">{t.technique_id}</span> {t.name}
                </MenuItem>
              ))}
            </>
          )}
        </Menu>
        <Button size="sm" onClick={() => setParams({ new: building ? null : "1", rule: null })}>
          <Plus className="size-3.5" />
          Propose a rule
        </Button>
      </PageHeader>

      <div className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 flex-none" />
        <span>
          Regression runs against the deterministic ~72h sample (the synthetic corpus). A rule matching in test does not
          by itself prove detection quality — the health verdict says so when the result is ambiguous.
        </span>
      </div>

      {building && (
        <div className="mb-4">
          <RuleBuilder onClose={() => setParams({ new: null })} onCreated={(id) => setParams({ new: null, rule: id })} />
        </div>
      )}

      <Card>
        <CardContent className="pt-5">
          {rules.isLoading ? (
            <TableSkeleton cols={7} />
          ) : (
            <RuleCatalog rules={rules.data ?? []} selectedId={selectedRule} onSelect={(r) => setParams({ rule: r.rule_id, new: null })} />
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
