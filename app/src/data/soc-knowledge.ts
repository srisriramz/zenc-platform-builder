/**
 * Seeded "approved knowledge" the Digital Advisor Agent draws on — a small
 * lessons-learned base keyed to ATT&CK techniques. In a real deployment this
 * would be the security-memory-equivalent populated from closed cases and
 * approved playbooks; here it is a fixed, human-approved set.
 *
 * The Digital Advisor may ONLY cite entries from here plus the case's own
 * approved evidence. It never invents guidance and never approves an action.
 */

export interface KnowledgeEntry {
  knowledge_id: string;
  technique_ids: string[];
  title: string;
  guidance: string;
  /** D3FEND categories the suggested response maps to — informational only here */
  d3fend_categories: string[];
  approved_by: string;
  approved_at: string;
  /** closed cases this lesson was distilled from */
  derived_from_cases: string[];
}

export const SOC_KNOWLEDGE: KnowledgeEntry[] = [
  {
    knowledge_id: "kb-ransomware-impact",
    technique_ids: ["T1486", "T1490", "T1489"],
    title: "Suspected ransomware on an endpoint",
    guidance:
      "Preserve volatile state before any remediation: capture a memory image and the process tree. Confirm backup integrity and immutability out-of-band before deciding on restore vs. rebuild. Isolate the host at the network layer rather than powering it off (power-off destroys volatile evidence). Check for lateral movement from the same account in the 24h before detection.",
    d3fend_categories: ["Network Isolation", "System Configuration Analysis"],
    approved_by: "user-ravi-manager",
    approved_at: "2026-07-15T00:00:00.000Z",
    derived_from_cases: ["case-archive-nwb-2026-06-ransomware"],
  },
  {
    knowledge_id: "kb-valid-accounts",
    technique_ids: ["T1078", "T1078.004"],
    title: "Valid-account abuse / impossible travel / break-glass use",
    guidance:
      "Treat the identity as the blast radius, not the host. Pull the full authentication timeline for the principal across all sources, not just the alerting one. Verify with the account owner through a known-good channel. For a privileged or break-glass account, check what was accessed during the session and whether a change ticket exists. Consider a forced credential reset + session revocation as a containment step.",
    d3fend_categories: ["Credential Revoking", "Authentication Event Thresholding"],
    approved_by: "user-ravi-manager",
    approved_at: "2026-06-28T00:00:00.000Z",
    derived_from_cases: ["case-archive-scu-2026-05-impossible-travel"],
  },
  {
    knowledge_id: "kb-phishing-delivery",
    technique_ids: ["T1566", "T1566.002"],
    title: "Credential-phishing message delivered",
    guidance:
      "Scope delivery first: retro-hunt the sender, subject, and URL across all mailboxes for the full campaign, not just the reported message. Purge delivered copies. Block the sender domain and the look-alike login URL. Check for any successful authentications from the users who received it in the window after delivery — a delivered phish with a successful login is an account-compromise case, not a delivery case.",
    d3fend_categories: ["Message Analysis", "URL Analysis"],
    approved_by: "user-ravi-manager",
    approved_at: "2026-07-02T00:00:00.000Z",
    derived_from_cases: ["case-archive-scu-2026-04-phish"],
  },
  {
    knowledge_id: "kb-c2-beacon",
    technique_ids: ["T1071", "T1071.001", "T1573"],
    title: "C2 beacon behaviour on an endpoint",
    guidance:
      "Isolate the host and preserve memory. Identify the beacon's C2 infrastructure and block it at the perimeter. Determine initial access — a beacon is a mid-chain observation, so there is an entry vector and likely persistence to find. Sweep the environment for the same C2 indicators on other hosts before closing.",
    d3fend_categories: ["Network Isolation", "Network Traffic Analysis"],
    approved_by: "user-ravi-manager",
    approved_at: "2026-07-20T00:00:00.000Z",
    derived_from_cases: ["case-archive-nwb-2026-07-beacon"],
  },
  {
    knowledge_id: "kb-cloud-exposure",
    technique_ids: ["T1567", "T1530", "T1580"],
    title: "Public exposure of cloud storage",
    guidance:
      "Remove the public grant immediately — this is an A1/A2 configuration change, not a destructive action. Then determine exposure window from access logs and whether anonymous reads actually occurred. If the bucket held regulated data (member statements, PII), engage the data-protection / privacy function per the incident-response plan. Add a preventative guardrail (SCP / policy) so the misconfiguration cannot recur.",
    d3fend_categories: ["System Configuration Analysis", "Access Modeling"],
    approved_by: "user-ravi-manager",
    approved_at: "2026-06-10T00:00:00.000Z",
    derived_from_cases: ["case-archive-scu-2026-03-bucket"],
  },
];

export function knowledgeForTechniques(techniqueIds: string[]): KnowledgeEntry[] {
  const wanted = new Set(techniqueIds);
  return SOC_KNOWLEDGE.filter((k) => k.technique_ids.some((t) => wanted.has(t)));
}
