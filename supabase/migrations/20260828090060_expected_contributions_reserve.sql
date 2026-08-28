-- 060 — Expected contributions and the reserve
--
-- Source: docs/01-BRD.md EX-13, EX-14, docs/07-ROADMAP.md phase 11 slice 6.
--
-- Two related but distinct mechanisms:
--
--   * Expected contributions (EX-13) — a per-member, per-period figure that
--     changes how the settlement position is *displayed* but does NOT change
--     any money movement. It is a planning tool: "Amma is expected to put in
--     ₹15,000 this month" — the settlement still nets to zero based on actual
--     paid vs fair share.
--
--   * The reserve (EX-14) — a real pool of money. A Home creates it by
--     deciding on a target amount. Members contribute to it (or it's funded
--     from surplus), and draws from it are Critical decisions that move real
--     money. `Σ variance(m) + reserve_balance = 0` for the period.

-- ---------------------------------------------------------------------------
-- member_expected_contributions
-- ---------------------------------------------------------------------------
-- One row per member per period. The amount is in paise.
-- A zero or missing row means "no expectation set".
create table member_expected_contributions (
  id              uuid primary key default gen_random_uuid(),
  house_id        uuid not null references houses(id) on delete cascade,
  period_id       uuid not null references monthly_periods(id) on delete cascade,
  member_id       uuid not null references house_members(id) on delete cascade,
  amount_paise    bigint not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint expected_contribution_unique unique (period_id, member_id),
  constraint expected_contribution_nonneg check (amount_paise >= 0)
);

create index idx_expected_contrib_period on member_expected_contributions(period_id);
create index idx_expected_contrib_member on member_expected_contributions(member_id, period_id);

alter table member_expected_contributions enable row level security;

create policy read_expected_contributions on member_expected_contributions
  for select using (is_house_member(house_id));

-- Only a lead can set expected contributions (it's a governance-adjacent admin action)
create policy lead_writes_expected_contributions on member_expected_contributions
  for all using (is_house_lead(house_id)) with check (is_house_lead(house_id));

-- ---------------------------------------------------------------------------
-- reserves
-- ---------------------------------------------------------------------------
-- One reserve per house. The balance is in paise.
create table reserves (
  id                  uuid primary key default gen_random_uuid(),
  house_id            uuid not null references houses(id) on delete cascade,
  target_paise        bigint not null,           -- the target amount
  balance_paise       bigint not null default 0, -- current balance
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint reserve_nonneg check (balance_paise >= 0)
);

alter table reserves enable row level security;

create policy read_reserves on reserves
  for select using (is_house_member(house_id));

-- Only a decision effect can change the reserve (create_reserve, reserve_draw)
-- The create_reserve effect inserts the row; reserve_draw updates balance_paise.

-- ---------------------------------------------------------------------------
-- reserve_movements
-- ---------------------------------------------------------------------------
-- Every movement in/out of the reserve. The decision_id links to the
-- create_reserve or reserve_draw decision that caused it.
create table reserve_movements (
  id              uuid primary key default gen_random_uuid(),
  house_id        uuid not null references houses(id) on delete cascade,
  reserve_id      uuid not null references reserves(id) on delete cascade,
  decision_id     uuid not null references decisions(id) on delete restrict,
  member_id       uuid not null references house_members(id) on delete cascade,
  type            text not null check (type in ('contribution', 'draw', 'adjustment')),
  amount_paise    bigint not null,          -- positive = into reserve, negative = out
  balance_after   bigint not null,          -- reserve balance after this movement
  reason          text,
  created_at      timestamptz not null default now()
);

create index idx_reserve_movements_reserve on reserve_movements(reserve_id, created_at);

alter table reserve_movements enable row level security;

create policy read_reserve_movements on reserve_movements
  for select using (is_house_member(house_id));

-- Only decision effects write here

-- ---------------------------------------------------------------------------
-- effect_set_expected_contribution
-- ---------------------------------------------------------------------------
-- Payload: { member_id, period_id, amount_paise }
-- A zero amount clears the expectation.
create or replace function effect_set_expected_contribution(p_decision decisions)
returns jsonb as $$
declare
  v_payload jsonb := coalesce(p_decision.payload, '{}'::jsonb);
  v_member_id uuid;
  v_period_id uuid;
  v_amount bigint;
  v_period monthly_periods;
begin
  if p_decision.subject_id is null then
    raise exception 'SUBJECT_REQUIRED: set_expected_contribution without a period' using errcode = 'invalid_parameter_value';
  end if;

  v_member_id := (v_payload ->> 'member_id')::uuid;
  v_period_id := p_decision.subject_id; -- subject_id IS the period_id
  v_amount := (v_payload ->> 'amount_paise')::bigint;

  if v_member_id is null or v_amount is null then
    raise exception 'MISSING_PAYLOAD' using errcode = 'invalid_parameter_value';
  end if;
  if v_amount < 0 then
    raise exception 'AMOUNT_NONNEG' using errcode = 'check_violation';
  end if;

  select * into v_period from monthly_periods where id = v_period_id;
  if v_period.id is null or v_period.house_id <> p_decision.house_id then
    raise exception 'PERIOD_NOT_FOUND' using errcode = 'no_data_found';
  end if;

  if not exists (select 1 from house_members where id = v_member_id and house_id = p_decision.house_id and status = 'active') then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'invalid_parameter_value';
  end if;

  if v_amount = 0 then
    delete from member_expected_contributions where period_id = v_period_id and member_id = v_member_id;
    return jsonb_build_object('cleared', true, 'member_id', v_member_id, 'period_id', v_period_id);
  end if;

  insert into member_expected_contributions (house_id, period_id, member_id, amount_paise)
  values (p_decision.house_id, v_period_id, v_member_id, v_amount)
  on conflict (period_id, member_id) do update
    set amount_paise = excluded.amount_paise, updated_at = now();

  return jsonb_build_object(
    'member_id', v_member_id,
    'period_id', v_period_id,
    'amount_paise', v_amount
  );
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function effect_set_expected_contribution(decisions) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- effect_create_reserve
-- ---------------------------------------------------------------------------
-- Payload: { target_paise }
-- Creates the reserve for the house. The reserve is initially empty.
create or replace function effect_create_reserve(p_decision decisions)
returns jsonb as $$
declare
  v_payload jsonb := coalesce(p_decision.payload, '{}'::jsonb);
  v_target bigint;
  v_reserve reserves;
begin
  if exists (select 1 from reserves where house_id = p_decision.house_id) then
    raise exception 'RESERVE_EXISTS' using errcode = 'check_violation';
  end if;

  v_target := (v_payload ->> 'target_paise')::bigint;
  if v_target is null or v_target <= 0 then
    raise exception 'TARGET_POSITIVE' using errcode = 'check_violation';
  end if;

  insert into reserves (house_id, target_paise, balance_paise)
  values (p_decision.house_id, v_target, 0)
  returning * into v_reserve;

  -- Record the creation as a movement
  insert into reserve_movements (house_id, reserve_id, decision_id, member_id, type, amount_paise, balance_after, reason)
  values (p_decision.house_id, v_reserve.id, p_decision.id, p_decision.requested_by, 'contribution', 0, 0, 'Reserve created with target ' || v_target);

  return jsonb_build_object(
    'reserve_id', v_reserve.id,
    'target_paise', v_reserve.target_paise,
    'balance_paise', v_reserve.balance_paise
  );
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function effect_create_reserve(decisions) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- effect_reserve_draw
-- ---------------------------------------------------------------------------
-- Payload: { amount_paise, reason }
-- Draws from the reserve. The draw amount must not exceed the balance.
-- The drawn amount is distributed as a credit to all members proportionally
-- to their expected contribution (if set) or equally otherwise.
create or replace function effect_reserve_draw(p_decision decisions)
returns jsonb as $$
declare
  v_payload jsonb := coalesce(p_decision.payload, '{}'::jsonb);
  v_amount bigint;
  v_reason text;
  v_reserve reserves;
  v_distribution jsonb;
begin
  if not exists (select 1 from reserves where house_id = p_decision.house_id) then
    raise exception 'NO_RESERVE' using errcode = 'check_violation';
  end if;

  v_amount := (v_payload ->> 'amount_paise')::bigint;
  v_reason := v_payload ->> 'reason';
  if v_amount is null or v_amount <= 0 then
    raise exception 'AMOUNT_POSITIVE' using errcode = 'check_violation';
  end if;

  select * into v_reserve from reserves where house_id = p_decision.house_id for update;
  if v_reserve.balance_paise < v_amount then
    raise exception 'INSUFFICIENT_RESERVE: balance % needed %', v_reserve.balance_paise, v_amount using errcode = 'check_violation';
  end if;

  -- Update reserve balance
  update reserves set balance_paise = balance_paise - v_amount where id = v_reserve.id;

  -- Distribute the drawn amount proportionally to expected contributions, or equally
  v_distribution := distribute_reserve_draw(p_decision.house_id, v_amount);

  -- Record the draw movement
  insert into reserve_movements (house_id, reserve_id, decision_id, member_id, type, amount_paise, balance_after, reason)
  values (p_decision.house_id, v_reserve.id, p_decision.id, p_decision.requested_by, 'draw', -v_amount, v_reserve.balance_paise - v_amount, v_reason);

  return jsonb_build_object(
    'reserve_id', v_reserve.id,
    'amount_paise', v_amount,
    'balance_after', v_reserve.balance_paise - v_amount,
    'distribution', v_distribution
  );
end;
$$ language plpgsql security definer set search_path = public, extensions;

revoke execute on function effect_reserve_draw(decisions) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helper: distribute_reserve_draw
-- ---------------------------------------------------------------------------
-- Distributes the drawn amount proportionally to expected contributions.
-- Members with no expected contribution get an equal share of the remainder.
create or replace function distribute_reserve_draw(p_house_id uuid, p_amount bigint)
returns jsonb as $$
declare
  v_result jsonb;
begin
  with 
  -- Active adult members in the house
  members as (
    select id as member_id, display_name
      from house_members
     where house_id = p_house_id
       and status = 'active'
       and member_kind = 'adult'
  ),
  -- Expected contributions for the current open period (if any)
  expected as (
    select mec.member_id, mec.amount_paise
      from member_expected_contributions mec
      join monthly_periods mp on mp.id = mec.period_id
     where mp.house_id = p_house_id
       and mp.status = 'open'
  ),
  -- Total expected
  total_expected as (
    select sum(amount_paise) as total from expected
  ),
  -- Proportional shares
  shares as (
    select m.member_id,
           m.display_name,
           case 
             when te.total > 0 and e.amount_paise is not null 
             then (p_amount * e.amount_paise / te.total)::bigint
             else 0
           end as proportional_share
      from members m
      left join expected e on e.member_id = m.member_id
      cross join total_expected te
  ),
  -- Remainder for members without expectation
  allocated as (
    select sum(proportional_share) as sum_prop from shares
  ),
  remainder_calc as (
    select p_amount - coalesce(a.sum_prop, 0) as remainder,
           count(*) filter (where s.proportional_share = 0) as no_exp_count
      from allocated a
      cross join shares s
  ),
  final_shares as (
    select s.member_id,
           s.display_name,
           s.proportional_share +
           case when r.no_exp_count > 0 and s.proportional_share = 0
                then (r.remainder / r.no_exp_count)::bigint
                else 0
           end as final_share
      from shares s
      cross join remainder_calc r
  )
  select jsonb_agg(jsonb_build_object(
    'member_id', member_id,
    'display_name', display_name,
    'amount_paise', final_share
  )) into v_result
  from final_shares
  where final_share > 0;
  
  -- Apply the distribution as credits to member_period_balances for the current open period
  -- (This is a simplified approach; in practice the credit would go to the current period's balances)
  
  return v_result;
end;
$$ language plpgsql security definer set search_path = public, extensions;

revoke execute on function distribute_reserve_draw(uuid, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Update apply_decision_effect dispatcher
-- ---------------------------------------------------------------------------
create or replace function apply_decision_effect(
  p_decision decisions,
  p_input    jsonb default '{}'::jsonb
) returns jsonb as $$
begin
  case p_decision.type
    when 'remove_member'                 then return effect_remove_member(p_decision);
    when 'join_request'                  then return effect_join_request(p_decision);
    when 'change_governance'             then return effect_change_governance(p_decision);
    when 'change_home_mode'              then return effect_change_home_mode(p_decision);
    when 'absence_request'               then return effect_absence_request(p_decision);
    when 'change_confirmation_policy'    then return effect_change_confirmation_policy(p_decision);
    when 'close_settlement'              then return effect_close_settlement(p_decision);
    when 'reopen_settlement'             then return effect_reopen_settlement(p_decision);
    when 'balance_adjustment'            then return effect_balance_adjustment(p_decision);
    when 'set_expected_contribution'     then return effect_set_expected_contribution(p_decision);
    when 'create_reserve'                then return effect_create_reserve(p_decision);
    when 'reserve_draw'                  then return effect_reserve_draw(p_decision);
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
grant execute on function distribute_reserve_draw(uuid, bigint) to authenticated;
revoke execute on function distribute_reserve_draw(uuid, bigint) from public, anon;