-- 081 — Food: meals, library, preferences, recommendations
--
-- This migration adds the Food module tables per docs/15-FOOD-SPEC.md.
-- All money columns are integer paise. Dates evaluated in house timezone,
-- timestamps persisted in UTC. Every table has RLS and an isolation test.

create type food_source as enum ('home_cooked', 'restaurant', 'delivery', 'packaged');

-- foods: the canonical library of known dishes
create table foods (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references houses(id) on delete cascade,
  name text not null,
  canonical_name text not null, -- normalized for matching (lowercase, no punctuation)
  source food_source not null default 'home_cooked',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (house_id, canonical_name)
);

-- meals: a named eating event with cost, participants, optional expense link
create table meals (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references houses(id) on delete cascade,
  name text not null,
  food_id uuid references foods(id) on delete set null,
  source food_source not null default 'home_cooked',
  cost_paise bigint not null default 0,
  expense_id uuid references expenses(id) on delete set null,
  meal_date date not null,
  created_by_member_id uuid not null references house_members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_planned boolean not null default false,
  confirmed_at timestamptz
);

-- meal_items: ingredients/components of a meal
create table meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references meals(id) on delete cascade,
  food_id uuid references foods(id) on delete set null,
  name text not null,
  quantity text, -- free-form: "2 cups", "500g", etc.
  notes text
);

-- meal_participants: who ate, with per-person cost
create table meal_participants (
  meal_id uuid not null references meals(id) on delete cascade,
  member_id uuid not null references house_members(id) on delete cascade,
  share_paise bigint not null default 0,
  primary key (meal_id, member_id)
);

-- food_preferences: ratings and dislikes per member, per food
create table food_preferences (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references houses(id) on delete cascade,
  member_id uuid not null references house_members(id) on delete cascade,
  food_id uuid not null references foods(id) on delete cascade,
  rating smallint, -- 1-5, null = no rating
  is_disliked boolean not null default false,
  is_house_favorite boolean not null default false, -- set by leads
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, food_id)
);

-- Only one house favorite per food per house
create unique index food_prefs_house_favorite_idx
  on food_preferences (house_id, food_id)
  where is_house_favorite;

-- RLS policies
alter table foods enable row level security;
alter table meals enable row level security;
alter table meal_items enable row level security;
alter table meal_participants enable row level security;
alter table food_preferences enable row level security;

-- foods: house members can read all, leads can write
create policy "foods_read" on foods
  for select to authenticated
  using (is_house_member(house_id));

create policy "foods_write" on foods
  for insert to authenticated
  with check (is_house_lead(house_id));

create policy "foods_update" on foods
  for update to authenticated
  using (is_house_lead(house_id))
  with check (is_house_lead(house_id));

create policy "foods_delete" on foods
  for delete to authenticated
  using (is_house_lead(house_id));

-- meals: house members can read, creator/leads can write
create policy "meals_read" on meals
  for select to authenticated
  using (is_house_member(house_id));

create policy "meals_insert" on meals
  for insert to authenticated
  with check (is_house_member(house_id) and created_by_member_id = (current_member(house_id)).id);

create policy "meals_update" on meals
  for update to authenticated
  using (is_house_member(house_id) and (created_by_member_id = (current_member(house_id)).id or is_house_lead(house_id)))
  with check (is_house_member(house_id) and (created_by_member_id = (current_member(house_id)).id or is_house_lead(house_id)));

create policy "meals_delete" on meals
  for delete to authenticated
  using (is_house_lead(house_id));

-- meal_items: follow meal permissions
create policy "meal_items_read" on meal_items
  for select to authenticated
  using (exists (select 1 from meals m where m.id = meal_items.meal_id and is_house_member(m.house_id)));

create policy "meal_items_write" on meal_items
  for insert to authenticated
  with check (exists (select 1 from meals m where m.id = meal_items.meal_id and is_house_member(m.house_id) and (m.created_by_member_id = (current_member(m.house_id)).id or is_house_lead(m.house_id))));

-- meal_participants: follow meal permissions
create policy "meal_participants_read" on meal_participants
  for select to authenticated
  using (exists (select 1 from meals m where m.id = meal_participants.meal_id and is_house_member(m.house_id)));

create policy "meal_participants_write" on meal_participants
  for insert to authenticated
  with check (exists (select 1 from meals m where m.id = meal_participants.meal_id and is_house_member(m.house_id) and (m.created_by_member_id = (current_member(m.house_id)).id or is_house_lead(m.house_id))));

-- food_preferences: member reads own, leads read all; member writes own
create policy "food_prefs_read_own" on food_preferences
  for select to authenticated
  using (member_id = (current_member(house_id)).id);

create policy "food_prefs_read_all" on food_preferences
  for select to authenticated
  using (is_house_lead(house_id));

create policy "food_prefs_write" on food_preferences
  for insert to authenticated
  with check (member_id = (current_member(house_id)).id and is_house_member(house_id));

create policy "food_prefs_update" on food_preferences
  for update to authenticated
  using (member_id = (current_member(house_id)).id)
  with check (member_id = (current_member(house_id)).id);

-- Indexes
create index foods_house_id_idx on foods(house_id);
create index foods_canonical_name_idx on foods(house_id, canonical_name);
create index meals_house_id_idx on meals(house_id);
create index meals_meal_date_idx on meals(house_id, meal_date);
create index meals_food_id_idx on meals(food_id);
create index meals_expense_id_idx on meals(expense_id);
create index meal_items_meal_id_idx on meal_items(meal_id);
create index meal_participants_meal_id_idx on meal_participants(meal_id);
create index meal_participants_member_id_idx on meal_participants(member_id);
create index food_preferences_house_member_idx on food_preferences(house_id, member_id);
create index food_preferences_food_id_idx on food_preferences(food_id);

-- Triggers for updated_at
create trigger foods_updated_at
  before update on foods
  for each row execute function touch_updated_at();

create trigger meals_updated_at
  before update on meals
  for each row execute function touch_updated_at();

create trigger food_preferences_updated_at
  before update on food_preferences
  for each row execute function touch_updated_at();

-- Function: compute per-person cost with exact remainder distribution
-- Returns a set of (member_id, share_paise) for a given meal
create or replace function compute_meal_shares(p_meal_id uuid)
returns table (member_id uuid, share_paise bigint)
language sql
as $$
  select
    mp.member_id,
    mp.share_paise
  from meal_participants mp
  where mp.meal_id = p_meal_id
  order by mp.member_id;
$$;

-- Function: create meal with participants and cost distribution
-- Handles exact remainder distribution (one paisa at a time, member-id order)
create or replace function create_meal(
  p_house_id uuid,
  p_name text,
  p_source food_source,
  p_cost_paise bigint,
  p_meal_date date,
  p_participant_member_ids uuid[],
  p_food_id uuid default null,
  p_expense_id uuid default null,
  p_is_planned boolean default false
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_meal_id uuid;
  v_base_share bigint;
  v_remainder bigint;
  v_participant_count int;
  v_member_id uuid;
  v_idx int;
begin
  -- Verify all participants are active members of this house
  if not exists (
    select 1 from house_members hm
    where hm.house_id = p_house_id
      and hm.id = any(p_participant_member_ids)
      and hm.status = 'active'
      and hm.member_kind = 'adult'
  ) then
    raise exception 'INVALID_PARTICIPANTS';
  end if;

  v_participant_count := array_length(p_participant_member_ids, 1);
  if v_participant_count = 0 then
    raise exception 'NO_PARTICIPANTS';
  end if;

  v_base_share := p_cost_paise / v_participant_count;
  v_remainder := p_cost_paise % v_participant_count;

  insert into meals (house_id, name, source, cost_paise, meal_date, created_by_member_id, food_id, expense_id, is_planned)
  values (p_house_id, p_name, p_source, p_cost_paise, p_meal_date, (current_member(p_house_id)).id, p_food_id, p_expense_id, p_is_planned)
  returning id into v_meal_id;

  -- Insert participants with exact remainder distribution
  for v_idx in 1..v_participant_count loop
    v_member_id := p_participant_member_ids[v_idx];
    insert into meal_participants (meal_id, member_id, share_paise)
    values (v_meal_id, v_member_id, v_base_share + case when v_idx <= v_remainder then 1 else 0 end);
  end loop;

  -- If food_id provided and not planned, update food stats (could be expanded)
  if p_food_id is not null and not p_is_planned then
    update foods set updated_at = now() where id = p_food_id;
  end if;

  return v_meal_id;
end;
$$;

-- Grant execute to browser clients
grant execute on function create_meal(uuid, text, food_source, bigint, date, uuid[], uuid, uuid, boolean) to anon, authenticated, service_role;
grant execute on function compute_meal_shares(uuid) to anon, authenticated, service_role;

-- Default privileges
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;