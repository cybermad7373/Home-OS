import "server-only";

import { apiErrorFromPostgres } from "@/lib/api/errors";
import { loadGovernanceContext } from "./governance";
import type { Session } from "./house";
import type { GovernancePolicy } from "@/lib/domain/governance/types";
import type { Database } from "@/lib/types/database";

/**
 * Everything the propose screen needs to draw its seven forms.
 *
 * Seven of the fifteen decision types had no way in. The database applied them,
 * `POST /api/decisions` accepted them, and the seeded Home showed them sitting
 * in the log — but `ProposeSheet` was mounted in exactly two files, so
 * `change_governance`, `change_home_mode`, `change_confirmation_policy`,
 * `balance_adjustment`, `set_expected_contribution`, `create_reserve` and
 * `reserve_draw` were features that existed everywhere except where somebody
 * could reach them. A Home that can see a kind of decision in its own history
 * and cannot make one is being shown a feature it does not have.
 *
 * The forms need current values, not blank fields — a governance change is an
 * edit to a policy that already exists, and a form that started empty would
 * propose resetting eight settings to make one of them move. So this is one
 * round of reads rather than seven.
 */

type ConfirmationPolicy = Database["public"]["Enums"]["confirmation_policy"];
type MoneyMode = Database["public"]["Enums"]["money_mode"];
type EffortMode = Database["public"]["Enums"]["effort_mode"];
type HomeType = Database["public"]["Enums"]["home_type"];

export interface ProposalMember {
  id: string;
  displayName: string;
}

export interface ProposalPeriod {
  id: string;
  period: string;
}

export interface ProposalReserve {
  id: string;
  name: string;
  balancePaise: number;
}

export interface ProposalExpense {
  id: string;
  description: string;
  amountPaise: number;
}

export interface ProposalContext {
  policy: GovernancePolicy;
  confirmationPolicy: ConfirmationPolicy;
  homeType: HomeType;
  moneyMode: MoneyMode;
  effortMode: EffortMode;
  penaltyEnabled: boolean;
  members: ProposalMember[];
  /**
   * Months with stored balances. `effect_balance_adjustment` refuses a period
   * that has none — an adjustment adjusts something — so an open month is not
   * offered rather than offered and then refused.
   */
  settledPeriods: ProposalPeriod[];
  reserves: ProposalReserve[];
  /**
   * Approved expenses that no reserve has paid for yet. The draw takes its
   * amount from the expense itself, so this list is the whole of the choice.
   */
  drawableExpenses: ProposalExpense[];
}

export async function loadProposalContext(
  session: Session,
  houseId: string,
): Promise<ProposalContext> {
  const governance = await loadGovernanceContext(session, houseId);

  const [settings, house, periods, reserves, expenses] = await Promise.all([
    session.supabase
      .from("house_settings")
      .select("confirmation_policy, money_mode, effort_mode, penalty_enabled")
      .eq("house_id", houseId)
      .maybeSingle(),
    session.supabase
      .from("houses")
      .select("home_type")
      .eq("id", houseId)
      .maybeSingle(),
    session.supabase
      .from("monthly_periods")
      .select("id, period, status")
      .eq("house_id", houseId)
      .in("status", ["closed", "reopened"])
      .order("period", { ascending: false })
      .limit(12),
    session.supabase
      .from("reserves")
      .select("id, name, balance_paise")
      .eq("house_id", houseId)
      .eq("active", true)
      .order("name"),
    session.supabase
      .from("expenses")
      .select("id, description, amount_paise, status, reserve_id")
      .eq("house_id", houseId)
      .eq("status", "approved")
      .is("reserve_id", null)
      .order("expense_date", { ascending: false })
      .limit(50),
  ]);

  for (const result of [settings, house, periods, reserves, expenses]) {
    if (result.error) throw apiErrorFromPostgres(result.error);
  }

  return {
    policy: governance.policy,
    confirmationPolicy: settings.data?.confirmation_policy ?? "size_aware",
    homeType: house.data?.home_type ?? "shared",
    moneyMode: settings.data?.money_mode ?? "split",
    effortMode: settings.data?.effort_mode ?? "points",
    penaltyEnabled: settings.data?.penalty_enabled ?? true,
    // Dependents are excluded: an expectation and an adjustment are both about
    // somebody who can be asked, and a dependent has nobody to ask.
    members: governance.members
      .filter((member) => member.status === "active" && member.kind === "adult")
      .map((member) => ({
        id: member.id,
        displayName: governance.names.get(member.id) ?? "Someone",
      })),
    settledPeriods: (periods.data ?? []).map((row) => ({
      id: row.id,
      period: row.period,
    })),
    reserves: (reserves.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      balancePaise: row.balance_paise,
    })),
    drawableExpenses: (expenses.data ?? []).map((row) => ({
      id: row.id,
      description: row.description ?? "Untitled expense",
      amountPaise: row.amount_paise,
    })),
  };
}
