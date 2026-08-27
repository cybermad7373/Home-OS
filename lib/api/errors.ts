/**
 * The error catalogue from docs/09-BUSINESS-RULES.md section 4, and the error
 * envelope from docs/05-API-SPEC.md section 1.
 *
 * Every failure the API can return is named here. A route handler throws an
 * `ApiError`; the wrapper in `handler.ts` turns it into the envelope.
 */

export const ERROR_CATALOGUE = {
  UNAUTHENTICATED: { status: 401, message: "Sign in to continue" },
  NOT_HOUSE_MEMBER: { status: 403, message: "You're not a member of this house" },
  MEMBERSHIP_PENDING: { status: 403, message: "Your admin hasn't approved you yet" },
  ADMIN_REQUIRED: { status: 403, message: "Only an admin can do that" },
  NOT_YOUR_RECORD: { status: 403, message: "You can only do that to your own items" },
  INVALID_INVITE_CODE: { status: 404, message: "That code isn't valid" },
  LAST_ADMIN: { status: 409, message: "Promote another admin first" },
  BAD_CREDENTIALS: {
    status: 401,
    message: "That username or email and password do not match an account",
  },
  USERNAME_TAKEN: { status: 409, message: "That username is taken" },
  INVALID_USERNAME: {
    status: 422,
    message: "3 to 20 characters: start with a letter, then letters, numbers or _",
  },
  EMAIL_TAKEN: { status: 409, message: "That email is already registered" },
  EMAIL_INVALID: {
    status: 422,
    message: "That email address was rejected — check it, or try another",
  },
  EMAIL_RATE_LIMITED: {
    status: 429,
    message:
      "Too many confirmation emails just went out. Wait an hour, or ask the admin to turn email confirmation off.",
  },
  EMAIL_NOT_CONFIRMED: {
    status: 403,
    message: "Confirm your email address first — check your inbox",
  },
  ROOM_FULL: { status: 409, message: "That room is already at capacity" },
  ROOM_OCCUPIED: { status: 409, message: "Move the occupants out first" },
  ROOM_NAME_TAKEN: { status: 409, message: "A room with that name already exists" },
  INVALID_TIME_RANGE: { status: 422, message: "Return time must be after leaving time" },

  // Expenses — docs/09-BUSINESS-RULES.md section 4.
  PERIOD_CLOSED: {
    status: 409,
    message: "That month is closed. Post it as an adjustment, or ask an admin to reopen it.",
  },
  FUTURE_DATE: { status: 422, message: "An expense cannot be dated in the future" },
  TOO_OLD: { status: 422, message: "That is more than 180 days ago" },
  SELF_APPROVAL: { status: 403, message: "Somebody else has to approve your own spending" },
  ALREADY_RESOLVED: { status: 409, message: "That has already been approved or rejected" },
  REASON_REQUIRED: { status: 422, message: "Say why — the record keeps this" },
  SPLIT_MISMATCH: { status: 422, message: "The shares do not add up to the amount" },
  SPLIT_NEGATIVE: { status: 422, message: "A share cannot be negative" },
  SPLIT_UNKNOWN_MEMBER: {
    status: 422,
    message: "A custom split can only name members of the house on that date",
  },
  NO_PARTICIPANTS: {
    status: 422,
    message: "Nobody was a member of the house on that date",
  },
  NO_ROOMS_CONFIGURED: {
    status: 422,
    message: "No rooms with rent are set up, so there is nothing to split by room",
  },
  BUDGET_INVALID: { status: 422, message: "Check the budget amount" },

  // Periods and settlement — docs/09-BUSINESS-RULES.md section 1.7.
  CLOSE_BLOCKED: { status: 409, message: "This month cannot be closed yet" },
  APPROVALS_PENDING: {
    status: 409,
    message: "Some expenses are still waiting for approval",
  },
  MONTH_NOT_ENDED: { status: 409, message: "Wait until the month has finished" },
  NETS_NONZERO: {
    status: 500,
    message: "The balances do not net to zero. This is a defect and closing is blocked.",
  },
  NOT_THE_PAYER: { status: 403, message: "Only the person paying can mark this" },
  NOT_THE_PAYEE: { status: 403, message: "Only the person being paid can confirm this" },
  ALREADY_CONFIRMED: { status: 409, message: "That payment is already confirmed" },
  PERIOD_ALREADY_OPEN: { status: 409, message: "That month is already open" },

  // Chores — docs/09-BUSINESS-RULES.md section 4.
  NOT_ASSIGNEE: { status: 403, message: "Only the assigned person can mark this done" },
  SELF_CONFIRM: { status: 403, message: "Somebody else has to confirm your work" },
  SELF_REJECT: { status: 403, message: "You cannot reject your own chore" },
  WRONG_STATE: { status: 409, message: "That chore has already moved on" },
  ALREADY_CLAIMED: { status: 409, message: "Somebody else claimed it first" },
  SWAP_TO_SELF: { status: 422, message: "Pick somebody other than yourself" },
  NO_ACTIVE_MEMBERS: {
    status: 409,
    message: "There is nobody active in the house to assign chores to",
  },
  NO_TEMPLATES: {
    status: 409,
    message: "Set up at least one chore before generating a week",
  },

  // Availability, guests and the penalty — docs/09-BUSINESS-RULES.md section 4.
  EXCEPTION_PAST: {
    status: 422,
    message: "You can only declare a day that has not happened yet",
  },
  GUEST_DATES_PAST: {
    status: 422,
    message: "Guest dates can't be more than a week in the past",
  },
  GUEST_STAY_TOO_LONG: { status: 422, message: "A guest stay can be at most 30 days" },
  GUEST_ALREADY_REGISTERED: {
    status: 409,
    message: "That guest is already registered for those dates",
  },
  NO_PATTERN_RECORDED: {
    status: 409,
    message: "Record your week first, so the house knows when to ask you",
  },
  PENALTY_MISMATCH: {
    status: 500,
    message: "Penalties owed do not equal penalties credited. This is a defect.",
  },
  NOT_FOUND: { status: 404, message: "That doesn't exist, or isn't yours to see" },
  RATE_LIMITED: { status: 429, message: "Slow down a moment and try again" },
  AI_DISABLED: { status: 501, message: "AI features aren't set up for this house" },
  // docs/05-API-SPEC.md section 10. The server has no master key, so a provider
  // key cannot be sealed — and it is never stored in plaintext instead.
  LLM_SEALING_UNAVAILABLE: {
    status: 409,
    message:
      "This server can't store a key safely yet. Ask whoever runs it to set LLM_KEY_ENCRYPTION_KEY.",
  },
  VALIDATION_FAILED: { status: 422, message: "Check the highlighted fields" },
  INTERNAL: { status: 500, message: "Something went wrong. It's been logged." },
} as const;

export type ErrorCode = keyof typeof ERROR_CATALOGUE;

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, details?: Record<string, unknown>, message?: string) {
    const entry = ERROR_CATALOGUE[code];
    super(message ?? entry.message);
    this.name = "ApiError";
    this.code = code;
    this.status = entry.status;
    this.details = details;
  }
}

/**
 * Database-level guards raise their error code as the exception message — the
 * `LAST_ADMIN` trigger, the RLS privilege trigger, the room capacity check.
 * This maps those back onto the catalogue so the user sees the right sentence
 * rather than a Postgres string.
 */
export function apiErrorFromPostgres(error: {
  message?: string | null;
  code?: string | null;
}): ApiError {
  const raw = error.message ?? "";
  for (const code of Object.keys(ERROR_CATALOGUE) as ErrorCode[]) {
    if (raw.includes(code)) return new ApiError(code);
  }
  if (error.code === "23505") {
    return new ApiError("ROOM_NAME_TAKEN");
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return new ApiError("NOT_HOUSE_MEMBER");
  }
  return new ApiError("INTERNAL", { cause: raw });
}
