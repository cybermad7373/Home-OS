-- 033 — The penalty becomes money
--
-- Phase 5's whole point. A member who ends the month in effort deficit pays a
-- per-point fee into the settlement, credited to the members who carried the
-- surplus (design decision 4). Until now `chore_penalties` existed and stayed
-- empty, and `member_period_balances` carried two columns that were always zero.
--
-- The arithmetic is done in lib/domain/settlement/netting.ts, where it is
-- tested without a database. What is enforced here is the pair of invariants
-- that make it safe to store:
--
--   * the penalties are a pure transfer  — Σ owed = Σ credited, exactly;
--   * the settlement still nets to zero  — already checked, and unchanged by a
--     transfer that sums to nothing.
--
-- Both are checked against what is about to be written, inside the same
-- transaction, so a defect blocks the close rather than closing a month whose
-- numbers do not add up.

drop function if exists close_period(uuid, jsonb, jsonb);

create or replace function close_period(
  p_period_id   uuid,
  p_balances    jsonb,
  p_settlements jsonb,
  p_penalties   jsonb default '[]'::jsonb
) returns period_status as $$
declare
  v_period    monthly_periods;
  v_me        house_members;
  v_pending   integer;
  v_month_end boolean;
  v_sum       bigint;
  v_total     bigint;
  v_owed      bigint;
  v_credited  bigint;
begin
  select * into v_period from monthly_periods where id = p_period_id;
  if v_period.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  v_me := current_member(v_period.house_id);
  if v_me.id is null or v_me.role <> 'admin' then
    raise exception 'ADMIN_REQUIRED' using errcode = 'insufficient_privilege';
  end if;

  if v_period.status = 'closed' then
    raise exception 'PERIOD_CLOSED' using errcode = 'check_violation';
  end if;

  -- BR-102 — nothing may be pending. An unapproved expense that lands after the
  -- close would have nowhere to go.
  select count(*) into v_pending from expenses
   where period_id = p_period_id and status = 'pending_approval';
  if v_pending > 0 then
    raise exception 'APPROVALS_PENDING' using errcode = 'check_violation';
  end if;

  select month_ended into v_month_end from period_close_readiness(p_period_id);
  if not v_month_end then
    raise exception 'MONTH_NOT_ENDED' using errcode = 'check_violation';
  end if;

  -- BR-107 — the invariant, checked against what is about to be stored.
  select coalesce(sum((row ->> 'final_net_paise')::bigint), 0) into v_sum
    from jsonb_array_elements(p_balances) as row;
  if v_sum <> 0 then
    raise exception 'NETS_NONZERO: %', v_sum using errcode = 'check_violation';
  end if;

  -- A penalty moves money between members; it never creates or destroys any.
  -- If these two disagree the settlement above would still net to zero while
  -- charging somebody for a credit nobody received.
  select coalesce(sum((row ->> 'amount_owed_paise')::bigint), 0),
         coalesce(sum((row ->> 'amount_credited_paise')::bigint), 0)
    into v_owed, v_credited
    from jsonb_array_elements(p_penalties) as row;
  if v_owed <> v_credited then
    raise exception 'PENALTY_MISMATCH: owed % credited %', v_owed, v_credited
      using errcode = 'check_violation';
  end if;

  delete from member_period_balances where period_id = p_period_id;
  delete from settlements where period_id = p_period_id and status = 'pending';
  delete from chore_penalties where period_id = p_period_id;

  insert into member_period_balances (
    house_id, period_id, member_id, total_paid_paise, fair_share_paise,
    expense_net_paise, penalty_owed_paise, penalty_credit_paise, final_net_paise
  )
  select v_period.house_id, p_period_id,
         (row ->> 'member_id')::uuid,
         (row ->> 'total_paid_paise')::bigint,
         (row ->> 'fair_share_paise')::bigint,
         (row ->> 'expense_net_paise')::bigint,
         coalesce((row ->> 'penalty_owed_paise')::bigint, 0),
         coalesce((row ->> 'penalty_credit_paise')::bigint, 0),
         (row ->> 'final_net_paise')::bigint
    from jsonb_array_elements(p_balances) as row;

  -- The points behind the money. member_period_balances records what somebody
  -- pays; this records why, and a member who disputes a penalty is owed the
  -- deficit and the rate, not just the total.
  insert into chore_penalties (
    house_id, period_id, member_id, deficit_points, surplus_points,
    rate_paise, amount_owed_paise, amount_credited_paise
  )
  select v_period.house_id, p_period_id,
         (row ->> 'member_id')::uuid,
         coalesce((row ->> 'deficit_points')::int, 0),
         coalesce((row ->> 'surplus_points')::int, 0),
         coalesce((row ->> 'rate_paise')::bigint, 0),
         coalesce((row ->> 'amount_owed_paise')::bigint, 0),
         coalesce((row ->> 'amount_credited_paise')::bigint, 0)
    from jsonb_array_elements(p_penalties) as row;

  insert into settlements (house_id, period_id, from_member_id, to_member_id,
                           amount_paise, upi_link)
  select v_period.house_id, p_period_id,
         (row ->> 'from_member_id')::uuid,
         (row ->> 'to_member_id')::uuid,
         (row ->> 'amount_paise')::bigint,
         row ->> 'upi_link'
    from jsonb_array_elements(p_settlements) as row;

  select coalesce(sum(amount_paise), 0) into v_total
    from expenses where period_id = p_period_id and status = 'approved';

  -- 'closing', not 'closed'. The month locks only when the last settlement is
  -- confirmed received — the app never decides that a payment happened.
  update monthly_periods
     set status              = 'closing',
         total_expense_paise = v_total,
         closed_by           = v_me.id,
         closed_at           = now()
   where id = p_period_id;

  return 'closing'::period_status;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function close_period(uuid, jsonb, jsonb, jsonb) to authenticated;
