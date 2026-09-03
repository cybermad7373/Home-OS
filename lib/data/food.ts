import "server-only";

import { ApiError, apiErrorFromPostgres } from "@/lib/api/errors";
import { computeMealShares, MealSplitError } from "@/lib/domain/food/split";
import { matchFoodName, type LibraryCandidate, type MatchResult } from "@/lib/domain/food/dedup";
import {
  rankLibrary,
  type RecommendCandidate,
  type RecommendContext,
  type RankResult,
} from "@/lib/domain/food/recommend";
import { buildShoppingDrafts, type PlanForShopping } from "@/lib/domain/food/shopping";
import { houseToday } from "@/lib/utils/date";
import type { Session } from "./house";
import type {
  CreateMealInput,
  CreateMealPlanInput,
  CreateRestrictionInput,
  CreateShoppingItemInput,
  ConfirmMealPlanInput,
  UpdateFoodPreferenceInput,
  UpdateShoppingItemInput,
} from "@/lib/validation/food";
import type { Database } from "@/lib/types/database";

/**
 * The food repository. SQL lives here and in the migrations, nowhere else
 * (docs/03-ARCHITECTURE.md section 6).
 *
 * The split arithmetic is deliberately absent — lib/domain/food/split.ts knows
 * nothing about a database. This file resolves participants to shares and
 * hands the precomputed numbers to create_meal, the same division of labour
 * lib/data/expenses.ts uses for expense_splits.
 */

type Tables = Database["public"]["Tables"];
type MealRow = Tables["meals"]["Row"];
type FoodRow = Tables["foods"]["Row"];
type MealPlanRow = Tables["meal_plans"]["Row"];

export interface MealParticipantView {
  memberId: string | null;
  guestId: string | null;
  label: string | null;
  displayName: string;
  sharePaise: number;
}

export interface MealItemView {
  id: string;
  name: string;
  quantity: string | null;
  costPaise: number | null;
}

export interface MealView {
  id: string;
  name: string;
  mealDate: string;
  mealType: MealRow["meal_type"];
  source: MealRow["source"];
  baseCostPaise: number;
  prepCostPaise: number;
  deliveryCostPaise: number;
  otherCostPaise: number;
  totalCostPaise: number;
  foodId: string | null;
  expenseId: string | null;
  photoUrl: string | null;
  recipeInstructions: string | null;
  note: string | null;
  createdBy: string;
  createdAt: string;
  items: MealItemView[];
  participants: MealParticipantView[];
}

const MEAL_SELECT = `
  *,
  meal_items ( id, name, quantity, cost_paise ),
  meal_participants (
    member_id, guest_id, label, share_paise,
    house_members ( id, display_name, users ( display_name ) ),
    guests ( id, name )
  )
`;

type MealJoinRow = MealRow & {
  meal_items: { id: string; name: string; quantity: string | null; cost_paise: number | null }[];
  meal_participants: {
    member_id: string | null;
    guest_id: string | null;
    label: string | null;
    share_paise: number;
    house_members:
      | { id: string; display_name: string | null; users: { display_name: string } | null }
      | null;
    guests: { id: string; name: string } | null;
  }[];
};

function toMealView(row: MealJoinRow): MealView {
  return {
    id: row.id,
    name: row.name,
    mealDate: row.meal_date,
    mealType: row.meal_type,
    source: row.source,
    baseCostPaise: row.base_cost_paise,
    prepCostPaise: row.prep_cost_paise,
    deliveryCostPaise: row.delivery_cost_paise,
    otherCostPaise: row.other_cost_paise,
    totalCostPaise: row.total_cost_paise,
    foodId: row.food_id,
    expenseId: row.expense_id,
    photoUrl: row.photo_url,
    recipeInstructions: row.recipe_instructions,
    note: row.note,
    createdBy: row.created_by,
    createdAt: row.created_at,
    items: row.meal_items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      costPaise: item.cost_paise,
    })),
    participants: row.meal_participants.map((p) => ({
      memberId: p.member_id,
      guestId: p.guest_id,
      label: p.label,
      displayName:
        p.house_members?.users?.display_name ??
        p.house_members?.display_name ??
        p.guests?.name ??
        p.label ??
        "Someone",
      sharePaise: p.share_paise,
    })),
  };
}

/**
 * Resolves the request's participants into precomputed shares. A meal with no
 * participants has no per-person cost (section 2.1) and is written with none —
 * `computeMealShares` is only called for the identities that carry a head
 * count (members and guests split the total; a label-only eater does too).
 */
function buildShares(
  totalPaise: number,
  participants: CreateMealInput["participants"] | ConfirmMealPlanInput["participants"],
): { member_id?: string; guest_id?: string; label?: string; share_paise: number }[] {
  if (participants.length === 0) return [];

  const headIds = participants.map(
    (p, index) => p.memberId ?? p.guestId ?? `label:${index}:${p.label}`,
  );

  let shares;
  try {
    shares = computeMealShares(totalPaise, headIds);
  } catch (error) {
    if (error instanceof MealSplitError) throw new ApiError("NO_PARTICIPANTS");
    throw error;
  }

  const shareByHeadId = new Map(shares.map((s) => [s.memberId, s.sharePaise]));

  return participants.map((p, index) => {
    const headId = p.memberId ?? p.guestId ?? `label:${index}:${p.label}`;
    const sharePaise = shareByHeadId.get(headId) ?? 0;
    if (p.memberId) return { member_id: p.memberId, share_paise: sharePaise };
    if (p.guestId) return { guest_id: p.guestId, share_paise: sharePaise };
    return { label: p.label, share_paise: sharePaise };
  });
}

export async function createMeal(
  session: Session,
  houseId: string,
  memberId: string,
  input: CreateMealInput,
): Promise<string> {
  const totalPaise =
    input.baseCostPaise + input.prepCostPaise + input.deliveryCostPaise + input.otherCostPaise;
  const shares = buildShares(totalPaise, input.participants);

  // Section 4: "Save to Home Food Library?" — any member's checkbox, not only
  // a lead's. An exact match on the normalised form is reused rather than
  // duplicated, the same rule the did-you-mean panel follows client-side; the
  // server checks again because the client's check is a convenience, not the
  // enforcement (the unique index on (house_id, normalised_name) is that).
  let foodId = input.foodId;
  if (!foodId && input.saveToLibrary) {
    const existing = await matchFood(session, houseId, input.name);
    foodId = existing.exact?.id ?? (await createFoodLibraryEntry(session, houseId, memberId, {
      name: input.name,
      defaultSource: input.source,
      recipeInstructions: input.recipeInstructions,
    }));
  }

  const { data, error } = await session.supabase.rpc("create_meal", {
    p_house_id: houseId,
    p_name: input.name,
    p_meal_date: input.mealDate,
    p_shares: shares,
    p_meal_type: input.mealType,
    p_source: input.source,
    p_base_cost_paise: input.baseCostPaise,
    p_prep_cost_paise: input.prepCostPaise,
    p_delivery_cost_paise: input.deliveryCostPaise,
    p_other_cost_paise: input.otherCostPaise,
    p_food_id: foodId,
    p_expense_id: input.expenseId,
    p_items: input.items.length > 0
      ? input.items.map((item) => ({ name: item.name, quantity: item.quantity ?? null, cost_paise: item.costPaise ?? null }))
      : undefined,
    p_recipe_instructions: input.recipeInstructions,
    p_photo_url: input.photoUrl,
    p_note: input.note,
  });

  if (error) throw apiErrorFromPostgres(error);
  return data as string;
}

export async function getMeal(session: Session, mealId: string): Promise<MealView | null> {
  const { data, error } = await session.supabase
    .from("meals")
    .select(MEAL_SELECT)
    .eq("id", mealId)
    .maybeSingle();
  if (error) throw apiErrorFromPostgres(error);
  if (!data) return null;
  return toMealView(data as unknown as MealJoinRow);
}

export async function listMeals(
  session: Session,
  houseId: string,
  opts?: { from?: string; to?: string; limit?: number },
): Promise<MealView[]> {
  let query = session.supabase
    .from("meals")
    .select(MEAL_SELECT)
    .eq("house_id", houseId)
    .order("meal_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (opts?.from) query = query.gte("meal_date", opts.from);
  if (opts?.to) query = query.lte("meal_date", opts.to);
  if (opts?.limit) query = query.limit(opts.limit);

  const { data, error } = await query;
  if (error) throw apiErrorFromPostgres(error);
  return (data as unknown as MealJoinRow[] ?? []).map(toMealView);
}

export async function deleteMeal(session: Session, mealId: string): Promise<void> {
  const { error } = await session.supabase.from("meals").delete().eq("id", mealId);
  if (error) throw apiErrorFromPostgres(error);
}

export async function linkMealToExpense(
  session: Session,
  mealId: string,
  expenseId: string,
): Promise<void> {
  const { error } = await session.supabase
    .from("meals")
    .update({ expense_id: expenseId })
    .eq("id", mealId);
  if (error) throw apiErrorFromPostgres(error);
}

export async function unlinkMealFromExpense(session: Session, mealId: string): Promise<void> {
  const { error } = await session.supabase
    .from("meals")
    .update({ expense_id: null })
    .eq("id", mealId);
  if (error) throw apiErrorFromPostgres(error);
}

// ---------------------------------------------------------------------------
// The library
// ---------------------------------------------------------------------------

export interface FoodView {
  id: string;
  name: string;
  defaultSource: FoodRow["default_source"];
  typicalCostPaise: number | null;
  timesEaten: number;
  lastEatenOn: string | null;
  homePreference: number | null;
  active: boolean;
  mergedIntoId: string | null;
}

function toFoodView(row: FoodRow): FoodView {
  return {
    id: row.id,
    name: row.name,
    defaultSource: row.default_source,
    typicalCostPaise: row.typical_cost_paise,
    timesEaten: row.times_eaten,
    lastEatenOn: row.last_eaten_on,
    homePreference: row.home_preference,
    active: row.active,
    mergedIntoId: row.merged_into_id,
  };
}

export async function listFoods(session: Session, houseId: string): Promise<FoodView[]> {
  const { data, error } = await session.supabase
    .from("foods")
    .select("*")
    .eq("house_id", houseId)
    .eq("active", true)
    .order("times_eaten", { ascending: false });
  if (error) throw apiErrorFromPostgres(error);
  return (data ?? []).map(toFoodView);
}

/** Section 4.1's dedup, run against the Home's live library before a name is saved. */
export async function matchFood(
  session: Session,
  houseId: string,
  candidateName: string,
): Promise<MatchResult> {
  const foods = await listFoods(session, houseId);
  const library: LibraryCandidate[] = foods.map((f) => ({
    id: f.id,
    name: f.name,
    timesEaten: f.timesEaten,
  }));
  return matchFoodName(candidateName, library);
}

export async function createFoodLibraryEntry(
  session: Session,
  houseId: string,
  memberId: string,
  input: { name: string; defaultSource?: FoodRow["default_source"]; recipeInstructions?: string },
): Promise<string> {
  const normalised = candidateNormalised(input.name);
  const { data, error } = await session.supabase
    .from("foods")
    .insert({
      house_id: houseId,
      name: input.name,
      normalised_name: normalised,
      default_source: input.defaultSource ?? null,
      recipe_instructions: input.recipeInstructions ?? null,
      created_by: memberId,
    })
    .select("id")
    .single();
  if (error) throw apiErrorFromPostgres(error);
  return (data as { id: string }).id;
}

function candidateNormalised(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export async function mergeFoods(
  session: Session,
  sourceId: string,
  targetId: string,
): Promise<void> {
  if (sourceId === targetId) throw new ApiError("VALIDATION_FAILED");
  const { error } = await session.supabase.rpc("merge_food_entries", {
    p_source_id: sourceId,
    p_target_id: targetId,
  });
  if (error) throw apiErrorFromPostgres(error);
}

// ---------------------------------------------------------------------------
// Preferences (section 5) and restrictions (section 5.2a)
// ---------------------------------------------------------------------------

export interface FoodPreferenceView {
  id: string;
  foodId: string | null;
  itemName: string | null;
  memberId: string;
  rating: "like" | "okay" | "dislike";
}

/**
 * `food_preferences` is deduplicated by two partial unique indexes — one on
 * `(member_id, food_id)`, one on `(member_id, lower(item_name))` — so there is
 * no single column list a plain `ON CONFLICT` clause can target. Matched and
 * updated by hand instead: an update that touches no row falls through to an
 * insert.
 */
export async function upsertFoodPreference(
  session: Session,
  houseId: string,
  memberId: string,
  input: UpdateFoodPreferenceInput,
): Promise<void> {
  let existingQuery = session.supabase
    .from("food_preferences")
    .select("id")
    .eq("member_id", memberId);
  existingQuery = input.foodId
    ? existingQuery.eq("food_id", input.foodId)
    : existingQuery.ilike("item_name", input.itemName!);

  const { data: existing, error: findError } = await existingQuery.maybeSingle();
  if (findError) throw apiErrorFromPostgres(findError);

  if (existing) {
    const { error } = await session.supabase
      .from("food_preferences")
      .update({ rating: input.rating })
      .eq("id", (existing as { id: string }).id);
    if (error) throw apiErrorFromPostgres(error);
    return;
  }

  const { error } = await session.supabase.from("food_preferences").insert({
    house_id: houseId,
    member_id: memberId,
    food_id: input.foodId ?? null,
    item_name: input.itemName ?? null,
    rating: input.rating,
  });
  if (error) throw apiErrorFromPostgres(error);
}

export async function listFoodPreferences(
  session: Session,
  houseId: string,
  foodId?: string,
): Promise<FoodPreferenceView[]> {
  let query = session.supabase.from("food_preferences").select("*").eq("house_id", houseId);
  if (foodId) query = query.eq("food_id", foodId);
  const { data, error } = await query;
  if (error) throw apiErrorFromPostgres(error);
  return (data ?? []).map((row) => ({
    id: row.id,
    foodId: row.food_id,
    itemName: row.item_name,
    memberId: row.member_id,
    rating: row.rating,
  }));
}

export interface RestrictionView {
  id: string;
  memberId: string;
  itemName: string;
  severity: "allergy" | "intolerance" | "diet";
  note: string | null;
}

export async function listMyRestrictions(
  session: Session,
  memberId: string,
): Promise<RestrictionView[]> {
  const { data, error } = await session.supabase
    .from("member_restrictions")
    .select("*")
    .eq("member_id", memberId);
  if (error) throw apiErrorFromPostgres(error);
  return (data ?? []).map((row) => ({
    id: row.id,
    memberId: row.member_id,
    itemName: row.item_name,
    severity: row.severity,
    note: row.note,
  }));
}

export async function createRestriction(
  session: Session,
  houseId: string,
  input: CreateRestrictionInput,
): Promise<string> {
  const { data, error } = await session.supabase
    .from("member_restrictions")
    .insert({
      house_id: houseId,
      member_id: input.memberId,
      item_name: input.itemName,
      severity: input.severity,
      note: input.note ?? null,
    })
    .select("id")
    .single();
  if (error) throw apiErrorFromPostgres(error);
  return (data as { id: string }).id;
}

export async function deleteRestriction(session: Session, restrictionId: string): Promise<void> {
  const { error } = await session.supabase
    .from("member_restrictions")
    .delete()
    .eq("id", restrictionId);
  if (error) throw apiErrorFromPostgres(error);
}

// ---------------------------------------------------------------------------
// Planned meals (section 11, FD-20)
// ---------------------------------------------------------------------------

export interface MealPlanView {
  id: string;
  name: string;
  plannedDate: string;
  foodId: string | null;
  confirmedMealId: string | null;
  createdBy: string;
}

function toPlanView(row: MealPlanRow): MealPlanView {
  return {
    id: row.id,
    name: row.name,
    plannedDate: row.planned_date,
    foodId: row.food_id,
    confirmedMealId: row.confirmed_meal_id,
    createdBy: row.created_by,
  };
}

export async function createMealPlan(
  session: Session,
  houseId: string,
  memberId: string,
  input: CreateMealPlanInput,
): Promise<string> {
  const { data, error } = await session.supabase
    .from("meal_plans")
    .insert({
      house_id: houseId,
      name: input.name,
      planned_date: input.plannedDate,
      food_id: input.foodId ?? null,
      created_by: memberId,
    })
    .select("id")
    .single();
  if (error) throw apiErrorFromPostgres(error);
  return (data as { id: string }).id;
}

export async function listMealPlans(
  session: Session,
  houseId: string,
  opts?: { from?: string; to?: string },
): Promise<MealPlanView[]> {
  let query = session.supabase
    .from("meal_plans")
    .select("*")
    .eq("house_id", houseId)
    .order("planned_date", { ascending: true });
  if (opts?.from) query = query.gte("planned_date", opts.from);
  if (opts?.to) query = query.lte("planned_date", opts.to);
  const { data, error } = await query;
  if (error) throw apiErrorFromPostgres(error);
  return (data ?? []).map(toPlanView);
}

/**
 * The only moment a plan becomes evidence. Everything ordinary applies from
 * here — participants, per-person cost, the library offer, the expense link
 * (section 11). Refused once already confirmed (BR-218 by extension).
 */
export async function confirmMealPlan(
  session: Session,
  houseId: string,
  planId: string,
  input: ConfirmMealPlanInput,
): Promise<string> {
  const { data: plan, error: planError } = await session.supabase
    .from("meal_plans")
    .select("*")
    .eq("id", planId)
    .maybeSingle();
  if (planError) throw apiErrorFromPostgres(planError);
  if (!plan) throw new ApiError("PLAN_NOT_FOUND");
  if (plan.confirmed_meal_id) throw new ApiError("PLAN_ALREADY_CONFIRMED");

  const totalPaise =
    input.baseCostPaise + input.prepCostPaise + input.deliveryCostPaise + input.otherCostPaise;
  const shares = buildShares(totalPaise, input.participants);

  const { data: mealId, error } = await session.supabase.rpc("create_meal", {
    p_house_id: houseId,
    p_name: plan.name,
    p_meal_date: plan.planned_date,
    p_shares: shares,
    p_meal_type: input.mealType,
    p_source: input.source,
    p_base_cost_paise: input.baseCostPaise,
    p_prep_cost_paise: input.prepCostPaise,
    p_delivery_cost_paise: input.deliveryCostPaise,
    p_other_cost_paise: input.otherCostPaise,
    p_food_id: plan.food_id ?? undefined,
    p_expense_id: input.expenseId,
    p_items: input.items.length > 0
      ? input.items.map((item) => ({ name: item.name, quantity: item.quantity ?? null, cost_paise: item.costPaise ?? null }))
      : undefined,
  });
  if (error) throw apiErrorFromPostgres(error);

  const { error: updateError } = await session.supabase
    .from("meal_plans")
    .update({ confirmed_meal_id: mealId as string })
    .eq("id", planId);
  if (updateError) throw apiErrorFromPostgres(updateError);

  return mealId as string;
}

export async function deleteMealPlan(session: Session, planId: string): Promise<void> {
  const { error } = await session.supabase.from("meal_plans").delete().eq("id", planId);
  if (error) throw apiErrorFromPostgres(error);
}

// ---------------------------------------------------------------------------
// Shopping list (section 13) — derives from meal plans, never a standalone
// module. shopping_items.meal_id points at an eaten meal, so a generated
// item — sourced from an unconfirmed plan — carries no meal link.
// ---------------------------------------------------------------------------

export interface ShoppingItemView {
  id: string;
  name: string;
  quantity: string | null;
  unit: string | null;
  estimatedPricePaise: number | null;
  mealId: string | null;
  checkedOff: boolean;
  createdBy: string;
}

type ShoppingItemRow = Tables["shopping_items"]["Row"];

function toShoppingItemView(row: ShoppingItemRow): ShoppingItemView {
  return {
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    estimatedPricePaise: row.estimated_price_paise,
    mealId: row.meal_id,
    checkedOff: row.checked_off,
    createdBy: row.created_by,
  };
}

export async function listShoppingItems(
  session: Session,
  houseId: string,
): Promise<ShoppingItemView[]> {
  const { data, error } = await session.supabase
    .from("shopping_items")
    .select("*")
    .eq("house_id", houseId)
    .order("created_at", { ascending: true });
  if (error) throw apiErrorFromPostgres(error);
  return (data ?? []).map(toShoppingItemView);
}

export async function createShoppingItem(
  session: Session,
  houseId: string,
  memberId: string,
  input: CreateShoppingItemInput,
): Promise<string> {
  const { data, error } = await session.supabase
    .from("shopping_items")
    .insert({
      house_id: houseId,
      name: input.name,
      quantity: input.quantity ?? null,
      unit: input.unit ?? null,
      estimated_price_paise: input.estimatedPricePaise ?? null,
      meal_id: input.mealId ?? null,
      created_by: memberId,
    })
    .select("id")
    .single();
  if (error) throw apiErrorFromPostgres(error);
  return (data as { id: string }).id;
}

export async function updateShoppingItem(
  session: Session,
  memberId: string,
  itemId: string,
  input: UpdateShoppingItemInput,
): Promise<void> {
  const patch: Tables["shopping_items"]["Update"] = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.quantity !== undefined) patch.quantity = input.quantity;
  if (input.unit !== undefined) patch.unit = input.unit;
  if (input.estimatedPricePaise !== undefined) patch.estimated_price_paise = input.estimatedPricePaise;
  if (input.checkedOff !== undefined) {
    patch.checked_off = input.checkedOff;
    patch.checked_off_by = input.checkedOff ? memberId : null;
    patch.checked_off_at = input.checkedOff ? new Date().toISOString() : null;
  }

  const { error } = await session.supabase.from("shopping_items").update(patch).eq("id", itemId);
  if (error) throw apiErrorFromPostgres(error);
}

export async function deleteShoppingItem(session: Session, itemId: string): Promise<void> {
  const { error } = await session.supabase.from("shopping_items").delete().eq("id", itemId);
  if (error) throw apiErrorFromPostgres(error);
}

/**
 * The "Generate from meals" action (S-53). Reads the next 7 days of
 * unconfirmed plans, their linked library food's `default_items`, and the
 * house's current list, then inserts whatever `buildShoppingDrafts` decides
 * is new. Returns how many items were added.
 */
export async function generateShoppingItems(
  session: Session,
  houseId: string,
  memberId: string,
): Promise<number> {
  const from = houseToday();
  const to = new Date(Date.parse(`${from}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);

  const { data: plans, error: plansError } = await session.supabase
    .from("meal_plans")
    .select("food_id")
    .eq("house_id", houseId)
    .is("confirmed_meal_id", null)
    .not("food_id", "is", null)
    .gte("planned_date", from)
    .lte("planned_date", to);
  if (plansError) throw apiErrorFromPostgres(plansError);

  const foodIds = [...new Set((plans ?? []).map((p) => p.food_id).filter((id): id is string => id !== null))];
  if (foodIds.length === 0) return 0;

  const { data: foods, error: foodsError } = await session.supabase
    .from("foods")
    .select("id, default_items")
    .in("id", foodIds);
  if (foodsError) throw apiErrorFromPostgres(foodsError);

  const itemsByFoodId = new Map((foods ?? []).map((f) => [f.id, f.default_items]));
  const plansForShopping: PlanForShopping[] = (plans ?? []).map((p) => ({
    foodId: p.food_id,
    defaultItems: p.food_id ? (itemsByFoodId.get(p.food_id) ?? []) : [],
  }));

  const { data: existing, error: existingError } = await session.supabase
    .from("shopping_items")
    .select("name")
    .eq("house_id", houseId);
  if (existingError) throw apiErrorFromPostgres(existingError);

  const drafts = buildShoppingDrafts(plansForShopping, (existing ?? []).map((e) => e.name));
  if (drafts.length === 0) return 0;

  const { error: insertError } = await session.supabase.from("shopping_items").insert(
    drafts.map((name) => ({
      house_id: houseId,
      name,
      created_by: memberId,
    })),
  );
  if (insertError) throw apiErrorFromPostgres(insertError);

  return drafts.length;
}

// ---------------------------------------------------------------------------
// Suggestions (section 6.1) — the library half, deterministic, always available.
// ---------------------------------------------------------------------------

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Section 7: reads the money module in one direction only, and only for a
 * plain sentence and the cost term's pressure. A Home with no category named
 * for food spending reads as comfortably inside budget rather than erroring —
 * budget awareness is additive, never a precondition for suggestions.
 */
export async function budgetPressureFor(session: Session, houseId: string): Promise<number> {
  const { data: category } = await session.supabase
    .from("expense_categories")
    .select("id, monthly_budget_paise")
    .eq("house_id", houseId)
    .ilike("name", "%food%")
    .not("monthly_budget_paise", "is", null)
    .limit(1)
    .maybeSingle();

  if (!category?.monthly_budget_paise || category.monthly_budget_paise <= 0) return 0;

  const monthStart = `${houseToday().slice(0, 7)}-01`;
  const { data: expenses } = await session.supabase
    .from("expenses")
    .select("amount_paise")
    .eq("house_id", houseId)
    .eq("category_id", category.id)
    .eq("status", "approved")
    .gte("expense_date", monthStart);

  const spent = (expenses ?? []).reduce((sum, e) => sum + e.amount_paise, 0);
  return Math.max(0, Math.min(1, spent / category.monthly_budget_paise));
}

export async function getSuggestions(
  session: Session,
  houseId: string,
  memberId: string,
  mealType: string,
  homeRegionTag: string | null,
): Promise<RankResult> {
  const now = houseToday();

  const [{ data: foods, error: foodsError }, { data: safeRows, error: safeError }, { count: totalMeals }] =
    await Promise.all([
      session.supabase
        .from("foods")
        .select("id, name, last_eaten_on, typical_cost_paise, region_tag, meal_types")
        .eq("house_id", houseId)
        .eq("active", true)
        .gt("times_eaten", 0),
      session.supabase.rpc("foods_safe_for", { p_house_id: houseId, p_member_ids: [memberId] }),
      session.supabase.from("meals").select("*", { count: "exact", head: true }).eq("house_id", houseId),
    ]);

  if (foodsError) throw apiErrorFromPostgres(foodsError);
  if (safeError) throw apiErrorFromPostgres(safeError);

  const candidateFoods = foods ?? [];
  if (candidateFoods.length === 0) {
    return { suggestions: [], message: "Nothing in the library is safe for everyone eating tonight", coldStart: (totalMeals ?? 0) < 5 };
  }

  const foodIds = candidateFoods.map((f) => f.id);
  const safeIds = new Set((safeRows ?? []).map((r) => r.food_id));
  const restrictedIds = new Set(foodIds.filter((id) => !safeIds.has(id)));

  const thirtyDaysAgo = new Date(Date.parse(`${now}T00:00:00Z`) - 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const { data: recentMeals, error: recentError } = await session.supabase
    .from("meals")
    .select("food_id")
    .eq("house_id", houseId)
    .gte("meal_date", thirtyDaysAgo)
    .in("food_id", foodIds);
  if (recentError) throw apiErrorFromPostgres(recentError);

  const recentCounts = new Map<string, number>();
  for (const row of recentMeals ?? []) {
    if (!row.food_id) continue;
    recentCounts.set(row.food_id, (recentCounts.get(row.food_id) ?? 0) + 1);
  }

  const { data: prefRows, error: prefError } = await session.supabase
    .from("food_preferences")
    .select("food_id, member_id, rating")
    .eq("house_id", houseId)
    .in("food_id", foodIds);
  if (prefError) throw apiErrorFromPostgres(prefError);

  const ratingValue = (rating: "like" | "okay" | "dislike"): number =>
    rating === "like" ? 1 : rating === "dislike" ? -1 : 0;

  const preferenceFor = (foodId: string): number | null => {
    const rows = (prefRows ?? []).filter((r) => r.food_id === foodId);
    const mine = rows.find((r) => r.member_id === memberId);
    if (mine) return ratingValue(mine.rating);
    if (rows.length === 0) return null;
    const sum = rows.reduce((acc, r) => acc + ratingValue(r.rating), 0);
    return sum / rows.length;
  };

  const candidates: RecommendCandidate[] = candidateFoods.map((food) => ({
    foodId: food.id,
    name: food.name,
    preference: preferenceFor(food.id),
    lastEatenOn: food.last_eaten_on ?? now,
    timesEatenLast30Days: recentCounts.get(food.id) ?? 0,
    typicalCostPaise: food.typical_cost_paise,
    regionTag: food.region_tag,
    mealTypes: food.meal_types ?? [],
  }));

  const homeMedianCostPaise = median(
    candidateFoods.map((f) => f.typical_cost_paise).filter((c): c is number => c !== null),
  );

  const context: RecommendContext = {
    now,
    mealType,
    homeRegionTag,
    homeMedianCostPaise,
    budgetPressure: await budgetPressureFor(session, houseId),
  };

  return rankLibrary(candidates, restrictedIds, context, totalMeals ?? 0);
}
