import { z } from "zod";
import { isValidInviteCode, normaliseInviteCode } from "@/lib/utils/invite-code";

/** Section 2 of docs/09-BUSINESS-RULES.md. One schema, used by client and server. */

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, "Enter a name between 2 and 50 characters")
  .max(50, "Enter a name between 2 and 50 characters")
  .regex(/^[\p{L}][\p{L} '-]*$/u, "Enter a name between 2 and 50 characters");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address");

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters with a letter and a number")
  .refine(
    (value) => /[A-Za-z]/.test(value) && /\d/.test(value),
    "Use at least 8 characters with a letter and a number",
  );

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^(\+\d{1,4}\d{10,14}|\d{10})$/, "Enter a valid phone number");

export const upiVpaSchema = z
  .string()
  .trim()
  .regex(/^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/, "UPI ID looks like name@bank");

/**
 * 3–20 characters, starting with a letter, then letters, digits or underscores.
 * Uniqueness ignores case, so "Ravi" and "ravi" are the same name; whichever
 * was claimed first keeps the capitalisation.
 */
export const usernameSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z][A-Za-z0-9_]{2,19}$/,
    "3 to 20 characters: start with a letter, then letters, numbers or _",
  );

/** Sign-in accepts either identifier; which one it is decides how it resolves. */
export const identifierSchema = z
  .string()
  .trim()
  .min(1, "Enter your username or email");

export function isEmailIdentifier(identifier: string): boolean {
  return identifier.includes("@");
}

/**
 * The opaque half of an invite link. 24 characters of URL-safe base64 over 18
 * random bytes, per migration 049 — validated for shape only, because whether
 * it names a live invitation is the database's answer to give.
 */
export const inviteTokenSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{16,64}$/, "That invite link isn't valid");

export const inviteCodeSchema = z
  .string()
  .transform(normaliseInviteCode)
  .refine(isValidInviteCode, "That code isn't valid");

export const residencySchema = z.enum(["full_time", "weekday_only", "weekend_only"]);
export const memberRoleSchema = z.enum(["admin", "co_admin", "member"]);
export const memberStatusSchema = z.enum(["requested", "active", "inactive"]);

/** Rupees arrive as a decimal string and are converted to paise at the boundary. */
export const rupeeStringSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount like 1240.50");

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date in YYYY-MM-DD form");
