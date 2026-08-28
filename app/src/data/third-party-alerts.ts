import type { AlertEnvelope } from "@/schemas";
import { DEMO_NOW_ISO, minus } from "@/lib/time";

/**
 * Seeded third-party alerts. ZenC SOAR must run with ZenC SIEM absent, and it
 * must treat a third-party alert identically to a native one — these fixtures
 * prove both. Summit Credit Union is SOC-only, so its entire alert stream is
 * third-party; Northwind Bank gets a few alongside its native SIEM alerts.
 *
 * Third-party technique claims carry the SOURCE's own opaque event refs (no
 * ZenC normalized-event to cite, no source_rule_id). The case ATT&CK
 * breakdown shows these as source-provided rather than traceable-to-telemetry.
 *
 * `description` is untrusted free text from the source system — never an
 * instruction to any agent (SKILL.md #8).
 */
type Raw = Partial<AlertEnvelope> & Pick<AlertEnvelope, "source" | "severity" | "title">;

function envelope(id: string, tenant_id: string, hoursAgo: number, raw: Raw): AlertEnvelope {
  const occurred_at = minus(DEMO_NOW_ISO, { hours: hoursAgo });
  const received_at = minus(occurred_at, { seconds: -(20 + (id.length % 40)) });
  return {
    envelope_id: id,
    schema_version: "1.1",
    tenant_id,
    source_alert_id: `${raw.source.system}-${id.slice(-8)}`,
    occurred_at,
    received_at,
    raw_payload_ref: `seed-fixtures/third-party/${id}.json`,
    validation_status: "valid",
    dedupe_key: `${raw.source.system}:${id}:${occurred_at.slice(0, 13)}`,
    ...raw,
  } as AlertEnvelope;
}

const EDR = { system: "third-party-edr", connector_id: "conn-tp-edr-01", health: "healthy" as const };
const CLOUD = { system: "third-party-cloud-sec", connector_id: "conn-tp-cloudsec-01", health: "healthy" as const };
const EMAIL = { system: "third-party-email-sec", connector_id: "conn-tp-emailsec-01", health: "degraded" as const };
const IDP = { system: "third-party-identity", connector_id: "conn-tp-idp-01", health: "healthy" as const };

export const THIRD_PARTY_ALERTS: AlertEnvelope[] = [
  // ---- Summit Credit Union (SOC-only tenant) ----
  envelope("env-tp-scu-0001", "tenant-summit-cu", 4, {
    source: EDR,
    severity: "critical",
    title: "Ransomware behavior blocked on endpoint SCU-FS-02",
    description: "EDR blocked a process performing rapid file encryption and shadow-copy deletion. Quarantined the binary.",
    confidence: 0.92,
    entities: [
      { entity_type: "host", value: "scu-fs-02" },
      { entity_type: "user", value: "scu-svc-fileshare" },
      { entity_type: "hash", value: "b7e2c1a90f4d5e6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5" },
    ],
    attack_techniques: [
      {
        tactic: "Impact",
        technique_id: "T1486",
        technique_name: "Data Encrypted for Impact",
        contributing_event_refs: ["tp-edr-evt-77120", "tp-edr-evt-77121", "tp-edr-evt-77125"],
      },
      {
        tactic: "Defense Evasion",
        technique_id: "T1070",
        technique_name: "Indicator Removal",
        contributing_event_refs: ["tp-edr-evt-77123"],
      },
    ],
  }),
  envelope("env-tp-scu-0002", "tenant-summit-cu", 9, {
    source: IDP,
    severity: "high",
    title: "Impossible travel for scu-teller-14",
    description: "Successful sign-ins from two geographies 40 minutes apart. MFA satisfied on both.",
    confidence: 0.7,
    entities: [
      { entity_type: "user", value: "scu-teller-14" },
      { entity_type: "ip", value: "203.0.113.201" },
      { entity_type: "ip", value: "198.51.100.9" },
    ],
    attack_techniques: [
      { tactic: "Initial Access", technique_id: "T1078", technique_name: "Valid Accounts", contributing_event_refs: ["tp-idp-evt-5510", "tp-idp-evt-5514"] },
    ],
  }),
  envelope("env-tp-scu-0003", "tenant-summit-cu", 11, {
    source: EMAIL,
    severity: "medium",
    title: "Credential-phishing message delivered to 6 mailboxes",
    description: "Message impersonating the IT service desk with a link to a look-alike login page passed initial filtering; retro-hunt found 6 delivered.",
    confidence: 0.6,
    entities: [
      { entity_type: "email_address", value: "it-servicedesk@secure-scu.test" },
      { entity_type: "domain", value: "secure-scu.test" },
    ],
    attack_techniques: [
      { tactic: "Initial Access", technique_id: "T1566", technique_name: "Phishing", contributing_event_refs: ["tp-email-evt-3301"] },
    ],
  }),
  envelope("env-tp-scu-0004", "tenant-summit-cu", 14, {
    source: CLOUD,
    severity: "high",
    title: "Public exposure of a storage bucket containing member statements",
    description: "Cloud posture scan found a bucket ACL changed to allow anonymous read. Bucket holds exported member statements.",
    confidence: 0.85,
    entities: [
      { entity_type: "cloud_resource", value: "cloud://summit-cu/prod/bucket/member-statements" },
      { entity_type: "user", value: "scu-cloud-admin" },
    ],
    attack_techniques: [
      { tactic: "Exfiltration", technique_id: "T1567", technique_name: "Exfiltration Over Web Service", contributing_event_refs: ["tp-cloud-evt-9001"] },
    ],
  }),
  envelope("env-tp-scu-0005", "tenant-summit-cu", 20, {
    source: EDR,
    severity: "medium",
    title: "Credential dumping tool signature on SCU-DC-01",
    description: "On-access scan flagged a known credential-access tool. File was not executed.",
    confidence: 0.5,
    entities: [{ entity_type: "host", value: "scu-dc-01" }],
    attack_techniques: [
      { tactic: "Credential Access", technique_id: "T1110", technique_name: "Brute Force", contributing_event_refs: ["tp-edr-evt-70880"] },
    ],
  }),
  envelope("env-tp-scu-0006", "tenant-summit-cu", 26, {
    source: IDP,
    severity: "low",
    title: "Legacy authentication protocol used by scu-batch-run",
    description: "Service account authenticated with a legacy protocol that bypasses conditional access.",
    confidence: 0.4,
    entities: [{ entity_type: "user", value: "scu-batch-run" }],
  }),
  // a duplicate of 0002 from a retry — must be deduped, not double-counted
  {
    ...envelope("env-tp-scu-0002b", "tenant-summit-cu", 9, {
      source: IDP,
      severity: "high",
      title: "Impossible travel for scu-teller-14",
      description: "Duplicate delivery of the impossible-travel alert (source retried).",
      entities: [{ entity_type: "user", value: "scu-teller-14" }],
    }),
    dedupe_key: "third-party-identity:env-tp-scu-0002:" + minus(DEMO_NOW_ISO, { hours: 9 }).slice(0, 13),
  },
  // a malformed one — bad schema version — must quarantine at intake, not drop
  {
    ...envelope("env-tp-scu-9999", "tenant-summit-cu", 3, {
      source: EDR,
      severity: "high",
      title: "Suspicious PowerShell (malformed envelope)",
    }),
    schema_version: "9.0" as unknown as "1.1",
  },

  // ---- Northwind Bank (has SIEM too — third-party alongside native) ----
  envelope("env-tp-nwb-0001", "tenant-northwind-bank", 6, {
    source: EDR,
    severity: "high",
    title: "Cobalt Strike beacon behavior on nwb-ws-05",
    description: "EDR detected named-pipe and sleep-jitter patterns consistent with a C2 beacon.",
    confidence: 0.8,
    entities: [
      { entity_type: "host", value: "nwb-ws-05" },
      { entity_type: "ip", value: "192.0.2.66" },
    ],
    attack_techniques: [
      { tactic: "Command and Control", technique_id: "T1071", technique_name: "Application Layer Protocol", contributing_event_refs: ["tp-edr-evt-88400", "tp-edr-evt-88402"] },
    ],
  }),
  envelope("env-tp-nwb-0002", "tenant-northwind-bank", 13, {
    source: CLOUD,
    severity: "medium",
    title: "Root/break-glass account used interactively",
    description: "Cloud-sec flagged interactive use of the break-glass role outside a change window.",
    confidence: 0.65,
    entities: [
      { entity_type: "user", value: "nwb-breakglass" },
      { entity_type: "cloud_resource", value: "cloud://northwind/prod/iam/role/break-glass" },
    ],
    attack_techniques: [
      { tactic: "Privilege Escalation", technique_id: "T1078.004", technique_name: "Valid Accounts: Cloud Accounts", sub_technique_id: "T1078.004", contributing_event_refs: ["tp-cloud-evt-4420"] },
    ],
  }),
  envelope("env-tp-nwb-0003", "tenant-northwind-bank", 30, {
    source: EMAIL,
    severity: "low",
    title: "Business email compromise attempt (wire-transfer lure)",
    description: "Message impersonating the CFO requesting an urgent wire transfer was quarantined by the gateway.",
    confidence: 0.55,
    entities: [{ entity_type: "email_address", value: "cfo-office@northwind-secure.test" }],
    attack_techniques: [
      { tactic: "Initial Access", technique_id: "T1566", technique_name: "Phishing", contributing_event_refs: ["tp-email-evt-2201"] },
    ],
  }),
];
