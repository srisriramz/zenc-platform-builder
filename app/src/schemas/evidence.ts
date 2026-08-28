import { z } from "zod";
import { isoDateTime } from "./common";

/**
 * Mirrors schemas/evidence.schema.json. Assessment and SOAR share this shape;
 * SOAR case evidence sets `origin: "soc"` + `linked_case_id` and leans on the
 * custody fields (`submitted_by`, `submitted_at`, `content_hash`,
 * `supersedes_evidence_id`).
 *
 * Immutability rule (soc-spec.md): an evidence item is never edited in place.
 * A correction is a NEW item that points at the prior one via
 * `supersedes_evidence_id`.
 */
export const evidenceReviewState = z.enum(["submitted", "under_review", "approved", "rejected"]);
export type EvidenceReviewState = z.infer<typeof evidenceReviewState>;

export const evidenceSchema = z
  .object({
    evidence_id: z.string(),
    tenant_id: z.string(),
    origin: z.enum(["manual", "soc"]),
    linked_question_id: z.string().optional(),
    linked_case_id: z.string().optional(),
    reference_type: z.enum(["file", "link", "note"]).optional(),
    reference: z.string().optional(),
    /** short human-readable label for the artifact */
    title: z.string().optional(),
    submitted_by: z.string(),
    submitted_at: isoDateTime,
    review_state: evidenceReviewState,
    reviewer_id: z.string().optional(),
    reviewer_comment: z.string().optional(),
    reviewed_at: isoDateTime.optional(),
    confidence: z.number().min(0).max(1),
    content_hash: z.string().optional(),
    supersedes_evidence_id: z.string().nullable().optional(),
  })
  .refine((e) => e.review_state !== "approved" || (!!e.reviewer_id && !!e.reviewed_at), {
    message: "approved evidence needs reviewer_id and reviewed_at",
    path: ["reviewer_id"],
  })
  .refine((e) => e.origin !== "soc" || !!e.linked_case_id, {
    message: "SOC-origin evidence must link to a case",
    path: ["linked_case_id"],
  });
export type Evidence = z.infer<typeof evidenceSchema>;
