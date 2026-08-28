-- 072 — Expected contributions and the reserve, as the database spec states them
--
-- Source: docs/04-DATABASE.md section 6 (tables and guarantee 12),
-- docs/06-ALGORITHMS.md section 6.5, docs/09-BUSINESS-RULES.md BR-280 to BR-288,
-- docs/01-BRD.md EX-13 and EX-14, docs/07-ROADMAP.md phase 11 slice 6.
--
-- ---------------------------------------------------------------------------
-- Why this file replaces what migration 060 built
-- ---------------------------------------------------------------------------
-- 060 created three tables of the right names and the wrong shapes, and the
-- differences are not cosmetic:
--
--   * `member_expected_contributions` was keyed on a period and carried no
--     `decision_id`. BR-281 says an expected contribution is only ever set by a
--     decision, and 060 shipped a policy letting any lead write the table
--     directly — the exact bypass the rule exists to close. The specification's
--     shape is a dated range per member with the deciding decision on the row,
--     so "what were we expecting of Amma in July, and who agreed it" is a
--     question the table can answer.
--
--   * `reserves` allowed one pot per Home and no name. EX-14 is "a named pot",
--     plural by construction: rent float and repairs are not one pot.
--
--   * `reserve_movements` carried a signed amount and a stored `balance_after`,
--     with nothing maintaining either. BR-283 makes the balance a function of
--     the movements; a running total written by whoever inserted last is a
--     second answer to the same question. The specification's trigger keeps the
--     balance and refuses an over-draw under `for update`, which is the only
--     place that check is safe: a decision approved on Tuesday can be applied
--     on Friday, after another draw has emptied the pot.
--
--   * Nothing ever funded a reserve, so no draw could ever have succeeded.
--
-- 060 is left on disk and unedited. It is applied to the local stack, and the
-- corrections belong in a migration of their own rather than in a rewrite of a
-- file that has already run — the same reasoning that kept 071 out of 059.
--
-- ---------------------------------------------------------------------------
-- The invariant, and a note about its sign
-- ---------------------------------------------------------------------------
-- BR-288 states `Σ variance(m) + reserve_balance = 0`. Taken with BR-284 (a
-- contribution raises the contributor's `paid`) and §6.5's `variance(m) =
-- paid(m) − fair_share(m)`, that expression cannot be zero: a Home whose only
-- movement is one ₹5,000 contribution has `Σ variance = +5000` and
-- `reserve_balance = +5000`.
--
-- What is conserved, and what `lib/domain/settlement/position.ts` property-tests,
-- is the same statement with the pot's *position* rather than its cash:
--
--     Σ variance(m) + reserve_position = 0,  reserve_position = −Σ contributions
--
-- A draw does not move the pot's position, because a draw spends the pot's cash
-- and relieves the members of the same cost in one movement: the expense it pays
-- leaves both `paid` and `fair_share` (BR-285), so no member's position moves at
-- all. The pot's *cash* balance is `Σ contributions − Σ draws`, which is what
-- BR-283 defines and what this schema stores.
--
-- Flagged for the documentation, which this track does not own.

-- ---------------------------------------------------------------------------
-- Out with the wrong shapes
-- ---------------------------------------------------------------------------
drop function if exists distribute_reserve_draw(uuid, bigint);
drop function if exists effect_set_expected_contribution(decisions);
drop function if exists effect_create_reserve(decisions);
drop function if exists effect_reserve_draw(decisions);

drop table if exists reserve_movements;
drop table if exists reserves;
drop table if exists member_expected_contributions;

-- ---------------------------------------------------------------------------
-- member_expected_contributions — EX-13, display-only
-- ---------------------------------------------------------------------------
-- It charges nobody and enters no split (BR-280). It exists so that a member
-- can see expected against actual, which is the difference between a ledger and
-- a position.
create table member_expected_contributions (
  id             uuid primary key default gen_random_uuid(),
  house_id       uuid not null references houses(id) on delete cascade,
  member_id      uuid not null references house_members(id) on delete cascade,
  amount_paise   bigint not null check (amount_paise >= 0),
  effective_from date not null,
  -- Null while current. A change closes the standing row and opens a new one,
  -- so July's expectation survives August's decision to raise it.
  effective_to   date,
  -- BR-281: never set directly. Not nullable, so there is no row this schema
  -- admits that no decision authorised.
  decision_id    uuid not null references decisions(id),
  created_at     timestamptz not null default now(),

  check (effective_to is null or effective_to > effective_from)
);

-- One standing expectation per member. Two would make "what is expected of me"
-- ambiguous, which is the one thing a display-only figure must not be.
create unique index idx_expected_contribution_current
  on member_expected_contributions(member_id)
  where effective_to is null;

create index idx_expected_contribution_house on member_expected_contributions(house_id);

alter table member_expected_contributions enable row level security;

-- Read by the Home, written by nobody. `effect_set_expected_contribution` is
-- the only writer and it is `security definer`; a write policy here would be
-- the direct-edit route BR-281 forbids.
create policy read_expected_contributions on member_expected_contributions
  for select using (is_house_member(house_id));

grant select, insert, update, delete on member_expected_contributions
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- reserves — EX-14, a named pot with a running balance
-- ---------------------------------------------------------------------------
create table reserves (
  id            uuid primary key default gen_random_uuid(),
  house_id      uuid not null references houses(id) on delete cascade,
  name          text not null,
  -- BR-283. Maintained by `apply_reserve_movement`, never written directly.
  balance_paise bigint not null default 0 check (balance_paise >= 0),
  -- BR-287: creation is governed.
  decision_id   uuid not null references decisions(id),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),

  unique (house_id, name)
);

alter table reserves enable row level security;

create policy read_reserves on reserves
  for select using (is_house_member(house_id));

grant select, insert, update, delete on reserves
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- reserve_movements — the two kinds of movement, and nothing else
-- ---------------------------------------------------------------------------
create table reserve_movements (
  id           uuid primary key default gen_random_uuid(),
  house_id     uuid not null references houses(id) on delete cascade,
  reserve_id   uuid not null references reserves(id) on delete cascade,
  kind         text not null check (kind in ('contribution', 'draw')),
  -- Always positive. The kind carries the direction, the way `settlements`
  -- carries it in two member columns rather than in a sign.
  amount_paise bigint not null check (amount_paise > 0),
  -- The contributor, on a contribution.
  member_id    uuid references house_members(id),
  -- The cost paid, on a draw.
  expense_id   uuid references expenses(id),
  decision_id  uuid references decisions(id),
  period_id    uuid references monthly_periods(id),
  note         text,
  created_at   timestamptz not null default now(),

  -- BR-284: a contribution names its member.
  check (kind <> 'contribution' or member_id is not null),
  -- BR-285 and BR-287: a draw names the expense it pays and the decision that
  -- authorised it. A draw with a null `decision_id` is refused here rather than
  -- in a route handler, because a route handler can be bypassed.
  check (kind <> 'draw' or (expense_id is not null and decision_id is not null))
);

create index idx_reserve_movements_reserve on reserve_movements(reserve_id, created_at);
create index idx_reserve_movements_house   on reserve_movements(house_id, created_at desc);

alter table reserve_movements enable row level security;

create policy read_reserve_movements on reserve_movements
  for select using (is_house_member(house_id));

-- A contribution is an ordinary recorded movement, not a decision (EX-14), so
-- unlike a draw it has a write policy — and it is narrow: a member may record
-- money they themselves put in, into a reserve of their own Home, and nothing
-- else. Draws are absent from this policy on purpose; they arrive through
-- `effect_reserve_draw`.
create policy member_contributes_to_reserve on reserve_movements
  for insert with check (
    kind = 'contribution'
    and decision_id is null
    and is_house_member(house_id)
    and member_id = (current_member(house_id)).id
    and exists (
      select 1 from reserves r
       where r.id = reserve_movements.reserve_id
         and r.house_id = reserve_movements.house_id
         and r.active
    )
  );

grant select, insert, update, delete on reserve_movements
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The balance is a function of the movements — docs/04-DATABASE.md guarantee 12
-- ---------------------------------------------------------------------------
create or replace function apply_reserve_movement() returns trigger as $$
declare
  v_balance bigint;
begin
  select balance_paise into v_balance from reserves where id = new.reserve_id for update;
  if v_balance is null then
    raise exception 'RESERVE_NOT_FOUND: %', new.reserve_id using errcode = 'no_data_found';
  end if;

  -- Re-checked here, under the lock, as well as at proposal time: a decision
  -- approved days ago can be applied after another draw has emptied the pot.
  if new.kind = 'draw' and new.amount_paise > v_balance then
    raise exception 'INSUFFICIENT_RESERVE: % holds % and the draw is for %',
      new.reserve_id, v_balance, new.amount_paise
      using errcode = 'check_violation';
  end if;

  update reserves
     set balance_paise = balance_paise
         + case when new.kind = 'contribution' then new.amount_paise
                else -new.amount_paise end
   where id = new.reserve_id;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function apply_reserve_movement() from public, anon, authenticated;

create trigger trg_reserve_movement
  after insert on reserve_movements
  for each row execute function apply_reserve_movement();

-- ---------------------------------------------------------------------------
-- An expense the pot paid for
-- ---------------------------------------------------------------------------
-- BR-285. The draw pays a specific approved expense, and that expense's split
-- is attributed to the reserve instead of to the members. The column is how
-- every reader — the position view, the settlement, the split calculator —
-- knows to leave it out of both `paid` and `fair_share`.
alter table expenses
  add column if not exists reserve_id uuid references reserves(id);

create index if not exists idx_expenses_reserve on expenses(reserve_id)
  where reserve_id is not null;

-- The exact-sum invariant, with one case added rather than relaxed: an expense
-- the pot paid has no member shares at all, and zero rows summing to zero is
-- the correct total for it. Every other expense is held to the rule exactly as
-- before (BR-092, NFR-08).
create or replace function assert_split_sum() returns trigger as $$
declare
  v_expense_id uuid := coalesce(new.expense_id, old.expense_id);
  v_total   bigint;
  v_amount  bigint;
  v_reserve uuid;
begin
  select amount_paise, reserve_id into v_amount, v_reserve
    from expenses where id = v_expense_id;
  if v_amount is null then
    return null;                        -- the expense went with its splits
  end if;

  select coalesce(sum(share_paise + guest_share_paise + dependent_share_paise), 0)
    into v_total from expense_splits where expense_id = v_expense_id;

  if v_reserve is not null then
    if v_total <> 0 then
      raise exception 'expense % is paid from a reserve and cannot carry member shares',
        v_expense_id;
    end if;
    return null;
  end if;

  if v_total <> v_amount then
    raise exception 'split total % does not equal expense amount % for expense %',
      v_total, v_amount, v_expense_id;
  end if;
  return null;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- effect_set_expected_contribution — EX-13, BR-281
-- ---------------------------------------------------------------------------
-- Payload: { member_id, amount_paise, effective_from? }
-- A zero amount closes the standing expectation and opens nothing.
create or replace function effect_set_expected_contribution(p_decision decisions)
returns jsonb as $$
declare
  v_payload jsonb := coalesce(p_decision.payload, '{}'::jsonb);
  v_member  uuid;
  v_amount  bigint;
  v_from    date;
  v_id      uuid;
begin
  v_member := (v_payload ->> 'member_id')::uuid;
  v_amount := (v_payload ->> 'amount_paise')::bigint;
  v_from   := coalesce(
    (v_payload ->> 'effective_from')::date,
    (now() at time zone (select timezone from houses where id = p_decision.house_id))::date
  );

  if v_member is null or v_amount is null then
    raise exception 'MISSING_PAYLOAD' using errcode = 'invalid_parameter_value';
  end if;
  if v_amount < 0 then
    raise exception 'AMOUNT_NONNEG' using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from house_members
     where id = v_member and house_id = p_decision.house_id and status = 'active'
  ) then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'invalid_parameter_value';
  end if;

  -- The standing row is closed rather than overwritten. What the Home expected
  -- of somebody in July is part of July, and a decision to change it in August
  -- is not a decision to rewrite July.
  update member_expected_contributions
     set effective_to = greatest(v_from, effective_from + 1)
   where member_id = v_member and effective_to is null;

  if v_amount = 0 then
    return jsonb_build_object('member_id', v_member, 'cleared', true);
  end if;

  insert into member_expected_contributions (
    house_id, member_id, amount_paise, effective_from, decision_id
  ) values (
    p_decision.house_id, v_member, v_amount, v_from, p_decision.id
  ) returning id into v_id;

  return jsonb_build_object(
    'expectation_id', v_id,
    'member_id',      v_member,
    'amount_paise',   v_amount,
    'effective_from', v_from
  );
end;
$$ language plpgsql security definer set search_path = public, extensions;

revoke execute on function effect_set_expected_contribution(decisions)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- effect_create_reserve — EX-14, BR-287
-- ---------------------------------------------------------------------------
-- Payload: { name }. The pot starts empty; contributions fund it.
create or replace function effect_create_reserve(p_decision decisions)
returns jsonb as $$
declare
  v_payload jsonb := coalesce(p_decision.payload, '{}'::jsonb);
  v_name    text;
  v_reserve reserves;
begin
  v_name := nullif(btrim(coalesce(v_payload ->> 'name', '')), '');
  if v_name is null then
    raise exception 'NAME_REQUIRED' using errcode = 'invalid_parameter_value';
  end if;
  if exists (
    select 1 from reserves where house_id = p_decision.house_id and name = v_name
  ) then
    raise exception 'RESERVE_EXISTS: %', v_name using errcode = 'check_violation';
  end if;

  insert into reserves (house_id, name, decision_id)
  values (p_decision.house_id, v_name, p_decision.id)
  returning * into v_reserve;

  return jsonb_build_object(
    'reserve_id',    v_reserve.id,
    'name',          v_reserve.name,
    'balance_paise', v_reserve.balance_paise
  );
end;
$$ language plpgsql security definer set search_path = public, extensions;

revoke execute on function effect_create_reserve(decisions)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- effect_reserve_draw — EX-14, BR-285, BR-286, BR-287
-- ---------------------------------------------------------------------------
-- Payload: { reserve_id, expense_id, note? }
--
-- The amount is the expense's own amount and is not taken from the payload: a
-- draw pays a specific cost, and a payload that could disagree with it would be
-- a second answer to "how much did this cost".
create or replace function effect_reserve_draw(p_decision decisions)
returns jsonb as $$
declare
  v_payload jsonb := coalesce(p_decision.payload, '{}'::jsonb);
  v_reserve reserves;
  v_expense expenses;
  v_id      uuid;
begin
  select * into v_reserve
    from reserves
   where id = (v_payload ->> 'reserve_id')::uuid
     and house_id = p_decision.house_id;
  if v_reserve.id is null then
    raise exception 'RESERVE_NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if not v_reserve.active then
    raise exception 'RESERVE_INACTIVE' using errcode = 'check_violation';
  end if;

  select * into v_expense
    from expenses
   where id = (v_payload ->> 'expense_id')::uuid
     and house_id = p_decision.house_id;
  if v_expense.id is null then
    raise exception 'EXPENSE_NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if v_expense.status <> 'approved' then
    raise exception 'EXPENSE_NOT_APPROVED' using errcode = 'check_violation';
  end if;
  if v_expense.reserve_id is not null then
    raise exception 'EXPENSE_ALREADY_DRAWN' using errcode = 'check_violation';
  end if;

  -- Attributed to the pot before the shares go, so the exact-sum trigger sees a
  -- reserve-funded expense rather than a split set that has lost its rows.
  update expenses set reserve_id = v_reserve.id where id = v_expense.id;
  delete from expense_splits where expense_id = v_expense.id;

  -- The balance check and the balance itself both live in the trigger, under
  -- `for update`. Nothing here reads the balance and decides, because between
  -- the read and the write another draw could land.
  insert into reserve_movements (
    house_id, reserve_id, kind, amount_paise, expense_id, decision_id,
    period_id, note
  ) values (
    p_decision.house_id, v_reserve.id, 'draw', v_expense.amount_paise,
    v_expense.id, p_decision.id, v_expense.period_id, v_payload ->> 'note'
  ) returning id into v_id;

  return jsonb_build_object(
    'movement_id',   v_id,
    'reserve_id',    v_reserve.id,
    'expense_id',    v_expense.id,
    'amount_paise',  v_expense.amount_paise,
    'balance_paise', (select balance_paise from reserves where id = v_reserve.id)
  );
end;
$$ language plpgsql security definer set search_path = public, extensions;

revoke execute on function effect_reserve_draw(decisions)
  from public, anon, authenticated;
