import { z } from "zod";

/**
 * House announcements — BR-260, BR-261, docs/08-UI-UX-SPEC.md S-50.
 *
 * The caller says how long it should stand, in hours, rather than naming an
 * instant: "for the next two days" is what a person actually means, and it
 * removes a whole class of timezone mistake from the form. The route turns it
 * into the `expires_at` the table requires.
 */

export const announcementSeveritySchema = z.enum(["info", "important", "urgent"]);

export type AnnouncementSeverity = z.infer<typeof announcementSeveritySchema>;

/** One hour at the shortest, thirty days at the longest. */
const expiresInHoursSchema = z.number().int().min(1).max(24 * 30);

export const createAnnouncementSchema = z.object({
  title: z.string().trim().min(1, "Give it a title").max(120),
  body: z.string().trim().min(1, "Say what it is").max(1000),
  severity: announcementSeveritySchema.default("info"),
  expiresInHours: expiresInHoursSchema.default(24),
});

export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
