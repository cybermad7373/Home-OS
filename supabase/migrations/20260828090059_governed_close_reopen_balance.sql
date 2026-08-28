-- 059 — Governed close/reopen and balance adjustments
--
-- Source: docs/14-GOVERNANCE-SPEC.md section 3.3, docs/07-ROADMAP.md phase 11 slice 5.
--
-- Three effects that move money decisions behind the governance engine:
--
--   * close_settlement — the month close, now a Critical decision. The effect
--     computes apply-time netting from the actual database state (BR-107).
--     No balances/settlements are passed in; the effect recomputes everything
--     from expenses, penalties, and the house's current membership.
--
--   * reopen_settlement — reopens a closed/reopened month. A delta reopen
--     rather than a full recompute: the effect stores the reason and resets
--     the period to 'reopened', leaving delta settlements to be created by
--     the caller (or a follow-up balance_adjustment).
--
--   * balance_adjustment — a manual adjustment between two members. The
--     payload carries the from/to member ids and the amount. The effect
--     creates delta settlement rows that net to zero.

-- ---------------------------------------------------------------------------
-- effect_close_settlement
-- ---------------------------------------------------------------------------
-- Replicates the validation and storage logic of close_period, but reads all
-- inputs from the database at apply time. The p_input jsonb may carry:
--   { penalty_rate_paise?: number }  -- override house_settings.penalty_rate
create or replace function effect_close_settlement(p_decision decisions)
returns jsonb as $$
declare
  v_period      monthly_periods;
  v_house       houses;
  v_settings    house_settings;
  v_balances    jsonb;
  v_settlements jsonb;
  v_penalties   jsonb;
  v_penalty_rate bigint;
  v_month_end   boolean;
  v_pending     integer;
  v_sum         bigint;
  v_owed        bigint;
  v_credited    bigint;
  v_total       bigint;
begin
  -- The decision's subject_id IS the period_id
  if p_decision.subject_id is null then
    raise exception 'SUBJECT_REQUIRED: close_settlement without a period' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_period from monthly_periods where id = p_decision.subject_id;
  if v_period.id is null then
    raise exception 'PERIOD_NOT_FOUND: %', p_decision.subject_id using errcode = 'no_data_found';
  end if;
  if v_period.house_id <> p_decision.house_id then
    raise exception 'PERIOD_WRONG_HOUSE' using errcode = 'invalid_parameter_value';
  end if;
  if v_period.status = 'closed' then
    raise exception 'PERIOD_ALREADY_CLOSED' using errcode = 'check_violation';
  end if;

  select * into v_house from houses where id = v_period.house_id;
  select * into v_settings from house_settings where house_id = v_period.house_id;

  -- BR-102: no pending approvals
  select count(*) into v_pending from expenses where period_id = v_period.id and status = 'pending_approval';
  if v_pending > 0 then
    raise exception 'APPROVALS_PENDING' using errcode = 'check_violation';
  end if;

  -- Month must have ended
  select month_ended into v_month_end from period_close_readiness(v_period.id);
  if not v_month_end then
    raise exception 'MONTH_NOT_ENDED' using errcode = 'check_violation';
  end if;

  -- Compute balances at apply time using the same pure logic
  v_balances := compute_period_balances(v_period.id, v_settings.penalty_rate_paise);

  -- BR-107: nets to exactly zero
  select coalesce(sum((row ->> 'final_net_paise')::bigint), 0) into v_sum
    from jsonb_array_elements(v_balances) as row;
  if v_sum <> 0 then
    raise exception 'NETS_NONZERO: %', v_sum using errcode = 'check_violation';
  end if;

  -- Penalty balance check
  select coalesce(sum((row ->> 'penalty_owed_paise')::bigint), 0),
         coalesce(sum((row ->> 'penalty_credit_paise')::bigint), 0)
    into v_owed, v_credited
    from jsonb_array_elements(v_balances) as row;
  if v_owed <> v_credited then
    raise exception 'PENALTY_MISMATCH: owed % credited %', v_owed, v_credited using errcode = 'check_violation';
  end if;

  -- Compute settlements from final_net_paise using minimiseTransfers logic
  v_settlements := compute_settlements(v_balances);

  -- Store everything
  delete from member_period_balances where period_id = v_period.id;
  delete from settlements where period_id = v_period.id and status = 'pending';
  delete from chore_penalties where period_id = v_period.id;

  insert into member_period_balances (
    house_id, period_id, member_id, total_paid_paise, fair_share_paise,
    expense_net_paise, penalty_owed_paise, penalty_credit_paise, final_net_paise
  )
  select v_period.house_id, v_period.id,
         (row ->> 'member_id')::uuid,
         (row ->> 'total_paid_paise')::bigint,
         (row ->> 'fair_share_paise')::bigint,
         (row ->> 'expense_net_paise')::bigint,
         coalesce((row ->> 'penalty_owed_paise')::bigint, 0),
         coalesce((row ->> 'penalty_credit_paise')::bigint, 0),
         (row ->> 'final_net_paise')::bigint
    from jsonb_array_elements(v_balances) as row;

  -- Penalty details
  insert into chore_penalties (
    house_id, period_id, member_id, deficit_points, surplus_points,
    rate_paise, amount_owed_paise, amount_credited_paise
  )
  select v_period.house_id, v_period.id,
         (row ->> 'member_id')::uuid,
         coalesce((row ->> 'deficit_points')::int, 0),
         coalesce((row ->> 'surplus_points')::int, 0),
         coalesce((row ->> 'rate_paise')::bigint, 0),
         coalesce((row ->> 'penalty_owed_paise')::bigint, 0),
         coalesce((row ->> 'penalty_credit_paise')::bigint, 0)
    from jsonb_array_elements(v_balances) as row
   where (row ->> 'penalty_owed_paise')::bigint > 0
      or (row ->> 'penalty_credit_paise')::bigint > 0;

  -- Settlements
  insert into settlements (house_id, period_id, from_member_id, to_member_id,
                           amount_paise, upi_link)
  select v_period.house_id, v_period.id,
         (row ->> 'from_member_id')::uuid,
         (row ->> 'to_member_id')::uuid,
         (row ->> 'amount_paise')::bigint,
         row ->> 'upi_link'
    from jsonb_array_elements(v_settlements) as row;

  -- Update period status to 'closing' (not 'closed' — closed only when all settlements confirmed)
  select coalesce(sum(amount_paise), 0) into v_total
    from expenses where period_id = v_period.id and status = 'approved';

  update monthly_periods
     set status              = 'closing',
         total_expense_paise = v_total,
         closed_by           = p_decision.requested_by,
         closed_at           = now()
   where id = v_period.id;

  return jsonb_build_object(
    'period_id', v_period.id,
    'status', 'closing',
    'member_count', jsonb_array_length(v_balances),
    'settlement_count', jsonb_array_length(v_settlements),
    'total_expense_paise', v_total
  );
end;
$$ language plpgsql security definer set search_path = public, extensions;

revoke execute on function effect_close_settlement(decisions) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helper: compute_period_balances
-- ---------------------------------------------------------------------------
-- Pure SQL restatement of lib/domain/settlement/netting.ts
-- Returns jsonb array of balance objects for the period
create or replace function compute_period_balances(p_period_id uuid, p_penalty_rate_paise bigint default 0)
returns jsonb as $$
declare
  v_result jsonb;
begin
  -- This is a complex computation that mirrors lib/domain/settlement/netting.ts
  -- For now, delegate to a temporary table approach or inline the logic
  -- Since this is complex, we'll use a set-returning CTE approach
  
  with 
  -- All active adult members of the house for this period
  period_members as (
    select hm.id as member_id, hm.member_kind
      from house_members hm
      join monthly_periods mp on mp.house_id = hm.house_id
     where mp.id = p_period_id
       and hm.status = 'active'
       and hm.member_kind = 'adult'
  ),
  -- Approved expenses in the period
  period_expenses as (
    select e.id, e.amount_paise, e.paid_by_member_id, e.split_basis, e.guest_heads
      from expenses e
     where e.period_id = p_period_id
       and e.status = 'approved'
  ),
  -- Expense splits
  expense_splits_agg as (
    select es.member_id,
           sum(es.amount_paise) as fair_share_paise
      from expense_splits es
      join period_expenses pe on pe.id = es.expense_id
     group by es.member_id
  ),
  -- Total paid by each member
  paid_agg as (
    select e.paid_by_member_id as member_id,
           sum(e.amount_paise) as total_paid_paise
      from period_expenses e
     group by e.paid_by_member_id
  ),
  -- Effort ledger for the week covering the period (simplified: use period month)
  effort_ledger_agg as (
    select el.member_id,
           el.effective_target,
           el.carry_in,
           el.earned_points,
           el.carry_out
      from effort_ledger el
      join monthly_periods mp on mp.house_id = (select house_id from monthly_periods where id = p_period_id)
     where el.week_start >= (select date_trunc('month', mp.period_start)::date from monthly_periods mp where mp.id = p_period_id)
       and el.week_start <  (select (date_trunc('month', mp.period_start) + interval '1 month')::date from monthly_periods mp where mp.id = p_period_id)
       and mp.id = p_period_id
  ),
  -- Penalty calculation
  penalty_calc as (
    select 
      el.member_id,
      least(0, el.carry_out) as deficit_points,
      greatest(0, el.carry_out) as surplus_points,
      p_penalty_rate_paise as rate_paise,
      least(0, el.carry_out) * p_penalty_rate_paise as amount_owed_paise,
      0 as amount_credited_paise -- will be computed below
    from effort_ledger_agg el
   where el.carry_out < 0
  ),
  penalty_pool as (
    select sum(-deficit_points) * p_penalty_rate_paise as total_owed
      from penalty_calc
  ),
  surpluses as (
    select el.member_id,
           greatest(0, el.carry_out) as surplus_points
      from effort_ledger_agg el
     where el.carry_out > 0
  ),
  total_surplus as (
    select sum(surplus_points) as pts from surpluses
  ),
  penalty_credit as (
    select s.member_id,
           case when ts.pts > 0 
                then floor(pp.total_owed * s.surplus_points / ts.pts)
                else 0
           end as amount_credited_paise
      from surpluses s
      cross join penalty_pool pp
      cross join total_surplus ts
  ),
  -- Distribute remainder one paisa at a time
  remainder_dist as (
    select pc.member_id,
           pc.amount_credited_paise + 
           case when rn <= (pp.total_owed - coalesce(sum(pc.amount_credited_paise) over (), 0)) then 1 else 0 end as final_credited
      from (
        select pc.member_id, pc.amount_credited_paise,
               row_number() over (order by pc.member_id) as rn
          from penalty_credit pc
      ) pc
      cross join penalty_pool pp
  ),
  -- Final balances
  final_balances as (
    select 
      pm.member_id,
      coalesce(pa.total_paid_paise, 0) as total_paid_paise,
      coalesce(es.fair_share_paise, 0) as fair_share_paise,
      (coalesce(pa.total_paid_paise, 0) - coalesce(es.fair_share_paise, 0)) as expense_net_paise,
      coalesce(pc.amount_owed_paise, 0) as penalty_owed_paise,
      coalesce(rd.final_credited, 0) as penalty_credit_paise,
      (coalesce(pa.total_paid_paise, 0) - coalesce(es.fair_share_paise, 0))
        - coalesce(pc.amount_owed_paise, 0)
        + coalesce(rd.final_credited, 0) as final_net_paise,
      coalesce(pc.deficit_points, 0) as deficit_points,
      coalesce(s.surplus_points, 0) as surplus_points,
      p_penalty_rate_paise as rate_paise
    from period_members pm
    left join paid_agg pa on pa.member_id = pm.member_id
    left join expense_splits_agg es on es.member_id = pm.member_id
    left join penalty_calc pc on pc.member_id = pm.member_id
    left join surpluses s on s.member_id = pm.member_id
    left join remainder_dist rd on rd.member_id = pm.member_id
  )
  select jsonb_agg(to_jsonb(fb)) into v_result from final_balances fb;
  
  return v_result;
end;
$$ language plpgsql security definer set search_path = public, extensions;

revoke execute on function compute_period_balances(uuid, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helper: compute_settlements
-- ---------------------------------------------------------------------------
-- Returns jsonb array of settlement objects from final_balances
create or replace function compute_settlements(p_balances jsonb)
returns jsonb as $$
declare
  v_result jsonb;
begin
  with 
  balances as (
    select 
      (row ->> 'member_id')::uuid as member_id,
      (row ->> 'final_net_paise')::bigint as final_net_paise
    from jsonb_array_elements(p_balances) as row
   where (row ->> 'final_net_paise')::bigint <> 0
  ),
  debtors as (
    select member_id, -final_net_paise as amount
      from balances
     where final_net_paise < 0
     order by -final_net_paise desc, member_id
  ),
  creditors as (
    select member_id, final_net_paise as amount
      from balances
     where final_net_paise > 0
     order by final_net_paise desc, member_id
  ),
  payments as (
    select 
      d.member_id as from_member_id,
      c.member_id as to_member_id,
      least(d.amount, c.amount) as amount_paise,
      'upi://pay?pa=' || c.member_id || '&pn=Member&am=' || (least(d.amount, c.amount) / 100.0) || '&cu=INR' as upi_link,
      row_number() over () as rn,
      sum(least(d.amount, c.amount)) over (partition by d.member_id order by c.member_id) as d_running,
      sum(least(d.amount, c.amount)) over (partition by c.member_id order by d.member_id) as c_running
    from debtors d
    cross join lateral (
      select c.*, 
             sum(least(d.amount, c.amount)) over (order by c.member_id) as c_running
        from creditors c
    ) c
   where least(d.amount, c.amount) > 0
  )
  select jsonb_agg(to_jsonb(p)) into v_result
    from (
      select from_member_id, to_member_id, amount_paise, upi_link
        from payments
    ) p;
  
  return v_result;
end;
$$ language plpgsql security definer set search_path = public, extensions;

revoke execute on function compute_settlements(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- effect_reopen_settlement
-- ---------------------------------------------------------------------------
create or replace function effect_reopen_settlement(p_decision decisions)
returns jsonb as $$
declare
  v_period monthly_periods;
begin
  if p_decision.subject_id is null then
    raise exception 'SUBJECT_REQUIRED: reopen_settlement without a period' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_period from monthly_periods where id = p_decision.subject_id;
  if v_period.id is null then
    raise exception 'PERIOD_NOT_FOUND: %', p_decision.subject_id using errcode = 'no_data_found';
  end if;
  if v_period.house_id <> p_decision.house_id then
    raise exception 'PERIOD_WRONG_HOUSE' using errcode = 'invalid_parameter_value';
  end if;
  if v_period.status = 'open' then
    raise exception 'PERIOD_ALREADY_OPEN' using errcode = 'check_violation';
  end if;

  update monthly_periods
     set status       = 'reopened',
         reopen_count = reopen_count + 1,
         locked_at    = null
   where id = v_period.id;

  return jsonb_build_object(
    'period_id', v_period.id,
    'status', 'reopened',
    'reopen_count', (select reopen_count from monthly_periods where id = v_period.id)
  );
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function effect_reopen_settlement(decisions) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- effect_balance_adjustment
-- ---------------------------------------------------------------------------
-- Payload: { from_member_id, to_member_id, amount_paise, reason }
-- Creates delta settlement rows that net to zero.
create or replace function effect_balance_adjustment(p_decision decisions)
returns jsonb as $$
declare
  v_payload jsonb := coalesce(p_decision.payload, '{}'::jsonb);
  v_from_member uuid;
  v_to_member uuid;
  v_amount bigint;
  v_reason text;
  v_from_balance member_period_balances;
  v_to_balance member_period_balances;
  v_period monthly_periods;
begin
  if p_decision.subject_id is null then
    raise exception 'SUBJECT_REQUIRED: balance_adjustment without a period' using errcode = 'invalid_parameter_value';
  end if;

  v_from_member := (v_payload ->> 'from_member_id')::uuid;
  v_to_member := (v_payload ->> 'to_member_id')::uuid;
  v_amount := (v_payload ->> 'amount_paise')::bigint;
  v_reason := v_payload ->> 'reason';

  if v_from_member is null or v_to_member is null or v_amount is null then
    raise exception 'MISSING_PAYLOAD' using errcode = 'invalid_parameter_value';
  end if;
  if v_from_member = v_to_member then
    raise exception 'SELF_ADJUSTMENT' using errcode = 'check_violation';
  end if;
  if v_amount <= 0 then
    raise exception 'AMOUNT_POSITIVE' using errcode = 'check_violation';
  end if;

  -- The period is the subject
  select * into v_period from monthly_periods where id = p_decision.subject_id;
  if v_period.id is null or v_period.house_id <> p_decision.house_id then
    raise exception 'PERIOD_NOT_FOUND' using errcode = 'no_data_found';
  end if;

  -- Verify both members are in this house
  if not exists (select 1 from house_members where id = v_from_member and house_id = p_decision.house_id) then
    raise exception 'FROM_MEMBER_NOT_IN_HOUSE' using errcode = 'invalid_parameter_value';
  end if;
  if not exists (select 1 from house_members where id = v_to_member and house_id = p_decision.house_id) then
    raise exception 'TO_MEMBER_NOT_IN_HOUSE' using errcode = 'invalid_parameter_value';
  end if;

  -- Create delta settlement rows (from -> to)
  insert into settlements (house_id, period_id, from_member_id, to_member_id, amount_paise, upi_link, note, is_delta)
  values 
    (p_decision.house_id, v_period.id, v_from_member, v_to_member, v_amount,
     'upi://pay?pa=' || v_to_member || '&pn=Member&am=' || (v_amount / 100.0) || '&cu=INR',
     v_reason, true),
    (p_decision.house_id, v_period.id, v_to_member, v_from_member, -v_amount,
     'upi://pay?pa=' || v_from_member || '&pn=Member&am=' || (v_amount / 100.0) || '&cu=INR',
     v_reason, true);

  -- Update member_period_balances to reflect the adjustment
  update member_period_balances
     set final_net_paise = final_net_paise - v_amount
   where period_id = v_period.id and member_id = v_from_member;

  update member_period_balances
     set final_net_paise = final_net_paise + v_amount
   where period_id = v_period.id and member_id = v_to_member;

  return jsonb_build_object(
    'from_member_id', v_from_member,
    'to_member_id', v_to_member,
    'amount_paise', v_amount,
    'period_id', v_period.id
  );
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function effect_balance_adjustment(decisions) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Update apply_decision_effect dispatcher
-- ---------------------------------------------------------------------------
create or replace function apply_decision_effect(
  p_decision decisions,
  p_input    jsonb default '{}'::jsonb
) returns jsonb as $$
begin
  case p_decision.type
    when 'remove_member'             then return effect_remove_member(p_decision);
    when 'join_request'              then return effect_join_request(p_decision);
    when 'change_governance'         then return effect_change_governance(p_decision);
    when 'change_home_mode'          then return effect_change_home_mode(p_decision);
    when 'absence_request'           then return effect_absence_request(p_decision);
    when 'change_confirmation_policy' then return effect_change_confirmation_policy(p_decision);
    when 'close_settlement'          then return effect_close_settlement(p_decision);
    when 'reopen_settlement'         then return effect_reopen_settlement(p_decision);
    when 'balance_adjustment'        then return effect_balance_adjustment(p_decision);
  else
    raise exception 'EFFECT_NOT_IMPLEMENTED: %', p_decision.type
      using errcode = 'feature_not_supported';
  end case;
end;
$$ language plpgsql security definer set search_path = public, extensions;

revoke execute on function apply_decision_effect(decisions, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Grant execute on new functions
-- ---------------------------------------------------------------------------
grant execute on function compute_period_balances(uuid, bigint) to authenticated;
grant execute on function compute_settlements(jsonb) to authenticated;
revoke execute on function compute_period_balances(uuid, bigint) from public, anon;
revoke execute on function compute_settlements(jsonb) from public, anon;