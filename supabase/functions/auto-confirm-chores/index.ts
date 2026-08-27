// Edge function: auto-confirm-chores
//
// Runs every 30 minutes. Confirms anything marked done longer ago than the
// house's auto-confirm window, with no rejection against it, and posts its
// points through the same trigger a peer confirmation would.
//
// This job is the counterweight to peer confirmation. Mandatory confirmation
// with no timeout hands non-participants a veto: they simply never tap approve,
// and the people doing the work never get credit. The window preserves the
// ability to reject while removing the ability to stall — which is the whole
// argument in decision 3 of the design index.
//
// Idempotent: the points trigger fires only on the transition into `confirmed`,
// so re-running this changes nothing.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async () => {
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: houses, error: housesError } = await supabase
    .from("houses")
    .select("id");

  if (housesError) {
    return Response.json({ error: housesError.message }, { status: 500 });
  }

  let confirmed = 0;
  const perHouse: { house_id: string; confirmed: number }[] = [];

  for (const house of houses ?? []) {
    const { data: settings } = await supabase
      .from("house_settings")
      .select("auto_confirm_hours")
      .eq("house_id", house.id)
      .maybeSingle();

    const hours = settings?.auto_confirm_hours ?? 48;
    const cutoff = new Date(Date.now() - hours * 3600_000).toISOString();

    const { data: due, error } = await supabase
      .from("chore_assignments")
      .select("id")
      .eq("house_id", house.id)
      .eq("status", "done_pending")
      .lt("done_at", cutoff);

    if (error || !due || due.length === 0) continue;

    // Updated one at a time rather than in a batch: the points trigger is
    // per row, and a partial failure should leave the rest correct rather than
    // rolling the whole sweep back.
    let houseCount = 0;
    for (const assignment of due) {
      const { error: updateError } = await supabase
        .from("chore_assignments")
        .update({
          status: "confirmed",
          confirmed_at: new Date().toISOString(),
          auto_confirmed: true,
          // confirmed_by stays null: nobody confirmed it, the clock did. The
          // self-confirmation constraint is satisfied precisely because of that.
        })
        .eq("id", assignment.id)
        .eq("status", "done_pending"); // guard against a race with a real peer

      if (!updateError) houseCount += 1;
    }

    confirmed += houseCount;
    perHouse.push({ house_id: house.id, confirmed: houseCount });
  }

  return Response.json({ confirmed, houses: perHouse });
});
