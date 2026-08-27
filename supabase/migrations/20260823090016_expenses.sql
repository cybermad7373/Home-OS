-- 016 — Expenses
-- Source: docs/04-DATABASE.md sections 4.5 and 4.6 (periods only), section 6.
--
-- Periods appear here rather than in the settlement phase because
-- expenses.period_id is not null: an expense has to land in a month. What the
-- settlement phase adds is the state machine that closes one, not the table.

create table expense_categories (
  id                   uuid primary key default gen_random_uuid(),
  house_id             uuid not null references houses(id) on delete cascade,
  name                 text not null,
  icon                 text,
  monthly_budget_paise bigint,
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  unique (house_id, name)
);

create table monthly_periods (
  id             uuid primary key default gen_random_uuid(),
  house_id       uuid not null references houses(id) on delete cascade,
  period         text not null,                    -- 'YYYY-MM'
  status         period_status not null default 'open',
  total_expense_paise bigint not null default 0,
  total_penalty_paise bigint not null default 0,
  closed_by      uuid references house_members(id),
  closed_at      timestamptz,
  locked_at      timestamptz,                      -- set when every settlement is confirmed
  reopen_count   integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (house_id, period)
);

create table recurring_expenses (
  id             uuid primary key default gen_random_uuid(),
  house_id       uuid not null references houses(id) on delete cascade,
  name           text not null,
  amount_paise   bigint not null check (amount_paise > 0),
  category_id    uuid not null references expense_categories(id),
  paid_by_member_id uuid references house_members(id),   -- null = admin assigns at post time
  split_basis    split_basis not null default 'equal',
  day_of_month   integer not null check (day_of_month between 1 and 28),
  auto_approve   boolean not null default true,
  active         boolean not null default true,
  next_run_date  date not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table expenses (
  id                uuid primary key default gen_random_uuid(),
  house_id          uuid not null references houses(id) on delete cascade,
  period_id         uuid not null references monthly_periods(id),
  paid_by_member_id uuid not null references house_members(id),
  category_id       uuid not null references expense_categories(id),
  -- BR-080: greater than zero, at most ₹10,00,000.
  amount_paise      bigint not null check (amount_paise > 0 and amount_paise <= 100000000),
  description       text,
  expense_date      date not null,
  split_basis       split_basis not null default 'equal',
  status            expense_status not null default 'approved',
  approved_by       uuid references house_members(id),
  approved_at       timestamptz,
  rejection_reason  text,
  receipt_url       text,
  recurring_id      uuid references recurring_expenses(id),
  -- late-expense handling
  is_adjustment     boolean not null default false,
  adjustment_for_period text,                      -- 'YYYY-MM' of the closed month it belongs to
  created_by        uuid not null references house_members(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- BR-085: nobody approves their own spending. A constraint, not a check in a
  -- route handler, because a route handler can be bypassed and a constraint cannot.
  constraint no_self_approve check (approved_by is null or approved_by <> paid_by_member_id),
  constraint adjustment_has_origin check (is_adjustment = false or adjustment_for_period is not null)
);

create table expense_splits (
  id            uuid primary key default gen_random_uuid(),
  house_id      uuid not null references houses(id) on delete cascade,
  expense_id    uuid not null references expenses(id) on delete cascade,
  member_id     uuid not null references house_members(id),
  share_paise   bigint not null check (share_paise >= 0),
  -- a guest's share is carried on the host member's row and recorded here for transparency
  guest_share_paise bigint not null default 0,
  basis_note    text,
  created_at    timestamptz not null default now(),
  unique (expense_id, member_id)
);

-- BR-097: a recurring expense posts once per period, however many times the
-- daily job runs or retries.
create unique index uq_expense_recurring_period
  on expenses (recurring_id, period_id) where recurring_id is not null;

-- Section 5 indexes for these tables.
create index idx_expense_period     on expenses(period_id, status);
create index idx_expense_house_date on expenses(house_id, expense_date desc);
create index idx_expense_payer      on expenses(paid_by_member_id, expense_date desc);
create index idx_expense_category   on expenses(category_id, expense_date desc);
create index idx_splits_member      on expense_splits(member_id);
create index idx_splits_expense     on expense_splits(expense_id);
create index idx_periods_house      on monthly_periods(house_id, period desc);
create index idx_recurring_due      on recurring_expenses(next_run_date) where active;

create trigger trg_periods_touch   before update on monthly_periods
  for each row execute function touch_updated_at();
create trigger trg_expenses_touch  before update on expenses
  for each row execute function touch_updated_at();
create trigger trg_recurring_touch before update on recurring_expenses
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- 6.2  BR-092 — splits must sum exactly to their expense amount.
--
-- Deferred, so that an expense and its splits inserted in one transaction are
-- checked once at commit rather than after each row. This is the guarantee
-- behind NFR-08, and a violation is a bug rather than a user error.
-- ---------------------------------------------------------------------------
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

  select coalesce(sum(share_paise + guest_share_paise), 0)
    into v_total from expense_splits where expense_id = v_expense_id;

  if v_total <> v_amount then
    raise exception 'split total % does not equal expense amount % for expense %',
      v_total, v_amount, v_expense_id;
  end if;
  return null;
end;
$$ language plpgsql;

create constraint trigger trg_split_sum
  after insert or update or delete on expense_splits
  deferrable initially deferred
  for each row execute function assert_split_sum();

-- 6.3  BR-090, SEC-11 — a closed period is immutable at the database level.
create or replace function assert_period_open() returns trigger as $$
declare v_status period_status;
begin
  select status into v_status from monthly_periods
   where id = coalesce(new.period_id, old.period_id);
  if v_status = 'closed' then
    raise exception 'PERIOD_CLOSED' using errcode = 'check_violation';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_expense_period_open
  before insert or update or delete on expenses
  for each row execute function assert_period_open();

-- ---------------------------------------------------------------------------
-- Row Level Security. Everyone in the house reads everything — that
-- transparency is the product. Writes are narrower.
-- ---------------------------------------------------------------------------
alter table expense_categories enable row level security;
alter table monthly_periods    enable row level security;
alter table recurring_expenses enable row level security;
alter table expenses           enable row level security;
alter table expense_splits     enable row level security;

create policy read_categories on expense_categories
  for select using (is_house_member(house_id));
create policy admin_writes_categories on expense_categories
  for all using (is_house_admin(house_id)) with check (is_house_admin(house_id));

create policy read_periods on monthly_periods
  for select using (is_house_member(house_id));
-- BR-100: a period is created lazily by the first expense dated within it, so
-- any member may open one. Closing it is an admin action, added in phase 3.
create policy member_opens_period on monthly_periods
  for insert with check (is_house_member(house_id));
create policy admin_writes_periods on monthly_periods
  for update using (is_house_admin(house_id)) with check (is_house_admin(house_id));

create policy read_recurring on recurring_expenses
  for select using (is_house_member(house_id));
create policy admin_writes_recurring on recurring_expenses
  for all using (is_house_admin(house_id)) with check (is_house_admin(house_id));

create policy read_expenses on expenses
  for select using (is_house_member(house_id));

create policy member_creates_expense on expenses
  for insert with check (
    is_house_member(house_id)
    and created_by in (select id from house_members
                        where house_members.house_id = expenses.house_id
                          and user_id = auth.uid())
  );

-- A member may edit or void what they paid for; an admin may touch anything in
-- the house. Approving somebody else's expense is an update too, so any active
-- member may update a row that is awaiting approval.
create policy member_updates_expense on expenses
  for update using (
    is_house_member(house_id)
    and (
      is_house_admin(house_id)
      or paid_by_member_id in (select id from house_members
                                where house_members.house_id = expenses.house_id
                                  and user_id = auth.uid())
      or status = 'pending_approval'
    )
  );

create policy read_splits on expense_splits
  for select using (is_house_member(house_id));
create policy member_writes_splits on expense_splits
  for all using (is_house_member(house_id)) with check (is_house_member(house_id));
