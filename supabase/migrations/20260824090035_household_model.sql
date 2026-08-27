-- 035 — Household shape: columns, dependents, and the two money modes
--
-- Every default below reproduces today's behaviour exactly, so an existing
-- house wakes up unchanged: household_type 'shared', money_mode 'split',
-- effort_mode 'points', penalty_enabled true, every member an adult who shares
-- cost and does chores.

-- ---------------------------------------------------------------------------
-- The house
-- ---------------------------------------------------------------------------
alter table houses
  add column household_type household_type not null default 'shared';

alter table house_settings
  add column money_mode         money_mode  not null default 'split',
  add column effort_mode        effort_mode not null default 'points',
  -- Separate from effort_mode on purpose. A shared flat may want the full
  -- leaderboard and still decide not to charge for deficit in its first month,
  -- and a family may want points visible with no money attached ever. The two
  -- questions are genuinely independent, and folding them into one enum would
  -- force houses to answer the wrong one.
  add column penalty_enabled    boolean     not null default true,
  -- What the house means to spend in a day, for the daily-cost screen. Null
  -- means "no opinion" and the screen shows the trend without a verdict.
  add column daily_budget_paise bigint,
  add constraint daily_budget_positive
    check (daily_budget_paise is null or daily_budget_paise > 0);

-- ---------------------------------------------------------------------------
-- Residents who are not peers
-- ---------------------------------------------------------------------------
alter table house_members
  add column member_kind  member_kind not null default 'adult',
  -- Does this person carry a share of the house's expenses? False for a child.
  add column shares_cost  boolean     not null default true,
  -- Does the scheduler give them work? False for an infant or an invalid.
  add column does_chores  boolean     not null default true,
  -- Whose bill and whose responsibility, when shares_cost is false. The same
  -- relationship a guest has to their host, and it reuses that machinery.
  add column guardian_member_id uuid references house_members(id) on delete set null,
  -- A dependent has no users row to read a name from.
  add column display_name text;

-- A dependent may exist with no login at all. An adult may not.
alter table house_members alter column user_id drop not null;

alter table house_members add constraint member_has_identity check (
  user_id is not null
  or (member_kind = 'dependent' and display_name is not null)
);

alter table house_members add constraint adult_has_login check (
  member_kind = 'dependent' or user_id is not null
);

-- Somebody has to pick up the tab for a resident who does not pay their own.
alter table house_members add constraint non_payer_has_guardian check (
  shares_cost or guardian_member_id is not null
);

alter table house_members add constraint guardian_is_not_self check (
  guardian_member_id is null or guardian_member_id <> id
);

create index idx_members_guardian on house_members(guardian_member_id)
  where guardian_member_id is not null;

-- `unique (house_id, user_id)` still holds: Postgres treats nulls as distinct,
-- so any number of loginless dependents may share a house.

-- ---------------------------------------------------------------------------
-- A dependent's share of an expense, carried on their guardian's row
-- ---------------------------------------------------------------------------
alter table expense_splits
  add column dependent_share_paise bigint not null default 0
    check (dependent_share_paise >= 0);

-- The exact-sum invariant now spans three columns rather than two. It is still
-- the guarantee the whole ledger rests on.
create or replace function assert_split_sum() returns trigger as $$
declare
  v_expense_id uuid := coalesce(new.expense_id, old.expense_id);
  v_total  bigint;
  v_amount bigint;
begin
  select amount_paise into v_amount from expenses where id = v_expense_id;
  if v_amount is null then
    return null;                        -- the expense went with its splits
  end if;

  select coalesce(sum(share_paise + guest_share_paise + dependent_share_paise), 0)
    into v_total from expense_splits where expense_id = v_expense_id;

  if v_total <> v_amount then
    raise exception 'split total % does not equal expense amount % for expense %',
      v_total, v_amount, v_expense_id;
  end if;
  return null;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- The two split-writing functions learn the new column
-- ---------------------------------------------------------------------------
create or replace function replace_expense_splits(
  p_expense_id uuid,
  p_splits     jsonb
) returns void as $$
declare
  v_expense expenses%rowtype;
  v_me      house_members%rowtype;
begin
  select * into v_expense from expenses where id = p_expense_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  v_me := current_member(v_expense.house_id);
  if v_me.id is null then
    raise exception 'NOT_HOUSE_MEMBER' using errcode = 'insufficient_privilege';
  end if;
  if v_me.role <> 'admin' and v_expense.paid_by_member_id <> v_me.id then
    raise exception 'NOT_YOUR_RECORD' using errcode = 'insufficient_privilege';
  end if;

  delete from expense_splits where expense_id = p_expense_id;

  insert into expense_splits (house_id, expense_id, member_id, share_paise,
                              guest_share_paise, dependent_share_paise, basis_note)
  select v_expense.house_id,
         p_expense_id,
         (row ->> 'member_id')::uuid,
         (row ->> 'share_paise')::bigint,
         coalesce((row ->> 'guest_share_paise')::bigint, 0),
         coalesce((row ->> 'dependent_share_paise')::bigint, 0),
         row ->> 'basis_note'
    from jsonb_array_elements(p_splits) as row;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- Category seeding, by household shape
-- ---------------------------------------------------------------------------
-- A flat's categories and a family's categories overlap but are not the same
-- list. Seeding the wrong one is a small thing that makes the app feel like it
-- was built for somebody else, which is the first reason people abandon it.
create or replace function seed_default_categories(
  p_house_id uuid,
  p_type     household_type default 'shared'
) returns void as $$
begin
  if p_type = 'family' then
    insert into expense_categories (house_id, name, icon)
    values
      (p_house_id, 'Groceries',   '🥬'),
      (p_house_id, 'Rent / EMI',  '🏠'),
      (p_house_id, 'Electricity', '⚡'),
      (p_house_id, 'Water',       '💧'),
      (p_house_id, 'Cooking gas', '🔥'),
      (p_house_id, 'Internet',    '📶'),
      (p_house_id, 'Mobile',      '📱'),
      (p_house_id, 'School fees', '🎒'),
      (p_house_id, 'Health',      '🩺'),
      (p_house_id, 'Transport',   '🛵'),
      (p_house_id, 'Help / maid', '🧹'),
      (p_house_id, 'Eating out',  '🍽'),
      (p_house_id, 'Household',   '🧺'),
      (p_house_id, 'Other',       '📦')
    on conflict (house_id, name) do nothing;
  else
    insert into expense_categories (house_id, name, icon)
    values
      (p_house_id, 'Groceries',  '🥬'),
      (p_house_id, 'Rent',       '🏠'),
      (p_house_id, 'Utilities',  '⚡'),
      (p_house_id, 'Gas',        '🔥'),
      (p_house_id, 'Internet',   '📶'),
      (p_house_id, 'Maid',       '🧹'),
      (p_house_id, 'Eating out', '🍽'),
      (p_house_id, 'Household',  '🧺'),
      (p_house_id, 'Other',      '📦')
    on conflict (house_id, name) do nothing;
  end if;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- House creation takes the shape and applies its defaults
-- ---------------------------------------------------------------------------
create or replace function create_house(
  p_name     text,
  p_address  text default null,
  p_timezone text default 'Asia/Kolkata',
  p_currency text default 'INR',
  p_type     household_type default 'shared'
) returns table (house_id uuid, invite_code text) as $$
declare
  v_user_id uuid := auth.uid();
  v_house   houses%rowtype;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = 'insufficient_privilege';
  end if;

  insert into houses (name, address, timezone, currency, invite_code, created_by,
                      household_type)
  values (trim(p_name), nullif(trim(coalesce(p_address, '')), ''),
          p_timezone, p_currency, generate_invite_code(), v_user_id, p_type)
  returning * into v_house;

  -- A family's money comes out of a pot and its children are not fined.
  -- A flat splits and settles, and its deficit costs money. Both remain
  -- editable afterwards; this only chooses where the house starts.
  insert into house_settings (house_id, money_mode, penalty_enabled)
  values (
    v_house.id,
    case when p_type = 'family' then 'pot'::money_mode else 'split'::money_mode end,
    p_type <> 'family'
  );

  insert into house_members (house_id, user_id, role, status)
  values (v_house.id, v_user_id, 'admin', 'active');

  perform seed_default_categories(v_house.id, p_type);

  return query select v_house.id, v_house.invite_code;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- Dependents are created by an admin, not by signing up
-- ---------------------------------------------------------------------------
create or replace function add_dependent(
  p_house_id    uuid,
  p_name        text,
  p_guardian_id uuid,
  p_shares_cost boolean default false,
  p_does_chores boolean default false,
  p_residency   residency_type default 'full_time'
) returns house_members as $$
declare
  v_me     house_members%rowtype;
  v_member house_members%rowtype;
begin
  v_me := current_member(p_house_id);
  if v_me.id is null or v_me.role <> 'admin' then
    raise exception 'ADMIN_REQUIRED' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'NAME_REQUIRED' using errcode = 'check_violation';
  end if;

  -- A guardian is required whenever the dependent does not pay their own way,
  -- and must be a member of this house.
  if p_guardian_id is not null and not exists (
    select 1 from house_members
     where id = p_guardian_id and house_id = p_house_id and status = 'active'
  ) then
    raise exception 'GUARDIAN_NOT_FOUND' using errcode = 'foreign_key_violation';
  end if;

  insert into house_members (house_id, user_id, role, status, residency,
                             member_kind, shares_cost, does_chores,
                             guardian_member_id, display_name)
  values (p_house_id, null, 'member', 'active', p_residency,
          'dependent', p_shares_cost, p_does_chores,
          p_guardian_id, trim(p_name))
  returning * into v_member;

  return v_member;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function create_house(text, text, text, text, household_type)
  to authenticated;
grant execute on function add_dependent(uuid, text, uuid, boolean, boolean, residency_type)
  to authenticated;
revoke execute on function seed_default_categories(uuid, household_type)
  from anon, authenticated;

-- The old four-argument create_house is superseded. Dropping it keeps one
-- signature callable, so a stale client cannot quietly create a house with no
-- household_type and no matching settings.
drop function if exists create_house(text, text, text, text);
drop function if exists seed_default_categories(uuid);

-- ---------------------------------------------------------------------------
-- create_expense writes the third share column too
-- ---------------------------------------------------------------------------
-- Reproduced whole rather than patched: a `create or replace` has to restate
-- the entire body, and the only change is the two lines writing
-- dependent_share_paise.
create or replace function create_expense(
  p_category_id     uuid,
  p_amount_paise    bigint,
  p_expense_date    date,
  p_split_basis     split_basis,
  p_splits          jsonb,
  p_description     text default null,
  p_paid_by_member_id uuid default null,
  p_receipt_url     text default null,
  p_period          text default null,
  p_is_adjustment   boolean default false,
  p_adjustment_for_period text default null,
  p_recurring_id    uuid default null
) returns uuid as $$
declare
  v_me         house_members;
  v_house_id   uuid;
  v_payer_id   uuid;
  v_period     text;
  v_period_id  uuid;
  v_threshold  bigint;
  v_status     expense_status;
  v_expense_id uuid;
begin
  v_me := current_member();
  if v_me.id is null then
    raise exception 'NOT_HOUSE_MEMBER' using errcode = 'insufficient_privilege';
  end if;

  v_house_id := v_me.house_id;
  v_payer_id := coalesce(p_paid_by_member_id, v_me.id);

  -- BR-083 - the payer must be a member of this house.
  if not exists (select 1 from house_members
                  where id = v_payer_id and house_id = v_house_id) then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  if not exists (select 1 from expense_categories
                  where id = p_category_id and house_id = v_house_id) then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  v_period    := coalesce(p_period, to_char(p_expense_date, 'YYYY-MM'));
  v_period_id := ensure_period(v_house_id, v_period);

  if (select status from monthly_periods where id = v_period_id) = 'closed' then
    raise exception 'PERIOD_CLOSED' using errcode = 'check_violation';
  end if;

  -- BR-084 - above the threshold it waits for somebody else to approve it.
  select expense_approval_threshold_paise into v_threshold
    from house_settings where house_id = v_house_id;

  v_status := case
    when p_amount_paise > coalesce(v_threshold, 0) then 'pending_approval'::expense_status
    else 'approved'::expense_status
  end;

  insert into expenses (
    house_id, period_id, paid_by_member_id, category_id, amount_paise,
    description, expense_date, split_basis, status, receipt_url,
    is_adjustment, adjustment_for_period, recurring_id, created_by
  ) values (
    v_house_id, v_period_id, v_payer_id, p_category_id, p_amount_paise,
    nullif(trim(coalesce(p_description, '')), ''), p_expense_date, p_split_basis,
    v_status, nullif(trim(coalesce(p_receipt_url, '')), ''),
    p_is_adjustment, p_adjustment_for_period, p_recurring_id, v_me.id
  )
  returning id into v_expense_id;

  insert into expense_splits (house_id, expense_id, member_id, share_paise,
                              guest_share_paise, dependent_share_paise, basis_note)
  select v_house_id,
         v_expense_id,
         (row ->> 'member_id')::uuid,
         (row ->> 'share_paise')::bigint,
         coalesce((row ->> 'guest_share_paise')::bigint, 0),
         coalesce((row ->> 'dependent_share_paise')::bigint, 0),
         row ->> 'basis_note'
    from jsonb_array_elements(p_splits) as row;

  return v_expense_id;
end;
$$ language plpgsql security definer set search_path = public;
