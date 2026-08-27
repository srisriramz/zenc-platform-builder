/**
 * MITRE ATT&CK — SEEDED STATIC REFERENCE DATA.
 *
 * The platform maps *to* ATT&CK; it never authors or edits it. This is a
 * deliberately small, demo-scoped slice of Enterprise ATT&CK — coverage
 * percentages in the product are computed against THIS seeded set, not the
 * full matrix (references/assumptions-and-limitations.md).
 */

export interface AttackTactic {
  tactic_id: string;
  name: string;
  shortname: string; // ATT&CK "x_mitre_shortname" style, used on techniques
  order: number;
}

export interface AttackTechnique {
  technique_id: string;
  name: string;
  tactic_shortnames: string[];
  is_sub_technique: boolean;
  parent_technique_id?: string;
  description: string;
  /** which seeded telemetry families can carry evidence for this technique */
  data_source_families: string[];
}

export const ATTACK_VERSION = "seed-2026.1 (Enterprise, demo slice)";

export const ATTACK_TACTICS: AttackTactic[] = [
  { tactic_id: "TA0001", name: "Initial Access", shortname: "initial-access", order: 1 },
  { tactic_id: "TA0002", name: "Execution", shortname: "execution", order: 2 },
  { tactic_id: "TA0003", name: "Persistence", shortname: "persistence", order: 3 },
  { tactic_id: "TA0004", name: "Privilege Escalation", shortname: "privilege-escalation", order: 4 },
  { tactic_id: "TA0005", name: "Defense Evasion", shortname: "defense-evasion", order: 5 },
  { tactic_id: "TA0006", name: "Credential Access", shortname: "credential-access", order: 6 },
  { tactic_id: "TA0007", name: "Discovery", shortname: "discovery", order: 7 },
  { tactic_id: "TA0008", name: "Lateral Movement", shortname: "lateral-movement", order: 8 },
  { tactic_id: "TA0010", name: "Exfiltration", shortname: "exfiltration", order: 9 },
  { tactic_id: "TA0011", name: "Command and Control", shortname: "command-and-control", order: 10 },
  { tactic_id: "TA0040", name: "Impact", shortname: "impact", order: 11 },
];

export const ATTACK_TECHNIQUES: AttackTechnique[] = [
  { technique_id: "T1078", name: "Valid Accounts", tactic_shortnames: ["initial-access", "persistence", "privilege-escalation", "defense-evasion"], is_sub_technique: false, description: "Use of legitimate credentials to access systems.", data_source_families: ["identity", "cloud", "windows"] },
  { technique_id: "T1078.004", name: "Valid Accounts: Cloud Accounts", tactic_shortnames: ["initial-access", "persistence", "privilege-escalation", "defense-evasion"], is_sub_technique: true, parent_technique_id: "T1078", description: "Abuse of cloud identity provider accounts.", data_source_families: ["cloud", "identity"] },
  { technique_id: "T1110", name: "Brute Force", tactic_shortnames: ["credential-access"], is_sub_technique: false, description: "Repeated authentication attempts to guess credentials.", data_source_families: ["identity", "windows", "firewall"] },
  { technique_id: "T1110.001", name: "Brute Force: Password Guessing", tactic_shortnames: ["credential-access"], is_sub_technique: true, parent_technique_id: "T1110", description: "Guessing passwords without prior knowledge.", data_source_families: ["identity", "windows"] },
  { technique_id: "T1110.003", name: "Brute Force: Password Spraying", tactic_shortnames: ["credential-access"], is_sub_technique: true, parent_technique_id: "T1110", description: "One or few passwords against many accounts.", data_source_families: ["identity", "windows"] },
  { technique_id: "T1059", name: "Command and Scripting Interpreter", tactic_shortnames: ["execution"], is_sub_technique: false, description: "Abuse of command and script interpreters.", data_source_families: ["windows", "linux_syslog"] },
  { technique_id: "T1059.001", name: "Command and Scripting Interpreter: PowerShell", tactic_shortnames: ["execution"], is_sub_technique: true, parent_technique_id: "T1059", description: "Execution via PowerShell.", data_source_families: ["windows"] },
  { technique_id: "T1059.003", name: "Command and Scripting Interpreter: Windows Command Shell", tactic_shortnames: ["execution"], is_sub_technique: true, parent_technique_id: "T1059", description: "Execution via cmd.exe.", data_source_families: ["windows"] },
  { technique_id: "T1053", name: "Scheduled Task/Job", tactic_shortnames: ["execution", "persistence", "privilege-escalation"], is_sub_technique: false, description: "Abuse of task scheduling for execution/persistence.", data_source_families: ["windows", "linux_syslog"] },
  { technique_id: "T1543", name: "Create or Modify System Process", tactic_shortnames: ["persistence", "privilege-escalation"], is_sub_technique: false, description: "Creating or modifying system-level processes/services.", data_source_families: ["windows", "linux_syslog"] },
  { technique_id: "T1547", name: "Boot or Logon Autostart Execution", tactic_shortnames: ["persistence", "privilege-escalation"], is_sub_technique: false, description: "Autostart mechanisms for persistence.", data_source_families: ["windows"] },
  { technique_id: "T1548", name: "Abuse Elevation Control Mechanism", tactic_shortnames: ["privilege-escalation", "defense-evasion"], is_sub_technique: false, description: "Bypassing elevation controls (UAC, sudo).", data_source_families: ["windows", "linux_syslog"] },
  { technique_id: "T1562", name: "Impair Defenses", tactic_shortnames: ["defense-evasion"], is_sub_technique: false, description: "Disabling or degrading security controls.", data_source_families: ["windows", "linux_syslog", "cloud"] },
  { technique_id: "T1562.001", name: "Impair Defenses: Disable or Modify Tools", tactic_shortnames: ["defense-evasion"], is_sub_technique: true, parent_technique_id: "T1562", description: "Disabling security tools/agents.", data_source_families: ["windows", "linux_syslog"] },
  { technique_id: "T1070", name: "Indicator Removal", tactic_shortnames: ["defense-evasion"], is_sub_technique: false, description: "Deleting or modifying artifacts to evade detection.", data_source_families: ["windows", "linux_syslog"] },
  { technique_id: "T1087", name: "Account Discovery", tactic_shortnames: ["discovery"], is_sub_technique: false, description: "Enumerating accounts.", data_source_families: ["windows", "identity", "cloud"] },
  { technique_id: "T1046", name: "Network Service Discovery", tactic_shortnames: ["discovery"], is_sub_technique: false, description: "Scanning for listening services.", data_source_families: ["firewall", "linux_syslog"] },
  { technique_id: "T1021", name: "Remote Services", tactic_shortnames: ["lateral-movement"], is_sub_technique: false, description: "Use of remote services to move laterally.", data_source_families: ["windows", "firewall", "linux_syslog"] },
  { technique_id: "T1021.001", name: "Remote Services: Remote Desktop Protocol", tactic_shortnames: ["lateral-movement"], is_sub_technique: true, parent_technique_id: "T1021", description: "Lateral movement over RDP.", data_source_families: ["windows", "firewall"] },
  { technique_id: "T1071", name: "Application Layer Protocol", tactic_shortnames: ["command-and-control"], is_sub_technique: false, description: "C2 over common application-layer protocols.", data_source_families: ["firewall", "email"] },
  { technique_id: "T1071.001", name: "Application Layer Protocol: Web Protocols", tactic_shortnames: ["command-and-control"], is_sub_technique: true, parent_technique_id: "T1071", description: "C2 over HTTP/HTTPS.", data_source_families: ["firewall"] },
  { technique_id: "T1567", name: "Exfiltration Over Web Service", tactic_shortnames: ["exfiltration"], is_sub_technique: false, description: "Exfiltration to an external web service.", data_source_families: ["firewall", "cloud"] },
  { technique_id: "T1114", name: "Email Collection", tactic_shortnames: ["exfiltration"], is_sub_technique: false, description: "Collecting email data, including forwarding rules.", data_source_families: ["email", "identity"] },
  { technique_id: "T1566", name: "Phishing", tactic_shortnames: ["initial-access"], is_sub_technique: false, description: "Phishing messages to gain access.", data_source_families: ["email"] },
  { technique_id: "T1486", name: "Data Encrypted for Impact", tactic_shortnames: ["impact"], is_sub_technique: false, description: "Encrypting data to disrupt availability (ransomware).", data_source_families: ["windows", "linux_syslog"] },
];

export const ATTACK_TECHNIQUE_MAP: Record<string, AttackTechnique> = Object.fromEntries(
  ATTACK_TECHNIQUES.map((t) => [t.technique_id, t]),
);
export const ATTACK_TACTIC_BY_SHORTNAME: Record<string, AttackTactic> = Object.fromEntries(
  ATTACK_TACTICS.map((t) => [t.shortname, t]),
);

/** Techniques "in scope" for coverage math = the seeded set, excluding sub-techniques' double-count. */
export const ATTACK_TECHNIQUES_IN_SCOPE = ATTACK_TECHNIQUES.filter((t) => !t.is_sub_technique);
