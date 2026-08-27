-- 026 — Availability and guests
-- Source: docs/04-DATABASE.md section 4.2.
--
-- The tables arrive now, ahead of the phase that fills them in, because
-- chore_assignments references guests and the scheduler reads availability.
-- Phase 4 treats every member as available in every slot; phase 5 supplies the
-- real windows, and nothing downstream has to change shape when it does.

-- Seven rows per member: the typical week. Times are averages, not commitments.
create table member_availability (
  id           uuid primary key default gen_random_uuid(),
  house_id     uuid not null references houses(id) on delete cascade,
  member_id    uuid not null references house_members(id) on delete cascade,
  day_of_week  integer not null check (day_of_week between 0 and 6),  -- 0 = Sunday
  is_home      boolean not null default true,
  leaves_at    time,        -- null when home all day
  returns_at   time,        -- null when home all day
  updated_at   timestamptz not null default now(),
  unique (member_id, day_of_week),
  -- BR-021: a return must be after a departure. An overnight shift is expressed
  -- as is_home = false for that day, not as a window that wraps midnight.
  check (is_home = false or leaves_at is null or returns_at is null or returns_at > leaves_at)
);

create table availability_exceptions (
  id           uuid primary key default gen_random_uuid(),
  house_id     uuid not null references houses(id) on delete cascade,
  member_id    uuid not null references house_members(id) on delete cascade,
  exc_date     date not null,
  exc_type     exception_type not null,
  leaves_at    time,
  returns_at   time,
  reason       text,
  created_at   timestamptz not null default now(),
  unique (member_id, exc_date)
);

create table guests (
  id                uuid primary key default gen_random_uuid(),
  house_id          uuid not null references houses(id) on delete cascade,
  host_member_id    uuid not null references house_members(id) on delete cascade,
  name              text not null,
  from_date         date not null,
  to_date           date not null,
  counts_for_expense boolean not null default true,
  is_assignable     boolean not null default true,
  created_at        timestamptz not null default now(),
  check (to_date >= from_date)
);

create index idx_availability_member on member_availability(member_id, day_of_week);
create index idx_exceptions_range    on availability_exceptions(house_id, exc_date);
create index idx_guests_range        on guests(house_id, from_date, to_date);

create trigger trg_availability_touch before update on member_availability
  for each row execute function touch_updated_at();

alter table member_availability     enable row level security;
alter table availability_exceptions enable row level security;
alter table guests                  enable row level security;

-- Everyone can see when everyone else is home. That is not a privacy leak in
-- this product: it is the evidence behind every schedule, and a schedule whose
-- inputs nobody can check is just an assertion.
create policy read_availability on member_availability
  for select using (is_house_member(house_id));
create policy member_writes_own_availability on member_availability
  for all using (
    is_house_member(house_id)
    and member_id in (select id from house_members
                       where house_members.house_id = member_availability.house_id
                         and user_id = auth.uid())
  )
  with check (
    is_house_member(house_id)
    and member_id in (select id from house_members
                       where house_members.house_id = member_availability.house_id
                         and user_id = auth.uid())
  );
create policy admin_writes_availability on member_availability
  for all using (is_house_admin(house_id)) with check (is_house_admin(house_id));

create policy read_exceptions on availability_exceptions
  for select using (is_house_member(house_id));
create policy member_writes_own_exceptions on availability_exceptions
  for all using (
    is_house_member(house_id)
    and member_id in (select id from house_members
                       where house_members.house_id = availability_exceptions.house_id
                         and user_id = auth.uid())
  )
  with check (
    is_house_member(house_id)
    and member_id in (select id from house_members
                       where house_members.house_id = availability_exceptions.house_id
                         and user_id = auth.uid())
  );

create policy read_guests on guests
  for select using (is_house_member(house_id));
-- A guest is the host's responsibility, so the host registers them.
create policy member_writes_own_guests on guests
  for all using (
    is_house_member(house_id)
    and (
      is_house_admin(house_id)
      or host_member_id in (select id from house_members
                             where house_members.house_id = guests.house_id
                               and user_id = auth.uid())
    )
  )
  with check (is_house_member(house_id));
