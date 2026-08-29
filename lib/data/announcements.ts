import "server-only";

import { apiErrorFromPostgres } from "@/lib/api/errors";
import type { Session } from "./house";
import type { CreateAnnouncementInput } from "@/lib/validation/announcements";

/**
 * The announcements repository (BR-260, BR-261).
 *
 * Small on purpose: an announcement is a broadcast with an end date, and the
 * only rules it has — a lead writes it, everybody reads it, it stops being
 * shown once it expires — are all stated in migration 089. This file asks the
 * questions; the database is what refuses.
 */

export interface AnnouncementView {
  id: string;
  title: string;
  body: string;
  severity: "info" | "important" | "urgent";
  authorMemberId: string;
  authorName: string;
  createdAt: string;
  expiresAt: string;
}

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  severity: string;
  author_member_id: string;
  created_at: string;
  expires_at: string;
  house_members: { users: { display_name: string } | null } | null;
}

function toView(row: AnnouncementRow): AnnouncementView {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    // The column is text with a check constraint; three values, and nothing in
    // SQL branches on them. Anything else would be a constraint violation.
    severity: row.severity as AnnouncementView["severity"],
    authorMemberId: row.author_member_id,
    authorName: row.house_members?.users?.display_name ?? "Someone",
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

const SELECT = "id, title, body, severity, author_member_id, created_at, expires_at, house_members!house_announcements_author_member_id_fkey(users(display_name))";

/**
 * The live ones, newest first. An expired announcement is not deleted — it is
 * a record of what the Home was told and when — it simply stops being shown
 * (BR-261).
 */
export async function listLiveAnnouncements(
  session: Session,
  houseId: string,
  now: Date = new Date(),
): Promise<AnnouncementView[]> {
  const { data, error } = await session.supabase
    .from("house_announcements")
    .select(SELECT)
    .eq("house_id", houseId)
    .gt("expires_at", now.toISOString())
    .order("created_at", { ascending: false });

  if (error) throw apiErrorFromPostgres(error);
  return ((data ?? []) as unknown as AnnouncementRow[]).map(toView);
}

/** Every announcement the Home has had, live or expired. */
export async function listAnnouncements(
  session: Session,
  houseId: string,
): Promise<AnnouncementView[]> {
  const { data, error } = await session.supabase
    .from("house_announcements")
    .select(SELECT)
    .eq("house_id", houseId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw apiErrorFromPostgres(error);
  return ((data ?? []) as unknown as AnnouncementRow[]).map(toView);
}

/**
 * `expiresInHours` becomes an instant here rather than in the browser, so two
 * members in different timezones posting "for the next day" get the same
 * duration and the check constraint has something unambiguous to test.
 */
export async function createAnnouncement(
  session: Session,
  houseId: string,
  authorMemberId: string,
  input: CreateAnnouncementInput,
  now: Date = new Date(),
): Promise<string> {
  const expiresAt = new Date(now.getTime() + input.expiresInHours * 60 * 60 * 1000);

  const { data, error } = await session.supabase
    .from("house_announcements")
    .insert({
      house_id: houseId,
      author_member_id: authorMemberId,
      title: input.title,
      body: input.body,
      severity: input.severity,
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();

  if (error) throw apiErrorFromPostgres(error);
  return data.id;
}

/** Taking one down early. RLS admits leads only. */
export async function deleteAnnouncement(session: Session, id: string): Promise<void> {
  const { error } = await session.supabase.from("house_announcements").delete().eq("id", id);
  if (error) throw apiErrorFromPostgres(error);
}
