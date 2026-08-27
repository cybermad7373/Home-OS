-- 002 — Identity, house and rooms
-- Source: docs/04-DATABASE.md section 4.1.

-- Mirrors auth.users. Supabase owns authentication; this holds the profile.
create table users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null unique,
  display_name  text not null,
  phone         text,
  upi_vpa       text,                       -- used only to build UPI deep links
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table houses (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  address       text,
  timezone      text not null default 'Asia/Kolkata',
  currency      text not null default 'INR',
  invite_code   text not null unique,
  created_by    uuid not null references users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table house_settings (
  house_id                  uuid primary key references houses(id) on delete cascade,
  penalty_rate_paise        bigint  not null default 500,   -- money owed per deficit point
  expense_approval_threshold_paise bigint not null default 100000,  -- ₹1,000
  auto_confirm_hours        integer not null default 48,
  schedule_generation_dow   integer not null default 0,     -- 0 = Sunday
  schedule_generation_hour  integer not null default 20,
  carry_cap_percent         integer not null default 50,    -- max target adjustment from carry
  llm_scheduling_enabled    boolean not null default true,
  updated_at                timestamptz not null default now()
);

create table rooms (
  id              uuid primary key default gen_random_uuid(),
  house_id        uuid not null references houses(id) on delete cascade,
  name            text not null,
  capacity        integer not null check (capacity > 0),
  monthly_rent_paise bigint not null default 0,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (house_id, name)
);

create table house_members (
  id             uuid primary key default gen_random_uuid(),
  house_id       uuid not null references houses(id) on delete cascade,
  user_id        uuid not null references users(id) on delete cascade,
  role           member_role     not null default 'member',
  status         member_status   not null default 'pending',
  residency      residency_type  not null default 'full_time',
  can_cook       boolean not null default false,
  joined_date    date not null default current_date,
  left_date      date,                        -- null while active
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (house_id, user_id)
);

-- Dated, so a past month's rent split uses that month's occupancy.
create table room_assignments (
  id          uuid primary key default gen_random_uuid(),
  house_id    uuid not null references houses(id) on delete cascade,
  room_id     uuid not null references rooms(id) on delete cascade,
  member_id   uuid not null references house_members(id) on delete cascade,
  from_date   date not null,
  to_date     date,                            -- null = current
  created_at  timestamptz not null default now(),
  check (to_date is null or to_date >= from_date)
);

-- A member occupies at most one room at a time (BR-011). Partial unique index:
-- only one open-ended assignment per member may exist.
create unique index uq_room_assign_current
  on room_assignments(member_id) where to_date is null;
