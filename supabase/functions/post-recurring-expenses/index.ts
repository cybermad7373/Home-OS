// Edge function: post-recurring-expenses
//
// Runs daily at 06:00 house time (pg_cron, migration 019). For every active
// recurring definition whose next_run_date has arrived, it posts one expense
// with its splits and moves the definition to the following month.
//
// Idempotent by construction (NFR-11, BR-097): a unique index on
// (recurring_id, period_id) means a second run in the same month inserts
// nothing, so a missed day is safe to catch up and a double-fire is harmless.
//
// The split arithmetic here mirrors lib/domain/expenses/split.ts. The two are
// deliberately separate copies rather than a shared package: Deno and Next.js
// do not share a module graph on the free tier, and the alternative — the job
// calling back into the app over HTTP — would make a scheduled database task
// depend on the web tier being awake.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface RecurringRow {
  id: string;
  house_id: string;
  name: string;
  amount_paise: number;
  category_id: string;
  paid_by_member_id: string | null;
  split_basis: "equal" | "room_rent" | "custom";
  day_of_month: number;
  auto_approve: boolean;
  next_run_date: string;
}

interface MemberRow {
  id: string;
  joined_date: string;
  left_date: string | null;
  status: string;
  role: string;
  /** False for a dependent whose share is carried by somebody else. */
  shares_cost: boolean;
  guardian_member_id: string | null;
}

/**
 * The dependent and pot-mode rules, duplicated from lib/domain/expenses/split.ts
 * because Deno and Next.js share no module graph (DECISIONS.md D-06). Change
 * one, change both — the worked examples in tests/unit/household.test.ts hold
 * for this copy too.
 */
function payersAmong(members: MemberRow[]): MemberRow[] {
  return members.filter((member) => member.shares_cost !== false);
}

/** The first person up the guardian chain who actually pays, or null. */
function carrierFor(
  member: MemberRow,
  byId: Map<string, MemberRow>,
  payerIds: Set<string>,
): string | null {
  const seen = new Set<string>([member.id]);
  let guardianId = member.guardian_member_id;

  while (guardianId !== null && !seen.has(guardianId)) {
    if (payerIds.has(guardianId)) return guardianId;
    seen.add(guardianId);
    guardianId = byId.get(guardianId)?.guardian_member_id ?? null;
  }
  return null;
}

interface Share {
  member_id: string;
  share_paise: number;
  guest_share_paise: number;
  dependent_share_paise: number;
  basis_note: string | null;
}

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** The calendar date in a given IANA timezone, as YYYY-MM-DD. */
function todayIn(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function advance(runDate: string): string {
  const [year, month, day] = runDate.split("-").map(Number);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function activeOn(member: MemberRow, date: string): boolean {
  if (member.status === "pending") return false;
  if (member.joined_date > date) return false;
  if (member.left_date !== null && member.left_date < date) return false;
  return true;
}

/** Equal split with the remainder handed out one paisa at a time, by member id. */
function splitEqual(amountPaise: number, participants: MemberRow[]): Share[] {
  const payers = payersAmong(participants);
  const payerIds = new Set(payers.map((member) => member.id));
  const byId = new Map(participants.map((member) => [member.id, member]));

  const carried = participants
    .filter((member) => member.shares_cost === false)
    .map((member) => carrierFor(member, byId, payerIds))
    .filter((id): id is string => id !== null);

  const ids = payers.map((member) => member.id).sort();
  const heads = ids.length + carried.length;
  const base = Math.floor(amountPaise / heads);
  const remainder = amountPaise - base * heads;

  const shares: Share[] = ids.map((id) => ({
    member_id: id,
    share_paise: base,
    guest_share_paise: 0,
    dependent_share_paise: 0,
    basis_note: null,
  }));
  const byMember = new Map(shares.map((share) => [share.member_id, share]));

  for (const guardianId of carried) {
    const share = byMember.get(guardianId);
    if (share) share.dependent_share_paise += base;
  }

  for (let index = 0; index < remainder; index += 1) {
    shares[index % shares.length].share_paise += 1;
  }
  return shares;
}

/** Pot mode: the whole amount on whoever paid, and no debt anywhere. */
function splitPayer(amountPaise: number, payerId: string): Share[] {
  return [
    {
      member_id: payerId,
      share_paise: amountPaise,
      guest_share_paise: 0,
      dependent_share_paise: 0,
      basis_note: null,
    },
  ];
}

/** Rent by room; a vacant room's rent rides on everybody. */
function splitRoomRent(
  amountPaise: number,
  participants: MemberRow[],
  rooms: { id: string; monthly_rent_paise: number; occupants: string[] }[],
): Share[] {
  // Only the people who pay divide a rent; a room of children is a vacant room
  // as far as the money is concerned.
  const ids = payersAmong(participants).map((member) => member.id).sort();
  const totals = new Map<string, number>(ids.map((id) => [id, 0]));
  const configured = rooms.reduce((sum, room) => sum + room.monthly_rent_paise, 0);

  if (configured === 0) return splitEqual(amountPaise, participants);

  let vacant = 0;

  for (const room of [...rooms].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const occupants = room.occupants.filter((id) => totals.has(id)).sort();
    if (occupants.length === 0) {
      vacant += room.monthly_rent_paise;
      continue;
    }
    const base = Math.floor(room.monthly_rent_paise / occupants.length);
    const remainder = room.monthly_rent_paise - base * occupants.length;
    for (const id of occupants) totals.set(id, (totals.get(id) ?? 0) + base);
    for (let index = 0; index < remainder; index += 1) {
      const id = occupants[index % occupants.length];
      totals.set(id, (totals.get(id) ?? 0) + 1);
    }
  }

  const spread = amountPaise - (configured - vacant);
  if (spread !== 0) {
    const base = Math.floor(spread / ids.length);
    const remainder = spread - base * ids.length;
    for (const id of ids) totals.set(id, (totals.get(id) ?? 0) + base);
    for (let index = 0; index < Math.abs(remainder); index += 1) {
      const id = ids[index % ids.length];
      totals.set(id, (totals.get(id) ?? 0) + (remainder < 0 ? -1 : 1));
    }
  }

  return ids.map((id) => ({
    member_id: id,
    share_paise: totals.get(id) ?? 0,
    guest_share_paise: 0,
    dependent_share_paise: 0,
    basis_note: null,
  }));
}

Deno.serve(async () => {
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const posted: string[] = [];
  const skipped: { id: string; why: string }[] = [];

  const { data: houses, error: housesError } = await supabase
    .from("houses")
    .select("id, timezone, house_settings ( money_mode )");

  if (housesError) {
    return Response.json({ error: housesError.message }, { status: 500 });
  }

  for (const house of houses ?? []) {
    const today = todayIn(house.timezone);
    // A one-row embed comes back as an object or a one-element array depending
    // on how PostgREST reads the relationship; accept either rather than
    // silently treating a pot household as a splitting one.
    const settings = Array.isArray(house.house_settings)
      ? house.house_settings[0]
      : house.house_settings;
    const isPot = settings?.money_mode === "pot";

    const { data: definitions } = await supabase
      .from("recurring_expenses")
      .select("*")
      .eq("house_id", house.id)
      .eq("active", true)
      // On or before, not equal: a job that failed yesterday still posts today
      // rather than skipping the month entirely.
      .lte("next_run_date", today);

    if (!definitions || definitions.length === 0) continue;

    const [{ data: members }, { data: rooms }, { data: assignments }] = await Promise.all([
      supabase
        .from("house_members")
        .select(
          "id, joined_date, left_date, status, role, shares_cost, guardian_member_id",
        )
        .eq("house_id", house.id),
      supabase
        .from("rooms")
        .select("id, monthly_rent_paise")
        .eq("house_id", house.id)
        .is("deleted_at", null),
      supabase
        .from("room_assignments")
        .select("room_id, member_id, from_date, to_date")
        .eq("house_id", house.id),
    ]);

    for (const definition of definitions as RecurringRow[]) {
      const postDate = definition.next_run_date;
      const period = postDate.slice(0, 7);

      const participants = (members ?? []).filter((member) =>
        activeOn(member as MemberRow, postDate),
      );

      if (participants.length === 0) {
        skipped.push({ id: definition.id, why: "no members on that date" });
        continue;
      }

      // Whoever fronts it, or the admin if the definition leaves it open. It
      // must be somebody who carries money: a rent expense paid by a child is
      // not a thing.
      const payers = payersAmong(participants as MemberRow[]);
      if (payers.length === 0) {
        skipped.push({ id: definition.id, why: "nobody who pays a share on that date" });
        continue;
      }
      const payer =
        definition.paid_by_member_id ??
        payers.find((member) => member.role === "admin")?.id ??
        payers[0].id;

      const { data: periodId, error: periodError } = await supabase.rpc("ensure_period", {
        p_house_id: house.id,
        p_period: period,
      });

      if (periodError || !periodId) {
        skipped.push({ id: definition.id, why: periodError?.message ?? "no period" });
        continue;
      }

      const { data: periodRow } = await supabase
        .from("monthly_periods")
        .select("status")
        .eq("id", periodId)
        .single();

      if (periodRow?.status === "closed") {
        skipped.push({ id: definition.id, why: "period closed" });
        continue;
      }

      const occupancy = (rooms ?? []).map((room) => ({
        id: room.id,
        monthly_rent_paise: room.monthly_rent_paise,
        occupants: (assignments ?? [])
          .filter(
            (assignment) =>
              assignment.room_id === room.id &&
              assignment.from_date <= postDate &&
              (assignment.to_date === null || assignment.to_date >= postDate),
          )
          .map((assignment) => assignment.member_id),
      }));

      // A pot household's rent creates no debt. Recording it against the payer
      // is what makes the month net to nothing without a second code path
      // anywhere downstream.
      const basis = isPot ? "payer" : definition.split_basis;
      const shares =
        basis === "payer"
          ? splitPayer(definition.amount_paise, payer)
          : basis === "room_rent"
            ? splitRoomRent(
                definition.amount_paise,
                participants as MemberRow[],
                occupancy,
              )
            : splitEqual(definition.amount_paise, participants as MemberRow[]);

      const { data: expense, error: insertError } = await supabase
        .from("expenses")
        .insert({
          house_id: house.id,
          period_id: periodId,
          paid_by_member_id: payer,
          category_id: definition.category_id,
          amount_paise: definition.amount_paise,
          description: definition.name,
          expense_date: postDate,
          split_basis: basis,
          status: definition.auto_approve ? "approved" : "pending_approval",
          recurring_id: definition.id,
          created_by: payer,
        })
        .select("id")
        .maybeSingle();

      if (insertError) {
        // A unique-violation here is the idempotency guard doing its job: this
        // definition already posted for this period. Not an error.
        skipped.push({
          id: definition.id,
          why: insertError.code === "23505" ? "already posted this period" : insertError.message,
        });
        // Still advance, so a duplicate does not retry every day for a month.
        await supabase
          .from("recurring_expenses")
          .update({ next_run_date: advance(postDate) })
          .eq("id", definition.id);
        continue;
      }

      await supabase.from("expense_splits").insert(
        shares.map((share) => ({
          house_id: house.id,
          expense_id: expense!.id,
          member_id: share.member_id,
          share_paise: share.share_paise,
          guest_share_paise: share.guest_share_paise,
          dependent_share_paise: share.dependent_share_paise,
          basis_note: share.basis_note,
        })),
      );

      await supabase
        .from("recurring_expenses")
        .update({ next_run_date: advance(postDate) })
        .eq("id", definition.id);

      posted.push(definition.id);
    }
  }

  return Response.json({ posted: posted.length, skipped });
});
