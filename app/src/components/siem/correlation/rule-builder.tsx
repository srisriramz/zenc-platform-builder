"use client";

import * as React from "react";
import { X } from "lucide-react";
import { useProposeRule } from "@/hooks/use-siem";
import { useFrameworks } from "@/hooks/use-platform";
import type { RuleDefinition, GroupByKey } from "@/lib/correlation/types";
import type { CorrelationRule } from "@/schemas";
import { Card, CardContent, CardHeader, CardTitle, Input, Label, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

const EVENT_TYPES = [
  "windows_security_4624",
  "windows_security_4625",
  "windows_powershell_4104",
  "windows_service_7045",
  "windows_process_4688",
  "windows_defender_1116",
  "linux_sshd_accepted",
  "linux_sshd_failed",
  "linux_sudo_command",
  "linux_cron_job",
  "linux_auditd_execve",
  "firewall_allow",
  "firewall_deny",
  "firewall_ids_alert",
  "firewall_dns_query",
  "cloud_console_login",
  "cloud_iam_policy_change",
  "cloud_storage_download",
  "cloud_guardrail_disabled",
  "idp_signin_success",
  "idp_signin_failure",
  "idp_mfa_challenge",
  "idp_role_grant",
  "idp_account_discovery",
  "email_delivered",
  "email_blocked_phish",
  "email_forwarding_rule_created",
];

type BuilderType = "single_event" | "threshold" | "entity_join";

export function RuleBuilder({ onClose, onCreated }: { onClose: () => void; onCreated: (ruleId: string) => void }) {
  const propose = useProposeRule();
  const frameworks = useFrameworks();
  const [name, setName] = React.useState("");
  const [ruleType, setRuleType] = React.useState<BuilderType>("threshold");
  const [severity, setSeverity] = React.useState<NonNullable<CorrelationRule["severity"]>>("medium");
  const [confidence, setConfidence] = React.useState(0.6);
  const [eventTypes, setEventTypes] = React.useState<string[]>(["windows_security_4625"]);
  const [rightEventTypes, setRightEventTypes] = React.useState<string[]>(["cloud_storage_download"]);
  const [externalIp, setExternalIp] = React.useState(false);
  const [groupBy, setGroupBy] = React.useState<GroupByKey>("external_ip");
  const [threshold, setThreshold] = React.useState(10);
  const [windowSeconds, setWindowSeconds] = React.useState(600);
  const [techniqueId, setTechniqueId] = React.useState("T1110");
  const [d3fendId, setD3fendId] = React.useState("D3-IAA");
  const [err, setErr] = React.useState<string | null>(null);

  const techniques = frameworks.data?.attackTechniques ?? [];
  const d3fend = frameworks.data?.d3fendTechniques.filter((d) => d.side.includes("detect")) ?? [];
  const tech = techniques.find((t) => t.technique_id === techniqueId);
  const d3 = d3fend.find((d) => d.d3fend_technique_id === d3fendId);

  const toggle = (list: string[], set: (v: string[]) => void, t: string) =>
    set(list.includes(t) ? list.filter((x) => x !== t) : [...list, t]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim() || eventTypes.length === 0 || !tech || !d3) {
      setErr("Name, at least one event type, an ATT&CK technique, and a D3FEND mapping are required.");
      return;
    }
    let definition: RuleDefinition;
    if (ruleType === "single_event") {
      definition = { kind: "single_event", match: { event_type: eventTypes, ...(externalIp ? { external_ip: true } : {}) } };
    } else if (ruleType === "threshold") {
      definition = {
        kind: "threshold",
        match: { event_type: eventTypes, ...(externalIp ? { external_ip: true } : {}) },
        group_by: groupBy,
        threshold,
        window_seconds: windowSeconds,
      };
    } else {
      definition = {
        kind: "entity_join",
        left: { event_type: eventTypes },
        right: { event_type: rightEventTypes },
        join_by: groupBy === "external_ip" ? "entity.user" : groupBy,
        within_seconds: windowSeconds,
      };
    }

    propose.mutate(
      {
        name: name.trim(),
        rule_type: ruleType,
        severity,
        confidence,
        definition,
        attack_mapping: [{ tactic: titleCase(tech.tactic_shortnames[0] ?? ""), technique_id: tech.technique_id, technique_name: tech.name }],
        d3fend_mapping: [{ d3fend_technique_id: d3.d3fend_technique_id, d3fend_technique_name: d3.d3fend_technique_name, category: d3.category }],
        alert_title: name.trim(),
      },
      {
        onSuccess: (r) => onCreated(r.rule_id),
        onError: (e) => setErr(e instanceof Error ? e.message : "Could not create the rule."),
      },
    );
  }

  return (
    <Card className="border-primary/40">
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle>Propose a correlation rule</CardTitle>
          <p className="text-sm text-muted-foreground">
            Structured only — there is no code / SQL / regex field. The rule starts in <code>draft</code>; you run
            regression, then a different person peer-reviews and enables it.
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="rb-name">Rule name</Label>
              <Input id="rb-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Repeated MFA denials for one account" />
            </div>
            <div>
              <Label htmlFor="rb-type">Rule type</Label>
              <Select id="rb-type" value={ruleType} onChange={(e) => setRuleType(e.target.value as BuilderType)}>
                <option value="single_event">Single event</option>
                <option value="threshold">Threshold</option>
                <option value="entity_join">Entity join</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="rb-sev">Severity</Label>
              <Select id="rb-sev" value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)}>
                {["informational", "low", "medium", "high", "critical"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="rb-conf">Confidence: {Math.round(confidence * 100)}%</Label>
              <input id="rb-conf" type="range" min={0} max={100} value={confidence * 100} onChange={(e) => setConfidence(Number(e.target.value) / 100)} className="w-full" />
            </div>
          </div>

          <div>
            <Label>{ruleType === "entity_join" ? "Left match — event types" : "Match — event types"}</Label>
            <div className="mt-1 flex max-h-32 flex-wrap gap-1 overflow-y-auto rounded-md border border-border p-2">
              {EVENT_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggle(eventTypes, setEventTypes, t)}
                  className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${eventTypes.includes(t) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {ruleType === "entity_join" && (
            <div>
              <Label>Right match — event types</Label>
              <div className="mt-1 flex max-h-32 flex-wrap gap-1 overflow-y-auto rounded-md border border-border p-2">
                {EVENT_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggle(rightEventTypes, setRightEventTypes, t)}
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${rightEventTypes.includes(t) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {ruleType !== "entity_join" && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={externalIp} onChange={(e) => setExternalIp(e.target.checked)} />
              Require an external (RFC 5737) IP entity
            </label>
          )}

          {(ruleType === "threshold" || ruleType === "entity_join") && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="rb-group">{ruleType === "threshold" ? "Group by" : "Join by"}</Label>
                <Select id="rb-group" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupByKey)}>
                  <option value="external_ip">external IP</option>
                  <option value="entity.ip">entity.ip</option>
                  <option value="entity.user">entity.user</option>
                  <option value="entity.host">entity.host</option>
                </Select>
              </div>
              {ruleType === "threshold" && (
                <div>
                  <Label htmlFor="rb-thr">Threshold (count)</Label>
                  <Input id="rb-thr" type="number" min={2} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
                </div>
              )}
              <div>
                <Label htmlFor="rb-win">Window (seconds)</Label>
                <Input id="rb-win" type="number" min={30} value={windowSeconds} onChange={(e) => setWindowSeconds(Number(e.target.value))} />
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="rb-att">ATT&amp;CK technique</Label>
              <Select id="rb-att" value={techniqueId} onChange={(e) => setTechniqueId(e.target.value)}>
                {techniques.map((t) => (
                  <option key={t.technique_id} value={t.technique_id}>
                    {t.technique_id} — {t.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="rb-d3">D3FEND (detect side)</Label>
              <Select id="rb-d3" value={d3fendId} onChange={(e) => setD3fendId(e.target.value)}>
                {d3fend.map((d) => (
                  <option key={d.d3fend_technique_id} value={d.d3fend_technique_id}>
                    {d.d3fend_technique_id} — {d.d3fend_technique_name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {err && <p className="text-sm text-[var(--destructive)]">{err}</p>}

          <div className="flex gap-2">
            <Button type="submit" disabled={propose.isPending}>
              {propose.isPending ? "Creating…" : "Create draft"}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function titleCase(s: string): string {
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
