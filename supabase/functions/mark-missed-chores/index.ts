// Edge function: mark-missed-chores
//
// Runs daily at 23:55 house time. Anything still outstanding past its deadline
// becomes `missed`: zero points, and the deficit grows.
//
// Deliberately narrow. It touches only `assigned` and `rejected` rows — never
// `done_pending`, because somebody who did the work and is waiting on a peer
// must not be punished for that peer's silence. The auto-confirm job handles
// those, and it is the reason this one can be this blunt.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async () => {
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const now = new Date().toISOString();

  const { data: due, error } = await supabase
    .from("chore_assignments")
    .select("id")
    .in("status", ["assigned", "rejected"])
    .lt("deadline", now);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  let missed = 0;
  for (const assignment of due ?? []) {
    const { error: updateError } = await supabase
      .from("chore_assignments")
      .update({ status: "missed" })
      .eq("id", assignment.id)
      .in("status", ["assigned", "rejected"]);

    if (!updateError) missed += 1;
  }

  // An open chore nobody claimed is the house's failure, not a person's, so it
  // is closed out without a miss against anybody.
  const { data: orphaned } = await supabase
    .from("chore_assignments")
    .select("id")
    .eq("status", "open")
    .lt("deadline", now);

  for (const assignment of orphaned ?? []) {
    await supabase
      .from("chore_assignments")
      .update({ status: "cancelled" })
      .eq("id", assignment.id)
      .eq("status", "open");
  }

  return Response.json({ missed, expired_open: (orphaned ?? []).length });
});
