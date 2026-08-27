-- 022 — Settlement
-- Source: docs/04-DATABASE.md section 4.6.
--
-- A settlement is derived data, and it is materialised anyway (DR-09): it must
-- remain exactly as computed at close, even if an underlying expense is later
-- corrected. Recomputing it on read would silently change what people already
-- agreed to pay.

create table member_period_balances (
  id                 uuid primary key default gen_random_uuid(),
  house_id           uuid not null references houses(id) on delete cascade,
  period_id          uuid not null references monthly_periods(id) on delete cascade,
  member_id          uuid not null references house_members(id) on delete cascade,
  total_paid_paise   bigint not null default 0,
  fair_share_paise   bigint not null default 0,
  expense_net_paise  bigint not null default 0,   -- paid - fair share
  penalty_owed_paise bigint not null default 0,
  penalty_credit_paise bigint not null default 0,
  final_net_paise    bigint not null default 0,   -- positive: house owes the member
  computed_at        timestamptz not null default now(),
  unique (period_id, member_id)
);

create table settlements (
  id               uuid primary key default gen_random_uuid(),
  house_id         uuid not null references houses(id) on delete cascade,
  period_id        uuid not null references monthly_periods(id) on delete cascade,
  from_member_id   uuid not null references house_members(id) on delete cascade,
  to_member_id     uuid not null references house_members(id) on delete cascade,
  -- BR-108: always positive. Direction is from and to, never a sign.
  amount_paise     bigint not null check (amount_paise > 0),
  status           settlement_status not null default 'pending',
  upi_link         text,
  marked_paid_at   timestamptz,
  confirmed_at     timestamptz,
  note             text,
  is_delta         boolean not null default false,  -- issued by a reopen (BR-112)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (from_member_id <> to_member_id)
);

create index idx_settlement_period on settlements(period_id, status);
create index idx_settlement_member on settlements(from_member_id, status);
create index idx_settlement_payee  on settlements(to_member_id, status);
create index idx_balances_period   on member_period_balances(period_id);

create trigger trg_settlements_touch before update on settlements
  for each row execute function touch_updated_at();

alter table member_period_balances enable row level security;
alter table settlements            enable row level security;

-- Everyone sees every balance and every payment. That transparency is the
-- product: a settlement nobody else can check is just an assertion.
create policy read_balances on member_period_balances
  for select using (is_house_member(house_id));
create policy admin_writes_balances on member_period_balances
  for all using (is_house_admin(house_id)) with check (is_house_admin(house_id));

create policy read_settlements on settlements
  for select using (is_house_member(house_id));
create policy admin_writes_settlements on settlements
  for all using (is_house_admin(house_id)) with check (is_house_admin(house_id));

-- BR-109 — only the payer may mark paid, only the receiver may confirm. The
-- functions in migration 023 enforce which field may change; this policy
-- decides who may touch the row at all.
create policy party_updates_settlement on settlements
  for update using (
    is_house_member(house_id)
    and (
      from_member_id in (select id from house_members
                          where house_members.house_id = settlements.house_id
                            and user_id = auth.uid())
      or to_member_id in (select id from house_members
                           where house_members.house_id = settlements.house_id
                             and user_id = auth.uid())
    )
  );
