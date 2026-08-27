import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireAdminMembership, requireSession } from "@/lib/data/house";
import { generateWeek, nextWeekStart } from "@/lib/data/chores";
import { generateWeekSchema } from "@/lib/validation/chores";
import { houseToday } from "@/lib/utils/date";

/**
 * POST /api/chores/generate — admin only.
 *
 * Regenerating a week that already has one replaces only what is still
 * outstanding. Confirmed and done work survives untouched: regenerating must
 * never take away points somebody already earned.
 */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const { house } = await requireAdminMembership(session);
  const input = await parseBody(request, generateWeekSchema);

  const settings = await session.supabase
    .from("house_settings")
    .select("carry_cap_percent, llm_scheduling_enabled")
    .eq("house_id", house.id)
    .single();

  const weekStart = input.week_start ?? nextWeekStart(houseToday(house.timezone));

  const result = await generateWeek(session, house.id, weekStart, {
    carryCapPercent: settings.data?.carry_cap_percent ?? 50,
    dryRun: input.dry_run,
    // The kill switch of LLM spec section 8. Off, or no key anywhere, and the
    // engine's schedule is what publishes — which is what happens today.
    llmSchedulingEnabled: settings.data?.llm_scheduling_enabled ?? false,
  });

  return jsonResponse(result, input.dry_run ? 200 : 201);
});
