import "server-only";

import { apiErrorFromPostgres } from "@/lib/api/errors";
import {
  buildStandings,
  type ConfirmedChore,
  type GameStanding,
} from "@/lib/domain/game";
import type { Session } from "./house";

/**
 * The game-layer repository.
 *
 * One read: every confirmed chore in the Home, by member and by date. The
 * arithmetic is in `lib/domain/game.ts` and none of it happens here.
 *
 * RLS does the authorisation, as everywhere else: the query runs as the caller,
 * so a member of another Home reads nothing rather than a filtered nothing.
 */
export async function getGameStandings(
  session: Session,
  houseId: string,
  memberIds: readonly string[],
  today: string,
): Promise<GameStanding[]> {
  const { data, error } = await session.supabase
    .from("chore_assignments")
    .select("assignee_member_id, chore_date, effort_points")
    .eq("house_id", houseId)
    .eq("status", "confirmed");

  if (error) throw apiErrorFromPostgres(error);

  const chores: ConfirmedChore[] = (data ?? [])
    .filter((row) => row.assignee_member_id !== null)
    .map((row) => ({
      memberId: row.assignee_member_id as string,
      choreDate: row.chore_date as string,
      points: row.effort_points as number,
    }));

  return buildStandings(memberIds, chores, today);
}
