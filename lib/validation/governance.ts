import { z } from "zod";

/**
 * Governance request bodies — docs/14-GOVERNANCE-SPEC.md, docs/05-API-SPEC.md.
 *
 * Two rules from the specification are enforced here as well as in the
 * database, because a person typing into a form should be told before they
 * send it, not after:
 *
 *   * a Critical decision needs a reason (§3);
 *   * a rejection needs one of at least ten characters (§3.2), and "no" is
 *     not a reason a Home can act on.
 */

export const decisionTypeSchema = z.enum([
  "close_settlement",
  "reopen_settlement",
  "remove_member",
  "change_rule",
  "change_governance",
  "change_home_mode",
  "change_confirmation_policy",
  "balance_adjustment",
  "absence_request",
  "join_request",
  "expense_approval",
  "chore_confirmation",
  "set_expected_contribution",
  "create_reserve",
  "reserve_draw",
]);

export const decisionStatusSchema = z.enum([
  "waiting",
  "approved",
  "rejected",
  "lapsed",
  "cancelled",
  "applied",
]);

export const responseCapacitySchema = z.enum(["approver", "acknowledger"]);

/** The floor from §3.2, and the same ten characters the check constraint asks. */
export const rejectionReasonSchema = z
  .string()
  .trim()
  .min(10, "Say why, in a sentence somebody could act on")
  .max(500);

export const proposeDecisionSchema = z.object({
  type: decisionTypeSchema,
  /** The entity: a period, an expense, a chore assignment, a rule, a reserve. */
  subject_type: z.string().trim().max(40).optional(),
  subject_id: z.string().uuid().optional(),
  /** The member it is *about*, when it is about one. Never a participant. */
  subject_member_id: z.string().uuid().optional(),
  /** What would change, read at apply time by the effect and by nothing else. */
  payload: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().trim().min(3, "Say why").max(500).optional(),
  /** A lapsed or withdrawn decision may be re-proposed, pointing at the old one. */
  supersedes_id: z.string().uuid().optional(),
});

/**
 * The body `DELETE /api/members/:id` takes now that it proposes rather than
 * removes. Everything about the decision except the reason is in the path, and
 * a client that sends nothing at all is answered rather than refused (R-3).
 */
export const proposeRemovalSchema = z.object({
  reason: z.string().trim().min(3, "Say why").max(500).optional(),
});

/**
 * The S-37 sheet's question, which is the proposal minus everything that only
 * matters once it is real: no reason, no payload, no `supersedes_id`. Who is
 * asked depends on the type and the subject and on nothing else, so those are
 * the only two things the preview takes.
 */
export const previewDecisionSchema = z.object({
  type: decisionTypeSchema,
  subject_member_id: z.string().uuid().optional(),
});

export const respondSchema = z
  .object({
    response: z.enum(["approve", "reject", "acknowledge"]),
    /** Only needed when the caller is listed in both capacities. */
    capacity: responseCapacitySchema.optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .refine(
    (body) =>
      body.response !== "reject" ||
      rejectionReasonSchema.safeParse(body.reason).success,
    {
      path: ["reason"],
      message: "Say why, in a sentence somebody could act on",
    },
  );

/**
 * Approve All takes no arguments on purpose (§5).
 *
 * The batch is whatever the caller may legitimately answer at the moment they
 * tap, computed on the server from the same planner the count on the button
 * came from. A client-supplied list of ids would be a client choosing which
 * decisions its own tap completes.
 */
export const approveAllSchema = z.object({});

export const decisionQuerySchema = z.object({
  status: decisionStatusSchema.optional(),
  /** `mine` is the Approvals surface: the ones waiting on this caller. */
  scope: z.enum(["all", "mine"]).optional().default("all"),
});

export type ProposeDecisionInput = z.infer<typeof proposeDecisionSchema>;
export type PreviewDecisionInput = z.infer<typeof previewDecisionSchema>;
export type RespondInput = z.infer<typeof respondSchema>;
