-- 071 — The governed close, the governed reopen, and `balance_adjustments`
--
-- Source: docs/14-GOVERNANCE-SPEC.md section 3.3, docs/07-ROADMAP.md phase 11
-- slice 5, docs/09-BUSINESS-RULES.md BR-107, BR-108, BR-112, BR-113.
--
-- ---------------------------------------------------------------------------
-- Why this file exists beside migration 059
-- ---------------------------------------------------------------------------
-- 059 landed one-argument effects — `effect_close_settlement(decisions)` and
-- friends — that recompute the month's arithmetic in SQL at apply time. The
-- roadmap asks for the opposite arrangement, and for a reason worth restating:
-- the netting is proved by property test in `lib/domain/settlement/netting.ts`,
-- and a second, untested restatement of it in PL/pgSQL is a second answer to
-- the same question. Two answers to "what does everybody owe" is exactly the
-- failure the settlement invariant exists to prevent.
--
-- So the numbers arrive through `p_input`, computed by the one implementation
-- that is tested, and this file's job is to *check* them rather than to derive
-- them. Every guard 033's `close_period` applied is applied here too, plus one
-- it never needed: that the settlement rows reconcile against the balances
-- member by member. A caller supplying apply-time numbers can supply
-- inconsistent ones; a caller that computed them in the same transaction could
-- not.
--
-- Nothing in 059 is edited or dropped. The dispatcher installed by migration
-- 066 prefers the two-argument overload and falls back to the one-argument
-- form, so declaring `(decisions, jsonb)` here takes precedence by the rule the
-- dispatcher already documents — a pure addition, no shared mutable list.
--
-- ---------------------------------------------------------------------------
-- balance_adjustments
-- ---------------------------------------------------------------------------
-- A manual correction between two members of a settled month: somebody paid
-- cash outside the app, somebody was charged for a guest who never came. It is
-- a Critical decision (matrix.ts) answered by both of the people whose money
-- moves, and this table is the record that it happened — the decision says what
-- was asked, this row says what was done to the balances.
--
-- It is deliberately its own table rather than an extra settlement row with a
-- flag. A settlement is a payment somebody still has to make; an adjustment is
-- a restatement of what was owed in the first place. Collapsing the two loses
-- the ability to answer "why does August not match what August said in
-- September", which is the only question anybody asks about an adjustment.
create table balance_adjustments (
  id             uuid primary key default gen_random_uuid(),
  house_id       uuid not null references houses(id) on delete cascade,
  period_id      uuid not null references monthly_periods(id) on delete cascade,

  -- The authority for the change. `restrict` rather than `cascade`: deleting a
  -- decision must not silently delete the money it moved.
  decision_id    uuid not null references decisions(id) on delete restrict,

  from_member_id uuid not null references house_members(id) on delete cascade,
  to_member_id   uuid not null references house_members(id) on delete cascade,

  -- BR-108's rule, restated: always positive, direction carried by the two
  -- member columns and never by a sign.
  amount_paise   bigint not null check (amount_paise > 0),
  reason         text,
  created_at     timestamptz not null default now(),

  constraint balance_adjustment_two_parties check (from_member_id <> to_member_id),

  -- One decision, one adjustment. `apply_decision` is idempotent by status, and
  -- this is the same guarantee stated where it cannot be reasoned around.
  constraint balance_adjustment_one_per_decision unique (decision_id)
);

create index idx_balance_adjustments_period on balance_adjustments(period_id);
create index idx_balance_adjustments_house  on balance_adjustments(house_id, created_at desc);

alter table balance_adjustments enable row level security;

-- Everybody in the Home reads every adjustment, and nobody writes one. The
-- transparency is the point: an adjustment only one party can see is an
-- assertion, not a correction. The absent write policy is not an omission —
-- `effect_balance_adjustment` is the sole writer, and it is `security definer`,
-- so a policy for `authenticated` would only ever widen the hole.
create policy read_balance_adjustments on balance_adjustments
  for select using (is_house_member(house_id));

grant select, insert, update, delete on balance_adjustments
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- effect_close_settlement(decisions, jsonb)
-- ---------------------------------------------------------------------------
-- p_input:
--   { "balances":    [ { member_id, total_paid_paise, fair_share_paise,
--                        expense_net_paise, penalty_owed_paise,
--                        penalty_credit_paise, final_net_paise } ],
--     "settlements": [ { from_member_id, to_member_id, amount_paise, upi_link } ],
--     "penalties":   [ { member_id, deficit_points, surplus_points, rate_paise,
--                        amount_owed_paise, amount_credited_paise } ] }
--
-- The subject of the decision is the period. `p_decision.payload` records what
-- was proposed — the period label and whether the close was a shadow run — and
-- is never read for money.
create or replace function effect_close_settlement(
  p_decision decisions,
  p_input    jsonb
) returns jsonb as $$
declare
  v_period      monthly_periods;
  v_balances    jsonb := coalesce(p_input -> 'balances', '[]'::jsonb);
  v_settlements jsonb := coalesce(p_input -> 'settlements', '[]'::jsonb);
  v_penalties   jsonb := coalesce(p_input -> 'penalties', '[]'::jsonb);
  v_pending     integer;
  v_month_end   boolean;
  v_sum         bigint;
  v_owed        bigint;
  v_credited    bigint;
  v_total       bigint;
  v_stranger    uuid;
  v_unreconciled uuid;
begin
  if p_decision.subject_id is null then
    raise exception 'SUBJECT_REQUIRED: close_settlement without a period'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_period from monthly_periods where id = p_decision.subject_id;
  if v_period.id is null then
    raise exception 'PERIOD_NOT_FOUND: %', p_decision.subject_id
      using errcode = 'no_data_found';
  end if;
  if v_period.house_id <> p_decision.house_id then
    raise exception 'PERIOD_WRONG_HOUSE' using errcode = 'invalid_parameter_value';
  end if;
  if v_period.status = 'closed' then
    raise exception 'PERIOD_CLOSED' using errcode = 'check_violation';
  end if;

  -- A close with no balances is a close of nothing. It would pass every sum
  -- check below trivially — zero nets to zero — and leave the Home looking at a
  -- month marked `closing` with nobody owing anybody anything.
  if jsonb_array_length(v_balances) = 0 then
    raise exception 'BALANCES_REQUIRED' using errcode = 'invalid_parameter_value';
  end if;

  -- BR-102 — nothing may be pending. Checked again at apply time rather than
  -- at proposal time, because an expense can be raised while the Home is still
  -- answering.
  select count(*) into v_pending from expenses
   where period_id = v_period.id and status = 'pending_approval';
  if v_pending > 0 then
    raise exception 'APPROVALS_PENDING' using errcode = 'check_violation';
  end if;

  select month_ended into v_month_end from period_close_readiness(v_period.id);
  if not v_month_end then
    raise exception 'MONTH_NOT_ENDED' using errcode = 'check_violation';
  end if;

  -- Every member named in the input must belong to this Home. Without this, a
  -- caller holding the service-role key could net one Home's month against
  -- another Home's member, and every sum below would still balance.
  select (row ->> 'member_id')::uuid into v_stranger
    from jsonb_array_elements(v_balances) as row
   where not exists (
     select 1 from house_members hm
      where hm.id = (row ->> 'member_id')::uuid
        and hm.house_id = v_period.house_id
   )
   limit 1;
  if v_stranger is not null then
    raise exception 'MEMBER_NOT_IN_HOUSE: %', v_stranger
      using errcode = 'invalid_parameter_value';
  end if;

  -- BR-107 — the invariant, checked against what is about to be stored.
  select coalesce(sum((row ->> 'final_net_paise')::bigint), 0) into v_sum
    from jsonb_array_elements(v_balances) as row;
  if v_sum <> 0 then
    raise exception 'NETS_NONZERO: %', v_sum using errcode = 'check_violation';
  end if;

  -- A penalty moves money between members; it never creates or destroys any.
  select coalesce(sum((row ->> 'amount_owed_paise')::bigint), 0),
         coalesce(sum((row ->> 'amount_credited_paise')::bigint), 0)
    into v_owed, v_credited
    from jsonb_array_elements(v_penalties) as row;
  if v_owed <> v_credited then
    raise exception 'PENALTY_MISMATCH: owed % credited %', v_owed, v_credited
      using errcode = 'check_violation';
  end if;

  -- BR-108 — direction, never a sign.
  if exists (
    select 1 from jsonb_array_elements(v_settlements) as row
     where (row ->> 'amount_paise')::bigint <= 0
        or (row ->> 'from_member_id')::uuid = (row ->> 'to_member_id')::uuid
  ) then
    raise exception 'SETTLEMENT_NOT_POSITIVE' using errcode = 'check_violation';
  end if;

  -- The guard 033 did not need. The payments and the balances are two views of
  -- the same month, and if they disagree the Home is shown one number and asked
  -- to pay another. `checkSettlement` in netting.ts calls this `reconciles`.
  with moves as (
    select (row ->> 'to_member_id')::uuid   as member_id,
            (row ->> 'amount_paise')::bigint as delta
      from jsonb_array_elements(v_settlements) as row
    union all
    select (row ->> 'from_member_id')::uuid    as member_id,
           -(row ->> 'amount_paise')::bigint   as delta
      from jsonb_array_elements(v_settlements) as row
  ),
  stated as (
    select (row ->> 'member_id')::uuid        as member_id,
           (row ->> 'final_net_paise')::bigint as final_net
      from jsonb_array_elements(v_balances) as row
  )
  select s.member_id into v_unreconciled
    from stated s
    left join (select member_id, sum(delta) as moved from moves group by member_id) m
      on m.member_id = s.member_id
   where coalesce(m.moved, 0) <> s.final_net
   limit 1;
  if v_unreconciled is not null then
    raise exception 'SETTLEMENT_UNRECONCILED: %', v_unreconciled
      using errcode = 'check_violation';
  end if;

  -- A re-close after a reopen replaces what has not been paid and leaves what
  -- has. `status = 'pending'` is the whole of that rule.
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

  insert into chore_penalties (
    house_id, period_id, member_id, deficit_points, surplus_points,
    rate_paise, amount_owed_paise, amount_credited_paise
  )
  select v_period.house_id, v_period.id,
         (row ->> 'member_id')::uuid,
         coalesce((row ->> 'deficit_points')::int, 0),
         coalesce((row ->> 'surplus_points')::int, 0),
         coalesce((row ->> 'rate_paise')::bigint, 0),
         coalesce((row ->> 'amount_owed_paise')::bigint, 0),
         coalesce((row ->> 'amount_credited_paise')::bigint, 0)
    from jsonb_array_elements(v_penalties) as row;

  insert into settlements (house_id, period_id, from_member_id, to_member_id,
                           amount_paise, upi_link)
  select v_period.house_id, v_period.id,
         (row ->> 'from_member_id')::uuid,
         (row ->> 'to_member_id')::uuid,
         (row ->> 'amount_paise')::bigint,
         row ->> 'upi_link'
    from jsonb_array_elements(v_settlements) as row;

  select coalesce(sum(amount_paise), 0) into v_total
    from expenses where period_id = v_period.id and status = 'approved';

  -- 'closing', not 'closed'. The month locks only when the last settlement is
  -- confirmed received — the app never decides that a payment happened.
  update monthly_periods
     set status              = 'closing',
         total_expense_paise = v_total,
         closed_by           = p_decision.requested_by,
         closed_at           = now()
   where id = v_period.id;

  return jsonb_build_object(
    'period_id',           v_period.id,
    'period',              v_period.period,
    'status',              'closing',
    'member_count',        jsonb_array_length(v_balances),
    'settlement_count',    jsonb_array_length(v_settlements),
    'total_expense_paise', v_total
  );
end;
$$ language plpgsql security definer set search_path = public, extensions;

revoke execute on function effect_close_settlement(decisions, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- effect_reopen_settlement(decisions, jsonb)
-- ---------------------------------------------------------------------------
-- BR-112, BR-113. Reopening throws nothing away: the balances and the confirmed
-- settlements stay exactly where they are, and the next close issues deltas
-- against them. What changes is the status, the count, and the lock.
create or replace function effect_reopen_settlement(
  p_decision decisions,
  p_input    jsonb
) returns jsonb as $$
declare
  v_period monthly_periods;
  v_reason text;
begin
  if p_decision.subject_id is null then
    raise exception 'SUBJECT_REQUIRED: reopen_settlement without a period'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_period from monthly_periods where id = p_decision.subject_id;
  if v_period.id is null then
    raise exception 'PERIOD_NOT_FOUND: %', p_decision.subject_id
      using errcode = 'no_data_found';
  end if;
  if v_period.house_id <> p_decision.house_id then
    raise exception 'PERIOD_WRONG_HOUSE' using errcode = 'invalid_parameter_value';
  end if;
  if v_period.status = 'open' then
    raise exception 'PERIOD_ALREADY_OPEN' using errcode = 'check_violation';
  end if;

  -- BR-113 — every reopen carries a reason. The decision's own `reason` column
  -- is the first place to look, because a Critical decision cannot exist
  -- without one; the payload is read only for a reopen proposed some other way.
  v_reason := coalesce(
    nullif(btrim(coalesce(p_input ->> 'reason', '')), ''),
    nullif(btrim(coalesce(p_decision.payload ->> 'reason', '')), ''),
    nullif(btrim(coalesce(p_decision.reason, '')), '')
  );
  if v_reason is null then
    raise exception 'REASON_REQUIRED' using errcode = 'check_violation';
  end if;

  update monthly_periods
     set status       = 'reopened',
         reopen_count = reopen_count + 1,
         locked_at    = null
   where id = v_period.id;

  return jsonb_build_object(
    'period_id',    v_period.id,
    'period',       v_period.period,
    'status',       'reopened',
    'reopen_count', v_period.reopen_count + 1,
    'reason',       v_reason
  );
end;
$$ language plpgsql security definer set search_path = public, extensions;

revoke execute on function effect_reopen_settlement(decisions, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- effect_balance_adjustment(decisions, jsonb)
-- ---------------------------------------------------------------------------
-- Payload: { from_member_id, to_member_id, amount_paise, reason }
--
-- One row in `balance_adjustments`, two equal and opposite moves in
-- `member_period_balances`, and one delta settlement in the direction of the
-- money. Not two settlement rows: `settlements.amount_paise` carries a
-- `check (amount_paise > 0)` and direction is expressed by the member columns,
-- so a second, negated row cannot be written and would double the transfer if
-- it could.
create or replace function effect_balance_adjustment(
  p_decision decisions,
  p_input    jsonb
) returns jsonb as $$
declare
  v_payload jsonb := coalesce(p_decision.payload, '{}'::jsonb);
  v_from    uuid;
  v_to      uuid;
  v_amount  bigint;
  v_reason  text;
  v_period  monthly_periods;
  v_vpa     text;
  v_name    text;
  v_link    text;
  v_id      uuid;
begin
  if p_decision.subject_id is null then
    raise exception 'SUBJECT_REQUIRED: balance_adjustment without a period'
      using errcode = 'invalid_parameter_value';
  end if;

  -- The payload is what the Home answered. `p_input` may only fill a gap in it,
  -- never overwrite an answered field: an adjustment whose amount changed
  -- between the question and the answer is a different adjustment.
  v_from   := coalesce((v_payload ->> 'from_member_id')::uuid, (p_input ->> 'from_member_id')::uuid);
  v_to     := coalesce((v_payload ->> 'to_member_id')::uuid,   (p_input ->> 'to_member_id')::uuid);
  v_amount := coalesce((v_payload ->> 'amount_paise')::bigint, (p_input ->> 'amount_paise')::bigint);
  v_reason := coalesce(
    nullif(btrim(coalesce(v_payload ->> 'reason', '')), ''),
    nullif(btrim(coalesce(p_decision.reason, '')), '')
  );

  if v_from is null or v_to is null or v_amount is null then
    raise exception 'MISSING_PAYLOAD' using errcode = 'invalid_parameter_value';
  end if;
  if v_from = v_to then
    raise exception 'SELF_ADJUSTMENT' using errcode = 'check_violation';
  end if;
  if v_amount <= 0 then
    raise exception 'AMOUNT_POSITIVE' using errcode = 'check_violation';
  end if;

  select * into v_period from monthly_periods where id = p_decision.subject_id;
  if v_period.id is null or v_period.house_id <> p_decision.house_id then
    raise exception 'PERIOD_NOT_FOUND' using errcode = 'no_data_found';
  end if;

  if not exists (select 1 from house_members
                  where id = v_from and house_id = p_decision.house_id) then
    raise exception 'FROM_MEMBER_NOT_IN_HOUSE' using errcode = 'invalid_parameter_value';
  end if;
  if not exists (select 1 from house_members
                  where id = v_to and house_id = p_decision.house_id) then
    raise exception 'TO_MEMBER_NOT_IN_HOUSE' using errcode = 'invalid_parameter_value';
  end if;

  -- An adjustment adjusts something. A month with no stored balances has
  -- nothing to correct, and shifting a row that is not there would leave the
  -- two halves of the transfer unequal — the one case where this effect could
  -- break BR-107 rather than preserve it.
  if not exists (select 1 from member_period_balances
                  where period_id = v_period.id and member_id = v_from)
     or not exists (select 1 from member_period_balances
                     where period_id = v_period.id and member_id = v_to) then
    raise exception 'PERIOD_NOT_SETTLED' using errcode = 'check_violation';
  end if;

  insert into balance_adjustments (
    house_id, period_id, decision_id, from_member_id, to_member_id,
    amount_paise, reason
  ) values (
    p_decision.house_id, v_period.id, p_decision.id, v_from, v_to,
    v_amount, v_reason
  ) returning id into v_id;

  update member_period_balances
     set final_net_paise = final_net_paise - v_amount
   where period_id = v_period.id and member_id = v_from;

  update member_period_balances
     set final_net_paise = final_net_paise + v_amount
   where period_id = v_period.id and member_id = v_to;

  -- The link the payer taps, built from the payee's own VPA. 059 built one from
  -- the payee's member uuid, which is a well-formed link to an address that
  -- does not exist; a missing link is honest and a wrong one is not.
  select u.upi_vpa, u.display_name into v_vpa, v_name
    from house_members hm join users u on u.id = hm.user_id
   where hm.id = v_to;

  if v_vpa is not null then
    v_link := 'upi://pay?pa=' || v_vpa
           || '&pn=' || replace(coalesce(v_name, 'Housemate'), ' ', '%20')
           || '&am=' || to_char(v_amount / 100.0, 'FM999999999990.00')
           || '&cu=INR';
  end if;

  insert into settlements (house_id, period_id, from_member_id, to_member_id,
                           amount_paise, upi_link, note, is_delta)
  values (p_decision.house_id, v_period.id, v_from, v_to,
          v_amount, v_link, v_reason, true);

  return jsonb_build_object(
    'adjustment_id',  v_id,
    'period_id',      v_period.id,
    'from_member_id', v_from,
    'to_member_id',   v_to,
    'amount_paise',   v_amount,
    'reason',         v_reason
  );
end;
$$ language plpgsql security definer set search_path = public, extensions;

revoke execute on function effect_balance_adjustment(decisions, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- decision_action_phrase — the fifteenth arm
-- ---------------------------------------------------------------------------
-- Migration 058 added `change_confirmation_policy` to the enum and stopped
-- there, so a Home that proposes one gets `{proposer} wants to ` with nothing
-- after it. The phrase cannot be added to 055, where the rest of the map lives:
-- 055 runs before 058 does, and a plain SQL function's body is validated when it
-- is created, so a literal for an enum value that does not exist yet refuses to
-- compile. Restated whole here instead, which is also what D-19 asks for.
--
-- `lib/types/domain.ts` holds the same map for the client, and
-- `tests/unit/governance-notifications.test.ts` reads the last restatement of
-- this function out of the migrations and fails if the two ever differ.
create or replace function decision_action_phrase(p_type decision_type)
returns text as $$
  select case p_type
    when 'close_settlement'            then 'close the month'
    when 'reopen_settlement'           then 'reopen a closed month'
    when 'remove_member'               then 'remove a member'
    when 'change_rule'                 then 'change a house rule'
    when 'change_governance'           then 'change how decisions are made'
    when 'change_home_mode'            then 'change how the home works'
    when 'change_confirmation_policy'  then 'change how chores are confirmed'
    when 'balance_adjustment'          then 'adjust a balance'
    when 'absence_request'             then 'take time away'
    when 'join_request'                then 'let somebody join'
    when 'expense_approval'            then 'approve an expense'
    when 'chore_confirmation'          then 'confirm a chore'
    when 'set_expected_contribution'   then 'set an expected contribution'
    when 'create_reserve'              then 'start a reserve'
    when 'reserve_draw'                then 'draw from the reserve'
  end;
$$ language sql immutable;
