/**
 * The shell of a home: the house row, its settings and governance, the people
 * in it, the rooms they sleep in, and the join history that put them there.
 *
 * Written with the service role rather than through `create_house`, because
 * that function needs a signed-in caller and the seed has to work with every
 * sign-in method switched off. The rows are the same ones it would write —
 * including the two `seed_default_*` calls the previous seed silently skipped,
 * which is why the demo house had no chore templates and every chore screen
 * showed "no chores are set up yet".
 */
import { admin, insertOne, must } from "./env.mjs";
import { PEOPLE } from "./profiles.mjs";

const DEFAULT_CATEGORIES = [
  ["Groceries", "🥬"],
  ["Rent", "🏠"],
  ["Utilities", "⚡"],
  ["Gas", "🔥"],
  ["Internet", "📶"],
  ["Maid", "🧹"],
  ["Eating out", "🍽"],
  ["Household", "🧺"],
  ["Other", "📦"],
];

/**
 * The default chore list, mirroring `seed_default_chore_templates` in
 * migration 20260823090028.
 *
 * Duplicated rather than called, because that function is `security definer`
 * and revoked from every role the seed can reach — `create_house` calls it on
 * a real sign-up, and nothing else can. The previous seed inserted the house
 * row directly and so never got these, which is why the demo house had no chore
 * list at all and every chore screen showed "no chores are set up yet".
 *
 * If the two ever disagree the seeded chore list is wrong, not the app; the
 * function is the source of truth.
 */
const DEFAULT_TEMPLATES = [
  ["Cook dinner", "cooking", 30, 60, "evening", "daily", null, true, false],
  ["Cook breakfast", "cooking", 20, 40, "morning", "daily", null, true, false],
  ["Clean kitchen", "kitchen_cleaning", 20, 30, "evening", "daily", null, false, false],
  ["Wash dishes", "kitchen_cleaning", 15, 25, "evening", "daily", null, false, false],
  ["Clean bathroom", "bathroom_cleaning", 25, 30, "any", "times_per_week", 2, false, true],
  ["Mop common area", "mopping", 15, 20, "morning", "times_per_week", 3, false, false],
  ["Clean common area", "common_cleaning", 12, 20, "any", "times_per_week", 3, false, false],
  ["Take out rubbish", "other", 5, 5, "evening", "daily", null, false, false],
];

/**
 * The two `seed_default_*` functions are `security definer` and revoked from
 * the API roles, the service role included, so both are attempted and both fall
 * back to writing the same rows rather than leaving the home half-built.
 */
async function seedDefaults(houseId) {
  const categories = await admin.rpc("seed_default_categories", { p_house_id: houseId });
  if (categories.error) {
    must(
      "insert expense_categories",
      await admin
        .from("expense_categories")
        .insert(DEFAULT_CATEGORIES.map(([name, icon]) => ({ house_id: houseId, name, icon })))
        .select("id"),
    );
  }

  const templates = await admin.rpc("seed_default_chore_templates", { p_house_id: houseId });
  if (templates.error) {
    must(
      "insert chore_templates",
      await admin
        .from("chore_templates")
        .insert(
          DEFAULT_TEMPLATES.map(
            ([
              name,
              category,
              effort_points,
              duration_min,
              slot,
              frequency,
              times_per_week,
              requires_cooking_skill,
              is_heavy,
            ]) => ({
              house_id: houseId,
              name,
              category,
              effort_points,
              duration_min,
              slot,
              frequency,
              times_per_week,
              requires_cooking_skill,
              is_heavy,
            }),
          ),
        )
        .select("id"),
    );
  }
}

export async function createHome(home, accountIds, joinedDate) {
  const founder = home.roster[0];

  const house = await insertOne("houses", {
    name: home.name,
    home_type: home.homeType,
    address: home.address,
    ...home.place,
    timezone: home.timezone,
    currency: "INR",
    invite_code: home.inviteCode,
    created_by: accountIds.get(founder.username),
  });
  const houseId = house.id;

  await insertOne("house_settings", { house_id: houseId, ...home.settings }, "house_id");

  // A policy row is written by a trigger on the house; this is the house's own
  // amendment to it, which is what makes the three homes govern differently.
  must(
    "update governance_policy",
    await admin.from("governance_policy").update(home.governance).eq("house_id", houseId).select("house_id"),
  );

  await seedDefaults(houseId);

  // The founder, then everybody else through the path a real person takes:
  // HM-06 says nobody is created into a home, they ask and a lead accepts.
  const members = new Map();
  const adminMember = await insertOne("house_members", {
    house_id: houseId,
    user_id: accountIds.get(founder.username),
    role: founder.role,
    status: "active",
    can_cook: PEOPLE[founder.username].canCook,
    residency: founder.residency ?? "full_time",
    joined_date: joinedDate,
  });
  members.set(founder.username, adminMember.id);

  await insertOne("invitations", {
    house_id: houseId,
    token: home.inviteToken,
    created_by: adminMember.id,
  });

  for (const entry of home.roster.slice(1)) {
    const member = await insertOne("house_members", {
      house_id: houseId,
      user_id: accountIds.get(entry.username),
      role: entry.role,
      status: "active",
      can_cook: PEOPLE[entry.username].canCook,
      residency: entry.residency ?? "full_time",
      joined_date: joinedDate,
    });
    members.set(entry.username, member.id);

    await insertOne("join_requests", {
      house_id: houseId,
      user_id: accountIds.get(entry.username),
      status: "accepted",
      decided_by: adminMember.id,
      decided_at: new Date(`${joinedDate}T10:00:00Z`).toISOString(),
      member_id: member.id,
    });
  }

  // Dependents have no login. The database insists on that: an adult must have
  // a user id, a dependent must have a display name and a guardian if they do
  // not carry a share of the cost.
  const dependents = new Map();
  const guardianOf = new Map();
  for (const dependent of home.dependents ?? []) {
    const row = await insertOne("house_members", {
      house_id: houseId,
      user_id: null,
      role: "member",
      status: "active",
      member_kind: "dependent",
      display_name: dependent.name,
      guardian_member_id: members.get(dependent.guardian),
      shares_cost: false,
      does_chores: dependent.doesChores,
      joined_date: joinedDate,
    });
    dependents.set(dependent.name, row.id);
    guardianOf.set(row.id, members.get(dependent.guardian));
  }

  // Somebody still at the door, so the join queue is a real queue.
  if (home.applicant) {
    await insertOne("join_requests", {
      house_id: houseId,
      user_id: accountIds.get(home.applicant.username),
      status: "requested",
      message: home.applicant.message,
    });
  }

  const rooms = [];
  for (const room of home.rooms) {
    const row = await insertOne("rooms", {
      house_id: houseId,
      name: room.name,
      capacity: room.capacity,
      monthly_rent_paise: room.rentPaise,
    });
    rooms.push(row.id);
  }

  const adults = home.roster.map((entry) => members.get(entry.username));
  for (const [index, memberId] of adults.entries()) {
    await insertOne("room_assignments", {
      house_id: houseId,
      room_id: rooms[home.occupancy[index]],
      member_id: memberId,
      from_date: joinedDate,
    });
  }
  const dependentIds = [...dependents.values()];
  for (const [index, memberId] of dependentIds.entries()) {
    await insertOne("room_assignments", {
      house_id: houseId,
      room_id: rooms[home.dependentOccupancy[index]],
      member_id: memberId,
      from_date: joinedDate,
    });
  }

  const categories = must(
    "select expense_categories",
    await admin.from("expense_categories").select("id, name").eq("house_id", houseId),
  );

  return {
    houseId,
    adminMemberId: adminMember.id,
    members,
    dependents,
    /** D-24: a guardian may mark their dependent's chore done but not confirm it. */
    guardianOf,
    /** Adults first, in roster order, then dependents. */
    memberIds: adults,
    dependentIds,
    allMemberIds: [...adults, ...dependentIds],
    /** Only these carry a share of the money. */
    payerIds: adults,
    rooms,
    categoryByName: new Map(categories.map((row) => [row.name, row.id])),
  };
}

/**
 * A house cascades to every table that references it, so removing one is a
 * single delete — with one exception. `assert_period_open` refuses to delete an
 * expense whose period is closed, and it fires on the cascade too, so the
 * periods are reopened first.
 */
export async function deleteHome(houseId) {
  await admin.from("monthly_periods").update({ status: "open" }).eq("house_id", houseId);
  must("delete houses", await admin.from("houses").delete().eq("id", houseId).select("id"));
}

export async function findHome(name) {
  const row = must(
    "select houses",
    await admin.from("houses").select("id").eq("name", name).maybeSingle(),
  );
  return row?.id ?? null;
}
