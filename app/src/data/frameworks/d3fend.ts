/**
 * MITRE D3FEND — SEEDED STATIC REFERENCE DATA.
 *
 * Same treatment as ATT&CK: the platform maps rules (detect side) and
 * playbook steps (response side) to D3FEND; it does not author it. Demo slice.
 */

export interface D3fendTechnique {
  d3fend_technique_id: string;
  d3fend_technique_name: string;
  category: string; // D3FEND top-level: Model | Harden | Detect | Isolate | Deceive | Evict | Restore
  side: ("detect" | "response")[];
  description: string;
}

export const D3FEND_VERSION = "seed-2026.1 (demo slice)";

export const D3FEND_TECHNIQUES: D3fendTechnique[] = [
  { d3fend_technique_id: "D3-UAN", d3fend_technique_name: "User Behavior Analysis", category: "Detect", side: ["detect"], description: "Analyzing user activity for anomalies." },
  { d3fend_technique_id: "D3-ANET", d3fend_technique_name: "Administrative Network Activity Analysis", category: "Detect", side: ["detect"], description: "Analyzing administrative protocol activity." },
  { d3fend_technique_id: "D3-NTA", d3fend_technique_name: "Network Traffic Analysis", category: "Detect", side: ["detect"], description: "Analyzing network flows and content." },
  { d3fend_technique_id: "D3-RTSD", d3fend_technique_name: "Remote Terminal Session Detection", category: "Detect", side: ["detect"], description: "Detecting interactive remote sessions." },
  { d3fend_technique_id: "D3-PSA", d3fend_technique_name: "Process Spawn Analysis", category: "Detect", side: ["detect"], description: "Analyzing parent/child process relationships." },
  { d3fend_technique_id: "D3-SFA", d3fend_technique_name: "System File Analysis", category: "Detect", side: ["detect"], description: "Analyzing changes to system files." },
  { d3fend_technique_id: "D3-FA", d3fend_technique_name: "File Analysis", category: "Detect", side: ["detect"], description: "Analyzing files for malicious properties." },
  { d3fend_technique_id: "D3-IAA", d3fend_technique_name: "Identity and Access Analysis", category: "Detect", side: ["detect"], description: "Analyzing authentication and authorization events." },
  { d3fend_technique_id: "D3-MA", d3fend_technique_name: "Message Analysis", category: "Detect", side: ["detect"], description: "Analyzing email/message content and metadata." },
  { d3fend_technique_id: "D3-ACA", d3fend_technique_name: "Application Configuration Analysis", category: "Detect", side: ["detect"], description: "Analyzing config changes (e.g. mail forwarding rules)." },
  { d3fend_technique_id: "D3-NI", d3fend_technique_name: "Network Isolation", category: "Isolate", side: ["response"], description: "Restricting network communication of a host." },
  { d3fend_technique_id: "D3-ITF", d3fend_technique_name: "Inbound Traffic Filtering", category: "Isolate", side: ["response"], description: "Blocking inbound connections from an indicator." },
  { d3fend_technique_id: "D3-OTF", d3fend_technique_name: "Outbound Traffic Filtering", category: "Isolate", side: ["response"], description: "Blocking outbound connections to an indicator." },
  { d3fend_technique_id: "D3-ANCI", d3fend_technique_name: "Authentication Cache Invalidation", category: "Evict", side: ["response"], description: "Invalidating sessions/tokens for an account." },
  { d3fend_technique_id: "D3-ACH", d3fend_technique_name: "Account Locking", category: "Isolate", side: ["response"], description: "Disabling or locking a compromised account." },
  { d3fend_technique_id: "D3-PT", d3fend_technique_name: "Process Termination", category: "Evict", side: ["response"], description: "Terminating a malicious process." },
];

export const D3FEND_TECHNIQUE_MAP: Record<string, D3fendTechnique> = Object.fromEntries(
  D3FEND_TECHNIQUES.map((t) => [t.d3fend_technique_id, t]),
);
