-- 027 — Chores, scheduling and effort accounting
-- Source: docs/04-DATABASE.md sections 4.3 and 4.4.
--
-- The centre of gravity of the product. Everything before this made money
-- visible; this makes the work visible.

create table chore_templates (
  id              uuid primary key default gen_random_uuid(),
  house_id        uuid not null references houses(id) on delete cascade,
  name            text not null,
  category        chore_category not null,
  effort_points   integer not null check (effort_points > 0),
  duration_min    integer not null check (duration_min > 0),
  slot            chore_slot not null default 'any',
  scope           chore_scope not null default 'house',
  room_id         uuid references rooms(id) on delete cascade,   -- required when scope='room'
  frequency       chore_frequency not null,
  times_per_week  integer,                                       -- required when frequency='times_per_week'
  requires_cooking_skill boolean not null default false,
  is_heavy        boolean not null default false,                -- drives the no-repeat-next-week rule
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (scope <> 'room' or room_id is not null),
  check (frequency <> 'times_per_week' or times_per_week between 1 and 7)
);

create table schedule_runs (
  id             uuid primary key default gen_random_uuid(),
  house_id       uuid not null references houses(id) on delete cascade,
  week_start     date not null,                    -- always a Monday
  generated_at   timestamptz not null default now(),
  generator      assignment_source not null,       -- 'engine' or 'llm'
  llm_accepted   boolean,
  llm_rationale  text,
  total_points   integer not null default 0,
  unassigned_count integer not null default 0,
  max_deviation  integer not null default 0,
  created_at     timestamptz not null default now(),
  -- NFR-11: running the generator twice for the same week must not produce two
  -- schedules. The unique key is what makes the job idempotent.
  unique (house_id, week_start)
);

create table chore_assignments (
  id                 uuid primary key default gen_random_uuid(),
  house_id           uuid not null references houses(id) on delete cascade,
  schedule_run_id    uuid references schedule_runs(id) on delete set null,
  template_id        uuid not null references chore_templates(id) on delete cascade,
  assignee_member_id uuid references house_members(id) on delete set null,
  guest_id           uuid references guests(id) on delete set null,
  chore_date         date not null,
  slot               chore_slot not null,
  window_start       timestamptz not null,
  window_end         timestamptz not null,
  deadline           timestamptz not null,
  effort_points      integer not null,                    -- snapshot; the template may change later
  duration_min       integer not null default 30,
  status             assignment_status not null default 'assigned',
  source             assignment_source not null default 'engine',
  done_at            timestamptz,
  photo_url          text,
  confirmed_by       uuid references house_members(id),
  confirmed_at       timestamptz,
  auto_confirmed     boolean not null default false,
  rejected_by        uuid references house_members(id),
  rejected_reason    text,
  retry_count        integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- SEC-04, and the rule the whole confirmation mechanism rests on: nobody
  -- confirms their own work. A check constraint, not a route handler, because a
  -- route handler can be bypassed and a constraint cannot.
  constraint no_self_confirm check (confirmed_by is null or confirmed_by <> assignee_member_id),
  constraint no_self_reject  check (rejected_by  is null or rejected_by  <> assignee_member_id),
  constraint open_has_no_assignee check (status <> 'open' or assignee_member_id is null),
  constraint window_sane check (window_end > window_start)
);

create table swap_requests (
  id             uuid primary key default gen_random_uuid(),
  house_id       uuid not null references houses(id) on delete cascade,
  assignment_id  uuid not null references chore_assignments(id) on delete cascade,
  from_member_id uuid not null references house_members(id) on delete cascade,
  to_member_id   uuid not null references house_members(id) on delete cascade,
  status         swap_status not null default 'pending',
  message        text,
  responded_at   timestamptz,
  created_at     timestamptz not null default now(),
  check (from_member_id <> to_member_id)
);

-- One row per member per week. Written when a week closes.
create table effort_ledger (
  id             uuid primary key default gen_random_uuid(),
  house_id       uuid not null references houses(id) on delete cascade,
  member_id      uuid not null references house_members(id) on delete cascade,
  week_start     date not null,
  base_target    integer not null default 0,     -- before carry adjustment
  carry_in       integer not null default 0,
  effective_target integer not null default 0,   -- base_target - carry_in, capped
  earned_points  integer not null default 0,
  carry_out      integer not null default 0,     -- earned_points - effective_target
  present_days   integer not null default 7,
  assigned_count integer not null default 0,
  confirmed_count integer not null default 0,
  missed_count   integer not null default 0,
  closed_at      timestamptz not null default now(),
  unique (house_id, member_id, week_start)
);

-- Written at month close, from the month's effort_ledger rows.
create table chore_penalties (
  id              uuid primary key default gen_random_uuid(),
  house_id        uuid not null references houses(id) on delete cascade,
  period_id       uuid not null references monthly_periods(id) on delete cascade,
  member_id       uuid not null references house_members(id) on delete cascade,
  deficit_points  integer not null default 0,   -- positive number when in deficit
  surplus_points  integer not null default 0,
  rate_paise      bigint not null,
  amount_owed_paise    bigint not null default 0,
  amount_credited_paise bigint not null default 0,
  created_at      timestamptz not null default now(),
  unique (period_id, member_id)
);

-- The two hottest queries: my chores today, and the house week view.
create index idx_assign_member_date on chore_assignments(assignee_member_id, chore_date, status);
create index idx_assign_house_date  on chore_assignments(house_id, chore_date);
create index idx_assign_pending     on chore_assignments(house_id, status)
                                    where status in ('done_pending', 'assigned', 'open');
create index idx_assign_run         on chore_assignments(schedule_run_id);
create index idx_ledger_member_week on effort_ledger(member_id, week_start desc);
create index idx_ledger_house_week  on effort_ledger(house_id, week_start desc);
create index idx_templates_house    on chore_templates(house_id) where active;
create index idx_swaps_pending      on swap_requests(to_member_id, status);

create trigger trg_templates_touch  before update on chore_templates
  for each row execute function touch_updated_at();
create trigger trg_assignments_touch before update on chore_assignments
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- 6.4 — Points post to the ledger exactly once, on entry to 'confirmed'.
--
-- The transition guard is what makes it idempotent: a repeated update to an
-- already-confirmed row moves nothing. Nothing else in the system writes
-- earned_points, so this trigger is the single door into the effort ledger.
-- ---------------------------------------------------------------------------
create or replace function post_effort_points() returns trigger as $$
declare
  v_week_start date;
begin
  if new.status = 'confirmed' and old.status <> 'confirmed'
     and new.assignee_member_id is not null then
    -- The week a chore belongs to is the Monday on or before its date.
    v_week_start := (new.chore_date - ((extract(isodow from new.chore_date)::int - 1)))::date;

    insert into effort_ledger (house_id, member_id, week_start, earned_points,
                               confirmed_count)
    values (new.house_id, new.assignee_member_id, v_week_start, new.effort_points, 1)
    on conflict (house_id, member_id, week_start)
      do update set earned_points   = effort_ledger.earned_points + new.effort_points,
                    confirmed_count = effort_ledger.confirmed_count + 1;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_post_points
  after update on chore_assignments
  for each row execute function post_effort_points();

-- Missing a chore is recorded too, so the leaderboard can show a completion
-- rate rather than only a points total.
create or replace function post_missed_chore() returns trigger as $$
declare v_week_start date;
begin
  if new.status = 'missed' and old.status <> 'missed'
     and new.assignee_member_id is not null then
    v_week_start := (new.chore_date - ((extract(isodow from new.chore_date)::int - 1)))::date;

    insert into effort_ledger (house_id, member_id, week_start, missed_count)
    values (new.house_id, new.assignee_member_id, v_week_start, 1)
    on conflict (house_id, member_id, week_start)
      do update set missed_count = effort_ledger.missed_count + 1;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_post_missed
  after update on chore_assignments
  for each row execute function post_missed_chore();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table chore_templates   enable row level security;
alter table schedule_runs     enable row level security;
alter table chore_assignments enable row level security;
alter table swap_requests     enable row level security;
alter table effort_ledger     enable row level security;
alter table chore_penalties   enable row level security;

create policy read_templates on chore_templates
  for select using (is_house_member(house_id));
create policy admin_writes_templates on chore_templates
  for all using (is_house_admin(house_id)) with check (is_house_admin(house_id));

create policy read_runs on schedule_runs
  for select using (is_house_member(house_id));
create policy admin_writes_runs on schedule_runs
  for all using (is_house_admin(house_id)) with check (is_house_admin(house_id));

create policy read_assignments on chore_assignments
  for select using (is_house_member(house_id));
create policy admin_writes_assignments on chore_assignments
  for all using (is_house_admin(house_id)) with check (is_house_admin(house_id));

-- The narrow policy from the database document: a member may act on their own
-- assignment, may confirm or reject somebody else's pending one, and may claim
-- from the open pool. Which field they may change is settled by the functions
-- in migration 028 — this decides only who may touch the row.
create policy member_updates_assignment on chore_assignments
  for update using (
    is_house_member(house_id)
    and (
      assignee_member_id in (select id from house_members
                              where house_members.house_id = chore_assignments.house_id
                                and user_id = auth.uid())
      or status = 'done_pending'      -- anyone may confirm or reject a pending one
      or status = 'open'              -- anyone may claim from the pool
    )
  );

create policy read_swaps on swap_requests
  for select using (is_house_member(house_id));
create policy member_writes_swaps on swap_requests
  for all using (
    is_house_member(house_id)
    and (
      from_member_id in (select id from house_members
                          where house_members.house_id = swap_requests.house_id
                            and user_id = auth.uid())
      or to_member_id in (select id from house_members
                           where house_members.house_id = swap_requests.house_id
                             and user_id = auth.uid())
    )
  )
  with check (is_house_member(house_id));

-- The leaderboard is a surface, not a report: everybody sees everybody's
-- standing. That transparency is the product.
create policy read_ledger on effort_ledger
  for select using (is_house_member(house_id));
create policy admin_writes_ledger on effort_ledger
  for all using (is_house_admin(house_id)) with check (is_house_admin(house_id));

create policy read_penalties on chore_penalties
  for select using (is_house_member(house_id));
create policy admin_writes_penalties on chore_penalties
  for all using (is_house_admin(house_id)) with check (is_house_admin(house_id));

-- ---------------------------------------------------------------------------
-- The leaderboard view (docs/04-DATABASE.md section 8).
-- ---------------------------------------------------------------------------
create view v_effort_standing
with (security_invoker = true) as
select el.house_id, el.member_id, u.display_name,
       sum(el.earned_points)      as total_earned,
       sum(el.effective_target)   as total_target,
       sum(el.carry_out)          as running_carry,
       sum(el.confirmed_count)    as chores_done,
       sum(el.missed_count)       as chores_missed
  from effort_ledger el
  join house_members m on m.id = el.member_id
  join users u         on u.id = m.user_id
 group by el.house_id, el.member_id, u.display_name;
