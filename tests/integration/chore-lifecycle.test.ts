import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The phase-4 acceptance criteria that cannot be checked in memory:
 *
 *   "Marking a chore done and having it confirmed by a peer posts exactly its
 *    points, exactly once."
 *   "Nobody can confirm their own chore — blocked at the database."
 *
 * The solver's correctness is proved by property test in tests/unit. What this
 * proves is the path from a tap to a number in the effort ledger.
 */

function getConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { url, anonKey, serviceKey, configured: Boolean(url && anonKey && serviceKey) };
}

const PASSWORD = "test-password-1";
const stamp = Date.now();

describe("the chore lifecycle", () => {
  const { url, anonKey, serviceKey, configured } = getConfig();

  console.log("DEBUG: configured =", configured, "url =", url);

  if (!configured) {
    console.log("Skipping integration test: Supabase credentials not configured");
    return;
  }

  const admin = createClient(url!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let ravi: SupabaseClient;
  let kumar: SupabaseClient;
  let houseId: string;
  let raviMemberId: string;
  let kumarMemberId: string;
  let templateId: string;
  const userIds: string[] = [];

  /** A Monday, safely in the past so deadlines do not interfere. */
  const weekStart = "2026-08-17";

  async function makeUser(label: string): Promise<{ id: string; client: SupabaseClient }> {
    const email = `${label}-${stamp}@houseos.dev`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: label },
    });
    if (error) throw error;

    const client = createClient(url!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await client.auth.signInWithPassword({
      email,
      password: PASSWORD,
    });
    if (signInError) throw signInError;

    userIds.push(data.user!.id);
    return { id: data.user!.id, client };
  }

  beforeAll(async () => {
    const first = await makeUser("chore-ravi");
    const second = await makeUser("chore-kumar");
    ravi = first.client;
    kumar = second.client;

    const { data: house, error } = await ravi.rpc("create_house", {
      p_name: `Chore House ${stamp}`,
      p_address: null,
      p_timezone: "Asia/Kolkata",
      p_currency: "INR",
    });
    if (error) throw error;
    houseId = (house as { house_id: string }[])[0].house_id;

    await admin.from("house_members").insert({
      house_id: houseId,
      user_id: second.id,
      role: "member",
      status: "active",
      can_cook: true,
    });

    const { data: members, error: membersError } = await admin
      .from("house_members")
      .select("id, user_id")
      .eq("house_id", houseId);

    if (membersError) throw membersError;
    console.log('Members:', members);

    raviMemberId = (members as { id: string; user_id: string }[]).find(
      (row) => row.user_id === first.id,
    )!.id;
    kumarMemberId = (members as { id: string; user_id: string }[]).find(
      (row) => row.user_id === second.id,
    )!.id;

    const { data: template } = await admin
      .from("chore_templates")
      .select("id")
      .eq("house_id", houseId)
      .limit(1)
      .single();
    templateId = (template as { id: string }).id;
  }, 120_000);

  afterAll(async () => {
    if (!configured || !houseId) return;
    await admin.from("chore_assignments").delete().eq("house_id", houseId);
    await admin.from("effort_ledger").delete().eq("house_id", houseId);
    await admin.from("expenses").delete().eq("house_id", houseId);
    await admin.from("houses").delete().eq("id", houseId);
    for (const userId of userIds) await admin.auth.admin.deleteUser(userId);
  }, 120_000);

  it("seeds the default chore templates with a new house", async () => {
    const { data } = await ravi
      .from("chore_templates")
      .select("name")
      .eq("house_id", houseId);

    expect((data ?? []).length).toBeGreaterThanOrEqual(8);
    expect((data ?? []).map((row) => row.name)).toContain("Cook dinner");
  });

  async function makeAssignment(assignee: string, points = 30) {
    const { data, error } = await admin
      .from("chore_assignments")
      .insert({
        house_id: houseId,
        template_id: templateId,
        assignee_member_id: assignee,
        chore_date: weekStart,
        slot: "evening",
        window_start: `${weekStart}T17:00:00Z`,
        window_end: `${weekStart}T23:00:00Z`,
        deadline: `${weekStart}T23:59:00Z`,
        effort_points: points,
        duration_min: 60,
      })
      .select("id")
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  it("posts points exactly once, on peer confirmation", async () => {
    const assignmentId = await makeAssignment(raviMemberId, 30);

    const done = await ravi.rpc("mark_chore_done", {
      p_assignment_id: assignmentId,
      p_photo_url: null,
    });
    expect(done.error).toBeNull();
    expect(done.data).toBe("done_pending");

    // No points yet — done is not confirmed.
    const { data: beforeLedger } = await admin
      .from("effort_ledger")
      .select("earned_points")
      .eq("member_id", raviMemberId)
      .eq("week_start", weekStart)
      .maybeSingle();
    expect(beforeLedger?.earned_points ?? 0).toBe(0);

    const confirm = await kumar.rpc("confirm_chore", { p_assignment_id: assignmentId });
    expect(confirm.error).toBeNull();

    const { data: ledger } = await admin
      .from("effort_ledger")
      .select("earned_points, confirmed_count")
      .eq("member_id", raviMemberId)
      .eq("week_start", weekStart)
      .single();

    expect(ledger!.earned_points).toBe(30);
    expect(ledger!.confirmed_count).toBe(1);

    // Confirming again must not pay twice. The trigger guards on the
    // transition, so a repeated update moves nothing.
    await admin
      .from("chore_assignments")
      .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
      .eq("id", assignmentId);

    const { data: after } = await admin
      .from("effort_ledger")
      .select("earned_points")
      .eq("member_id", raviMemberId)
      .eq("week_start", weekStart)
      .single();

    expect(after!.earned_points).toBe(30);
  });

  it("v_template_last_done carries the last-completed figure (CH-12)", async () => {
    const assignmentId = await makeAssignment(raviMemberId, 30);
    await ravi.rpc("mark_chore_done", { p_assignment_id: assignmentId, p_photo_url: null });
    const confirm = await kumar.rpc("confirm_chore", { p_assignment_id: assignmentId });
    expect(confirm.error).toBeNull();

    const { data: assignment } = await admin
      .from("chore_assignments")
      .select("done_at")
      .eq("id", assignmentId)
      .single();

    // Read as an ordinary member (ravi), not the service role — the view must
    // resolve under RLS like any other read.
    const { data: rows, error } = await ravi
      .from("v_template_last_done")
      .select("template_id, last_done_at, last_done_by, last_done_by_name")
      .eq("house_id", houseId);
    expect(error).toBeNull();

    const completed = (rows ?? []).find((row) => row.template_id === templateId);
    expect(completed?.last_done_at).toBe(assignment!.done_at);
    expect(completed?.last_done_by).toBe(raviMemberId);
    expect(completed?.last_done_by_name).toBe("chore-ravi");

    // A template nothing has ever touched reads null, not a creation date.
    const untouched = (rows ?? []).find((row) => row.template_id !== templateId);
    expect(untouched?.last_done_at).toBeNull();
  });

  it("attaches a photo or note after the tap, never before it (CE-12, S-12)", async () => {
    const assignmentId = await makeAssignment(raviMemberId, 20);

    // Marking done with nothing supplied — the tap itself is never gated.
    const done = await ravi.rpc("mark_chore_done", { p_assignment_id: assignmentId, p_photo_url: null });
    expect(done.error).toBeNull();
    expect(done.data).toBe("done_pending");

    // The note is added afterwards, on its own call.
    const attach = await ravi.rpc("attach_chore_details", {
      p_assignment_id: assignmentId,
      p_photo_url: null,
      p_note: "Used the blue bucket, ran out of soap",
    });
    expect(attach.error).toBeNull();

    const { data: row } = await admin
      .from("chore_assignments")
      .select("note, status")
      .eq("id", assignmentId)
      .single();
    expect(row!.note).toBe("Used the blue bucket, ran out of soap");
    expect(row!.status).toBe("done_pending");

    // Nobody but the assignee attaches to somebody else's chore.
    const other = await makeAssignment(kumarMemberId, 20);
    const forbidden = await ravi.rpc("attach_chore_details", {
      p_assignment_id: other,
      p_photo_url: null,
      p_note: "not mine",
    });
    expect(forbidden.error?.message ?? "").toContain("NOT_ASSIGNEE");

    // Once confirmed, the instance is no longer open for this.
    const confirm = await kumar.rpc("confirm_chore", { p_assignment_id: assignmentId });
    expect(confirm.error).toBeNull();
    const late = await ravi.rpc("attach_chore_details", {
      p_assignment_id: assignmentId,
      p_photo_url: null,
      p_note: "too late",
    });
    expect(late.error?.message ?? "").toContain("WRONG_STATE");
  });

  it("refuses self-confirmation (SEC-04)", async () => {
    const assignmentId = await makeAssignment(raviMemberId, 20);
    await ravi.rpc("mark_chore_done", { p_assignment_id: assignmentId, p_photo_url: null });

    const { error } = await ravi.rpc("confirm_chore", { p_assignment_id: assignmentId });
    expect(error?.message ?? "").toContain("SELF_CONFIRM");
  });

  it("refuses self-confirmation at the database, even with the service role", async () => {
    const assignmentId = await makeAssignment(raviMemberId, 20);

    // The service role bypasses RLS entirely. The check constraint does not
    // care who is asking.
    const { error } = await admin
      .from("chore_assignments")
      .update({ status: "confirmed", confirmed_by: raviMemberId })
      .eq("id", assignmentId);

    expect(error?.message ?? "").toContain("no_self_confirm");
  });

  it("refuses a mark-done from anybody but the assignee", async () => {
    const assignmentId = await makeAssignment(raviMemberId, 20);
    const { error } = await kumar.rpc("mark_chore_done", {
      p_assignment_id: assignmentId,
      p_photo_url: null,
    });
    expect(error?.message ?? "").toContain("NOT_ASSIGNEE");
  });

  it("gives one retry on rejection, then marks it missed", async () => {
    const assignmentId = await makeAssignment(raviMemberId, 25);
    await ravi.rpc("mark_chore_done", { p_assignment_id: assignmentId, p_photo_url: null });

    const first = await kumar.rpc("reject_chore", {
      p_assignment_id: assignmentId,
      p_reason: "The floor is still wet",
    });
    expect(first.data).toBe("rejected");

    await ravi.rpc("mark_chore_done", { p_assignment_id: assignmentId, p_photo_url: null });
    const second = await kumar.rpc("reject_chore", {
      p_assignment_id: assignmentId,
      p_reason: "Still not done",
    });
    expect(second.data).toBe("missed");

    const { data: ledger } = await admin
      .from("effort_ledger")
      .select("missed_count")
      .eq("member_id", raviMemberId)
      .eq("week_start", weekStart)
      .single();
    expect(ledger!.missed_count).toBeGreaterThanOrEqual(1);
  });

  it("lets a chore be released and claimed, and only once", async () => {
    const assignmentId = await makeAssignment(raviMemberId, 15);

    const released = await ravi.rpc("release_chore", { p_assignment_id: assignmentId });
    expect(released.data).toBe("open");

    const claimed = await kumar.rpc("claim_chore", { p_assignment_id: assignmentId });
    expect(claimed.data).toBe("assigned");

    // A second claim finds nothing open to take.
    const again = await ravi.rpc("claim_chore", { p_assignment_id: assignmentId });
    expect(again.error?.message ?? "").toContain("ALREADY_CLAIMED");
  });

  it("moves an assignment on an accepted swap", async () => {
    const assignmentId = await makeAssignment(raviMemberId, 15);

    const { data: swapId, error } = await ravi.rpc("request_swap", {
      p_assignment_id: assignmentId,
      p_to_member_id: kumarMemberId,
      p_message: "Away that evening",
    });
    expect(error).toBeNull();

    const responded = await kumar.rpc("respond_to_swap", {
      p_swap_id: swapId as unknown as string,
      p_accept: true,
    });
    expect(responded.error).toBeNull();
    expect(responded.data).toBe("accepted");

    const { data: assignment } = await admin
      .from("chore_assignments")
      .select("assignee_member_id, source")
      .eq("id", assignmentId)
      .single();

    expect(assignment!.assignee_member_id).toBe(kumarMemberId);
    expect(assignment!.source).toBe("swap");
  });

  it("generates a week, assigns everything, and never double-assigns", async () => {
    const { data: runId, error } = await ravi.rpc("publish_schedule", {
      p_week_start: "2026-09-07",
      p_assignments: [
        {
          template_id: templateId,
          assignee_member_id: raviMemberId,
          chore_date: "2026-09-07",
          slot: "evening",
          window_start: "2026-09-07T17:00:00Z",
          window_end: "2026-09-07T23:00:00Z",
          deadline: "2026-09-07T23:59:00Z",
          effort_points: 30,
          duration_min: 60,
          status: "assigned",
        },
        {
          template_id: templateId,
          assignee_member_id: "",
          chore_date: "2026-09-08",
          slot: "evening",
          window_start: "2026-09-08T17:00:00Z",
          window_end: "2026-09-08T23:00:00Z",
          deadline: "2026-09-08T23:59:00Z",
          effort_points: 30,
          duration_min: 60,
          status: "open",
        },
      ],
      p_generator: "engine",
      p_llm_accepted: null,
      p_llm_rationale: null,
      p_max_deviation: 5,
    });

    expect(error).toBeNull();
    expect(runId).toBeTruthy();

    const { data: published } = await admin
      .from("chore_assignments")
      .select("status, assignee_member_id")
      .eq("schedule_run_id", runId as unknown as string);

    expect(published).toHaveLength(2);
    expect(published!.filter((row) => row.status === "open")).toHaveLength(1);

    const { data: runRow } = await admin
      .from("schedule_runs")
      .select("unassigned_count, total_points")
      .eq("id", runId as unknown as string)
      .single();

    expect(runRow!.unassigned_count).toBe(1);
    expect(runRow!.total_points).toBe(60);
  });

  it("preserves confirmed work when a week is regenerated (NFR-11)", async () => {
    const week = "2026-09-14";

    await ravi.rpc("publish_schedule", {
      p_week_start: week,
      p_assignments: [
        {
          template_id: templateId,
          assignee_member_id: raviMemberId,
          chore_date: week,
          slot: "evening",
          window_start: `${week}T17:00:00Z`,
          window_end: `${week}T23:00:00Z`,
          deadline: `${week}T23:59:00Z`,
          effort_points: 30,
          duration_min: 60,
          status: "assigned",
        },
      ],
      p_generator: "engine",
      p_max_deviation: 0,
    });

    const { data: first } = await admin
      .from("chore_assignments")
      .select("id")
      .eq("house_id", houseId)
      .eq("chore_date", week)
      .single();

    const assignmentId = (first as { id: string }).id;
    await ravi.rpc("mark_chore_done", { p_assignment_id: assignmentId, p_photo_url: null });
    await kumar.rpc("confirm_chore", { p_assignment_id: assignmentId });

    // Regenerate the same week with a different plan.
    await ravi.rpc("publish_schedule", {
      p_week_start: week,
      p_assignments: [
        {
          template_id: templateId,
          assignee_member_id: kumarMemberId,
          chore_date: week,
          slot: "morning",
          window_start: `${week}T06:00:00Z`,
          window_end: `${week}T12:00:00Z`,
          deadline: `${week}T23:59:00Z`,
          effort_points: 20,
          duration_min: 30,
          status: "assigned",
        },
      ],
      p_generator: "engine",
      p_max_deviation: 0,
    });

    const { data: survivor } = await admin
      .from("chore_assignments")
      .select("id, status")
      .eq("id", assignmentId)
      .single();

    // The confirmed chore is untouched: regenerating must never take away
    // points somebody already earned.
    expect(survivor!.status).toBe("confirmed");
  });

  it("lets the scheduled job publish, and nobody else (D-13)", async () => {
    const week = "2026-09-21";
    const assignments = [
      {
        template_id: templateId,
        assignee_member_id: raviMemberId,
        chore_date: week,
        slot: "evening",
        window_start: `${week}T17:00:00Z`,
        window_end: `${week}T23:00:00Z`,
        deadline: `${week}T23:59:00Z`,
        effort_points: 25,
        duration_min: 45,
        status: "assigned",
      },
    ];

    // The cron path: no JWT, so publish_schedule's admin check could never pass.
    const { data: runId, error } = await admin.rpc("publish_schedule_for_house", {
      p_house_id: houseId,
      p_week_start: week,
      p_assignments: assignments,
      p_generator: "engine",
      p_max_deviation: 0,
    });

    expect(error).toBeNull();
    expect(runId).toBeTruthy();

    const { data: published } = await admin
      .from("chore_assignments")
      .select("assignee_member_id")
      .eq("schedule_run_id", runId as unknown as string);

    expect(published).toHaveLength(1);

    // The whole point of the second function is that ordinary callers cannot
    // reach it — including an admin, who has publish_schedule for that.
    const denied = await ravi.rpc("publish_schedule_for_house", {
      p_house_id: houseId,
      p_week_start: week,
      p_assignments: assignments,
      p_generator: "engine",
      p_max_deviation: 0,
    });

    expect(denied.error).not.toBeNull();
  });

  it("records the targets the week was solved against", async () => {
    const week = "2026-09-28";

    // What the generator writes alongside the assignments. Without it,
    // close-effort-week has no target to measure against, every carry_out is
    // zero, and the deficit mechanism silently does nothing.
    const { error } = await admin.from("effort_ledger").upsert(
      [
        {
          house_id: houseId,
          member_id: raviMemberId,
          week_start: week,
          base_target: 100,
          carry_in: -20,
          effective_target: 120,
          present_days: 7,
        },
      ],
      { onConflict: "house_id,member_id,week_start" },
    );

    expect(error).toBeNull();

    // Confirming a chore in that week must add to earned_points without
    // disturbing the target the row already carries.
    const { data: runId } = await admin.rpc("publish_schedule_for_house", {
      p_house_id: houseId,
      p_week_start: week,
      p_assignments: [
        {
          template_id: templateId,
          assignee_member_id: raviMemberId,
          chore_date: week,
          slot: "evening",
          window_start: `${week}T17:00:00Z`,
          window_end: `${week}T23:00:00Z`,
          deadline: `${week}T23:59:00Z`,
          effort_points: 30,
          duration_min: 60,
          status: "assigned",
        },
      ],
      p_generator: "engine",
      p_max_deviation: 0,
    });

    const { data: assignment } = await admin
      .from("chore_assignments")
      .select("id")
      .eq("schedule_run_id", runId as unknown as string)
      .single();

    const assignmentId = (assignment as { id: string }).id;
    await ravi.rpc("mark_chore_done", { p_assignment_id: assignmentId, p_photo_url: null });
    await kumar.rpc("confirm_chore", { p_assignment_id: assignmentId });

    const { data: ledger } = await admin
      .from("effort_ledger")
      .select("effective_target, earned_points")
      .eq("house_id", houseId)
      .eq("member_id", raviMemberId)
      .eq("week_start", week)
      .single();

    expect(ledger!.effective_target).toBe(120);
    expect(ledger!.earned_points).toBe(30);
  });

  it("keeps another house's chores invisible", async () => {
    const outsider = await makeUser("chore-outsider");
    await outsider.client.rpc("create_house", {
      p_name: `Outsider House ${stamp}`,
      p_address: null,
      p_timezone: "Asia/Kolkata",
      p_currency: "INR",
    });

    for (const table of [
      "chore_templates",
      "chore_assignments",
      "schedule_runs",
      "effort_ledger",
    ] as const) {
      const { data } = await outsider.client.from(table).select("id").eq("house_id", houseId);
      expect(data).toEqual([]);
    }
  }, 60_000);
});
