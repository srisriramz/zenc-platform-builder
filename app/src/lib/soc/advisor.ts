import type { Case, Evidence } from "@/schemas";
import { knowledgeForTechniques, type KnowledgeEntry } from "@/data/soc-knowledge";

/**
 * Digital Advisor Agent logic (L1). Answers "what should we do next" for a
 * case using ONLY approved knowledge and the case's own approved evidence
 * (references/agentic-architecture.md). It never approves an action and never
 * guarantees an outcome — every output carries that caveat.
 */

export interface AdvisorResult {
  case_id: string;
  generated_at: string;
  based_on: {
    knowledge: { knowledge_id: string; title: string }[];
    approved_evidence_count: number;
    unreviewed_evidence_count: number;
  };
  recommendation: string;
  suggested_tasks: string[];
  caveats: string[];
}

export function adviseCase(
  theCase: Case,
  caseTechniqueIds: string[],
  evidence: Evidence[],
  generatedAt: string,
): AdvisorResult {
  const knowledge = knowledgeForTechniques(caseTechniqueIds);
  const approved = evidence.filter((e) => e.review_state === "approved");
  const unreviewed = evidence.filter((e) => e.review_state === "submitted" || e.review_state === "under_review");

  const recommendation =
    knowledge.length === 0
      ? "No approved lesson maps to this case's techniques. Proceed with standard triage: establish scope, corroborate with a second source, and document what you find as evidence before any containment decision."
      : knowledge.map((k) => k.guidance).join(" ");

  const suggestedTasks = buildTasks(knowledge, theCase);

  const caveats = [
    "Advisory only — the Digital Advisor cannot approve or execute any action.",
    "Drawn from approved knowledge and this case's approved evidence; unreviewed evidence is not weighed.",
    "All response actions in this demo are dry-run / simulation only.",
  ];
  if (unreviewed.length > 0) {
    caveats.push(`${unreviewed.length} evidence item(s) on this case are not yet reviewed — get them reviewed before relying on them.`);
  }

  return {
    case_id: theCase.case_id,
    generated_at: generatedAt,
    based_on: {
      knowledge: knowledge.map((k) => ({ knowledge_id: k.knowledge_id, title: k.title })),
      approved_evidence_count: approved.length,
      unreviewed_evidence_count: unreviewed.length,
    },
    recommendation,
    suggested_tasks: suggestedTasks,
    caveats,
  };
}

function buildTasks(knowledge: KnowledgeEntry[], theCase: Case): string[] {
  const tasks = new Set<string>();
  for (const k of knowledge) {
    if (k.knowledge_id === "kb-ransomware-impact") {
      tasks.add("Capture a memory image of the affected host before any remediation");
      tasks.add("Verify backup integrity and immutability out-of-band");
      tasks.add("Isolate the host at the network layer (do not power off)");
    }
    if (k.knowledge_id === "kb-valid-accounts") {
      tasks.add("Pull the full authentication timeline for the principal across all sources");
      tasks.add("Verify the activity with the account owner via a known-good channel");
    }
    if (k.knowledge_id === "kb-phishing-delivery") {
      tasks.add("Retro-hunt the sender / subject / URL across all mailboxes for the full campaign");
      tasks.add("Check for successful logins by recipients in the window after delivery");
    }
    if (k.knowledge_id === "kb-c2-beacon") {
      tasks.add("Isolate the host and preserve memory");
      tasks.add("Identify and block the C2 infrastructure at the perimeter");
      tasks.add("Sweep other hosts for the same C2 indicators");
    }
    if (k.knowledge_id === "kb-cloud-exposure") {
      tasks.add("Remove the public grant on the exposed resource");
      tasks.add("Determine the exposure window and whether anonymous reads occurred");
    }
  }
  if (tasks.size === 0) {
    tasks.add(`Establish the scope of activity for ${theCase.title ?? "this case"}`);
    tasks.add("Corroborate the alert with a second independent source");
  }
  return [...tasks];
}
