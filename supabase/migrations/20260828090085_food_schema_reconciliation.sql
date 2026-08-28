-- 085 — Reconciles 081 with docs/04-DATABASE.md section 4.9.
--
-- The doc set carries an explicit drift note dated 2026-08-28: 081 shipped a
-- narrower shape than the section it was written against — no house_id on
-- meal_items/meal_participants, no meal_type, no cost breakdown into
-- base/prep/delivery/other, no guest or unnamed-eater participant, and
-- preferences per food only rather than per food or per item (the item-level
-- form is load-bearing for FD-13: one dislike suppresses every meal
-- containing it, and that only works when a preference can target an
-- ingredient with no food_id at all). The note said to close the gap before
-- the migration was applied; it was applied anyway. Nothing has written a
-- real row against the old shape outside test fixtures, so this drops and
-- rebuilds rather than layering ALTERs on a shape nothing should have kept.
--
-- member_restrictions (082) is untouched: it already matches the spec, and
-- its functions (meal_restriction_conflicts, foods_safe_for) only read
-- `name` columns that survive this migration unchanged.

-- ---------------------------------------------------------------------------
-- Drop the narrower shape. Order respects FK dependency.
-- ---------------------------------------------------------------------------

drop table if exists food_preferences cascade;
drop table if exists meal_participants cascade;
drop table if exists meal_items cascade;
drop table if exists meals cascade;
drop table if exists foods cascade;
drop function if exists create_meal(uuid, text, food_source, bigint, date, uuid[], uuid, uuid, boolean);
drop function if exists compute_meal_shares(uuid);
drop type if exists food_source;

create type meal_source as enum ('home_cooked', 'bought', 'ordered', 'other');
create type meal_type as enum ('breakfast', 'lunch', 'dinner', 'snack', 'other');
create type food_rating as enum ('like', 'okay', 'dislike');

-- ---------------------------------------------------------------------------
-- foods — the Home's library, deduplicated (FD-09)
-- ---------------------------------------------------------------------------

create table foods (
  id                  uuid primary key default gen_random_uuid(),
  house_id            uuid not null references houses(id) on delete cascade,
  name                text not null,
  normalised_name     text not null,
  default_source      meal_source,
  default_items       text[] not null default '{}',
  region_tag          text,
  meal_types          meal_type[] not null default '{}',
  typical_cost_paise  bigint,
  times_eaten         integer not null default 0,
  last_eaten_on       date,
  home_preference     numeric(4,3),
  active              boolean not null default true,
  merged_into_id      uuid references foods(id),
  recipe_instructions text,
  created_by          uuid not null references house_members(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (house_id, normalised_name)
);

-- ---------------------------------------------------------------------------
-- meals — one thing that was eaten, on a date, by named people (FD-01)
-- ---------------------------------------------------------------------------

create table meals (
  id                  uuid primary key default gen_random_uuid(),
  house_id            uuid not null references houses(id) on delete cascade,
  food_id             uuid references foods(id),
  name                text not null,
  meal_date           date not null,
  meal_type           meal_type not null default 'other',
  source              meal_source not null default 'home_cooked',
  base_cost_paise     bigint not null default 0 check (base_cost_paise >= 0),
  prep_cost_paise     bigint not null default 0 check (prep_cost_paise >= 0),
  delivery_cost_paise bigint not null default 0 check (delivery_cost_paise >= 0),
  other_cost_paise    bigint not null default 0 check (other_cost_paise >= 0),
  total_cost_paise    bigint not null default 0,
  expense_id          uuid references expenses(id) on delete set null,
  photo_url           text,
  recipe_instructions text,
  note                text,
  created_by          uuid not null references house_members(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- FD-07: the link is optional, in both directions, and never required.
alter table expenses add column if not exists meal_id uuid;
alter table expenses add constraint fk_expense_meal
  foreign key (meal_id) references meals(id) on delete set null;
create index expenses_meal_id_idx on expenses(meal_id);

create table meal_items (
  id            uuid primary key default gen_random_uuid(),
  house_id      uuid not null references houses(id) on delete cascade,
  meal_id       uuid not null references meals(id) on delete cascade,
  food_id       uuid references foods(id) on delete set null,
  name          text not null,
  quantity      text,
  cost_paise    bigint,
  sort_order    integer not null default 0
);

-- member_id is nullable so a guest or an unnamed eater can still be a head in
-- the per-person cost — a meal creates no debt, unlike an expense split.
create table meal_participants (
  id            uuid primary key default gen_random_uuid(),
  house_id      uuid not null references houses(id) on delete cascade,
  meal_id       uuid not null references meals(id) on delete cascade,
  member_id     uuid references house_members(id),
  guest_id      uuid references guests(id),
  label         text,
  share_paise   bigint not null default 0 check (share_paise >= 0),
  unique (meal_id, member_id),
  constraint one_identity check (
    (member_id is not null)::int + (guest_id is not null)::int
      + (label is not null)::int = 1
  )
);

-- A standing opinion about a food or an ingredient, not about one meal
-- instance (FD-11, FD-12). "I like paruppu sadham" outlives any single meal.
create table food_preferences (
  id            uuid primary key default gen_random_uuid(),
  house_id      uuid not null references houses(id) on delete cascade,
  food_id       uuid references foods(id) on delete cascade,
  item_name     text,
  member_id     uuid not null references house_members(id) on delete cascade,
  rating        food_rating not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint food_or_item check (
    (food_id is not null)::int + (item_name is not null)::int = 1
  )
);

create unique index uq_pref_food on food_preferences (member_id, food_id)
  where food_id is not null;
create unique index uq_pref_item on food_preferences (member_id, lower(item_name))
  where item_name is not null;

-- FD-20: an intention, not a record. No cost, no participants, no preference
-- signal until confirmed. confirmed_meal_id is set the moment it is.
create table meal_plans (
  id                uuid primary key default gen_random_uuid(),
  house_id          uuid not null references houses(id) on delete cascade,
  food_id           uuid references foods(id) on delete set null,
  name              text not null,
  planned_date      date not null,
  created_by        uuid not null references house_members(id),
  confirmed_meal_id uuid references meals(id) on delete set null,
  created_at        timestamptz not null default now()
);

create table shopping_items (
  id                    uuid primary key default gen_random_uuid(),
  house_id              uuid not null references houses(id) on delete cascade,
  name                  text not null,
  quantity              text,
  unit                  text,
  estimated_price_paise bigint,
  meal_id               uuid references meals(id) on delete set null,
  checked_off           boolean not null default false,
  checked_off_by        uuid references house_members(id),
  checked_off_at        timestamptz,
  created_by            uuid not null references house_members(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index foods_house_id_idx on foods(house_id);
create index foods_normalised_name_idx on foods(house_id, normalised_name);
create index meals_house_id_idx on meals(house_id);
create index meals_meal_date_idx on meals(house_id, meal_date);
create index meals_food_id_idx on meals(food_id);
create index meals_expense_id_idx on meals(expense_id);
create index meal_items_meal_id_idx on meal_items(meal_id);
create index meal_items_house_id_idx on meal_items(house_id);
create index meal_participants_meal_id_idx on meal_participants(meal_id);
create index meal_participants_member_id_idx on meal_participants(member_id);
create index meal_participants_house_id_idx on meal_participants(house_id);
create index food_preferences_house_member_idx on food_preferences(house_id, member_id);
create index food_preferences_food_id_idx on food_preferences(food_id);
create index idx_meal_plans_date on meal_plans(house_id, planned_date);
create index idx_meal_plans_house on meal_plans(house_id);
create index shopping_items_house_id_idx on shopping_items(house_id);
create index shopping_items_meal_id_idx on shopping_items(meal_id);

-- ---------------------------------------------------------------------------
-- Triggers: updated_at, and the two invariants the database enforces
-- regardless of which role writes the row.
-- ---------------------------------------------------------------------------

create trigger foods_updated_at
  before update on foods
  for each row execute function touch_updated_at();

create trigger meals_updated_at
  before update on meals
  for each row execute function touch_updated_at();

create trigger food_preferences_updated_at
  before update on food_preferences
  for each row execute function touch_updated_at();

create trigger shopping_items_updated_at
  before update on shopping_items
  for each row execute function touch_updated_at();

-- BR: per-person shares sum exactly to the meal's total (section 2.1). Mirrors
-- assert_split_sum for expense_splits (20260823090016_expenses.sql).
create or replace function assert_meal_shares_sum() returns trigger as $$
declare
  v_meal_id uuid := coalesce(new.meal_id, old.meal_id);
  v_total   bigint;
  v_sum     bigint;
begin
  select total_cost_paise into v_total from meals where id = v_meal_id;
  if v_total is null then
    return null;
  end if;

  select coalesce(sum(share_paise), 0) into v_sum
    from meal_participants where meal_id = v_meal_id;

  if v_sum <> v_total then
    raise exception 'meal participant shares % do not equal meal total % for meal %',
      v_sum, v_total, v_meal_id;
  end if;
  return null;
end;
$$ language plpgsql;

create constraint trigger trg_meal_shares_sum
  after insert or update or delete on meal_participants
  deferrable initially deferred
  for each row execute function assert_meal_shares_sum();

-- The two deferred allergen triggers from 082 belonged to the tables just
-- dropped and rebuilt; the trigger function itself (reject_allergen_participation)
-- is untouched, so this only re-attaches it.
create constraint trigger meal_participants_no_allergen
  after insert or update on meal_participants
  deferrable initially deferred
  for each row execute function reject_allergen_participation();

create constraint trigger meal_items_no_allergen
  after insert or update on meal_items
  deferrable initially deferred
  for each row execute function reject_allergen_participation();

-- ---------------------------------------------------------------------------
-- RLS. Everyone in the house reads the Home's food history — that
-- transparency is the point. Writes are narrower; a restriction stays out of
-- this entirely (082 already gives it its own, stricter policy).
-- ---------------------------------------------------------------------------

alter table foods           enable row level security;
alter table meals           enable row level security;
alter table meal_items      enable row level security;
alter table meal_participants enable row level security;
alter table food_preferences enable row level security;
alter table meal_plans      enable row level security;
alter table shopping_items  enable row level security;

create policy "foods_read" on foods
  for select to authenticated
  using (is_house_member(house_id));

-- Any member may add to the library — the Add Meal "save to library" checkbox
-- is not lead-gated. Merge/rename (section 4.1) is the lead-only action.
create policy "foods_insert" on foods
  for insert to authenticated
  with check (is_house_member(house_id) and created_by = (current_member(house_id)).id);

create policy "foods_update" on foods
  for update to authenticated
  using (is_house_lead(house_id))
  with check (is_house_lead(house_id));

create policy "foods_delete" on foods
  for delete to authenticated
  using (is_house_lead(house_id));

create policy "meals_read" on meals
  for select to authenticated
  using (is_house_member(house_id));

create policy "meals_insert" on meals
  for insert to authenticated
  with check (is_house_member(house_id) and created_by = (current_member(house_id)).id);

create policy "meals_update" on meals
  for update to authenticated
  using (is_house_member(house_id) and (created_by = (current_member(house_id)).id or is_house_lead(house_id)))
  with check (is_house_member(house_id) and (created_by = (current_member(house_id)).id or is_house_lead(house_id)));

create policy "meals_delete" on meals
  for delete to authenticated
  using (is_house_member(house_id) and (created_by = (current_member(house_id)).id or is_house_lead(house_id)));

create policy "meal_items_read" on meal_items
  for select to authenticated
  using (is_house_member(house_id));

create policy "meal_items_write" on meal_items
  for insert to authenticated
  with check (exists (
    select 1 from meals m where m.id = meal_items.meal_id
      and is_house_member(m.house_id)
      and (m.created_by = (current_member(m.house_id)).id or is_house_lead(m.house_id))
  ));

create policy "meal_items_update" on meal_items
  for update to authenticated
  using (exists (
    select 1 from meals m where m.id = meal_items.meal_id
      and is_house_member(m.house_id)
      and (m.created_by = (current_member(m.house_id)).id or is_house_lead(m.house_id))
  ));

create policy "meal_items_delete" on meal_items
  for delete to authenticated
  using (exists (
    select 1 from meals m where m.id = meal_items.meal_id
      and is_house_member(m.house_id)
      and (m.created_by = (current_member(m.house_id)).id or is_house_lead(m.house_id))
  ));

create policy "meal_participants_read" on meal_participants
  for select to authenticated
  using (is_house_member(house_id));

create policy "meal_participants_write" on meal_participants
  for insert to authenticated
  with check (exists (
    select 1 from meals m where m.id = meal_participants.meal_id
      and is_house_member(m.house_id)
      and (m.created_by = (current_member(m.house_id)).id or is_house_lead(m.house_id))
  ));

create policy "meal_participants_update" on meal_participants
  for update to authenticated
  using (exists (
    select 1 from meals m where m.id = meal_participants.meal_id
      and is_house_member(m.house_id)
      and (m.created_by = (current_member(m.house_id)).id or is_house_lead(m.house_id))
  ));

create policy "meal_participants_delete" on meal_participants
  for delete to authenticated
  using (exists (
    select 1 from meals m where m.id = meal_participants.meal_id
      and is_house_member(m.house_id)
      and (m.created_by = (current_member(m.house_id)).id or is_house_lead(m.house_id))
  ));

-- food_preferences: the whole Home may read each other's ratings (section 5.1
-- — "anyone can rate any meal or any food, at any time"), a member writes only
-- their own.
create policy "food_prefs_read" on food_preferences
  for select to authenticated
  using (is_house_member(house_id));

create policy "food_prefs_write" on food_preferences
  for insert to authenticated
  with check (member_id = (current_member(house_id)).id and is_house_member(house_id));

create policy "food_prefs_update" on food_preferences
  for update to authenticated
  using (member_id = (current_member(house_id)).id)
  with check (member_id = (current_member(house_id)).id);

create policy "food_prefs_delete" on food_preferences
  for delete to authenticated
  using (member_id = (current_member(house_id)).id);

create policy "meal_plans_read" on meal_plans
  for select to authenticated
  using (is_house_member(house_id));

create policy "meal_plans_insert" on meal_plans
  for insert to authenticated
  with check (is_house_member(house_id) and created_by = (current_member(house_id)).id);

create policy "meal_plans_update" on meal_plans
  for update to authenticated
  using (is_house_member(house_id) and (created_by = (current_member(house_id)).id or is_house_lead(house_id)))
  with check (is_house_member(house_id) and (created_by = (current_member(house_id)).id or is_house_lead(house_id)));

create policy "meal_plans_delete" on meal_plans
  for delete to authenticated
  using (is_house_member(house_id) and (created_by = (current_member(house_id)).id or is_house_lead(house_id)));

create policy "shopping_items_read" on shopping_items
  for select to authenticated
  using (is_house_member(house_id));

create policy "shopping_items_insert" on shopping_items
  for insert to authenticated
  with check (is_house_member(house_id) and created_by = (current_member(house_id)).id);

create policy "shopping_items_update" on shopping_items
  for update to authenticated
  using (is_house_member(house_id))
  with check (is_house_member(house_id));

create policy "shopping_items_delete" on shopping_items
  for delete to authenticated
  using (is_house_member(house_id) and (created_by = (current_member(house_id)).id or is_house_lead(house_id)));

-- ---------------------------------------------------------------------------
-- create_meal — writes the meal, its items and its participants in one
-- transaction. Shares arrive precomputed (lib/domain/food/split.ts), the same
-- division of labour create_expense uses for expense_splits: the arithmetic
-- lives in TypeScript where it is unit- and property-tested, the database
-- enforces the sum invariant no matter who calls the RPC.
-- ---------------------------------------------------------------------------

create or replace function create_meal(
  p_house_id uuid,
  p_name text,
  p_meal_date date,
  p_shares jsonb,                     -- [{member_id, share_paise}] | [{guest_id,...}] | [{label,...}]
  p_meal_type meal_type default 'other',
  p_source meal_source default 'home_cooked',
  p_base_cost_paise bigint default 0,
  p_prep_cost_paise bigint default 0,
  p_delivery_cost_paise bigint default 0,
  p_other_cost_paise bigint default 0,
  p_food_id uuid default null,
  p_expense_id uuid default null,
  p_items jsonb default null,         -- [{name, quantity, cost_paise}]
  p_recipe_instructions text default null,
  p_photo_url text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meal_id uuid;
  v_creator_member_id uuid;
  v_total bigint;
  v_share jsonb;
  v_item jsonb;
begin
  if not is_house_member(p_house_id) then
    raise exception 'NOT_A_MEMBER';
  end if;
  v_creator_member_id := (current_member(p_house_id)).id;

  v_total := p_base_cost_paise + p_prep_cost_paise + p_delivery_cost_paise + p_other_cost_paise;

  insert into meals (
    house_id, name, meal_date, meal_type, source,
    base_cost_paise, prep_cost_paise, delivery_cost_paise, other_cost_paise, total_cost_paise,
    food_id, expense_id, recipe_instructions, photo_url, note, created_by
  ) values (
    p_house_id, p_name, p_meal_date, p_meal_type, p_source,
    p_base_cost_paise, p_prep_cost_paise, p_delivery_cost_paise, p_other_cost_paise, v_total,
    p_food_id, p_expense_id, p_recipe_instructions, p_photo_url, p_note, v_creator_member_id
  )
  returning id into v_meal_id;

  if p_items is not null then
    for v_item in select * from jsonb_array_elements(p_items) loop
      insert into meal_items (house_id, meal_id, name, quantity, cost_paise, sort_order)
      values (
        p_house_id, v_meal_id,
        v_item->>'name',
        v_item->>'quantity',
        nullif(v_item->>'cost_paise', '')::bigint,
        coalesce((v_item->>'sort_order')::int, 0)
      );
    end loop;
  end if;

  if p_shares is not null then
    for v_share in select * from jsonb_array_elements(p_shares) loop
      insert into meal_participants (house_id, meal_id, member_id, guest_id, label, share_paise)
      values (
        p_house_id, v_meal_id,
        nullif(v_share->>'member_id', '')::uuid,
        nullif(v_share->>'guest_id', '')::uuid,
        nullif(v_share->>'label', ''),
        coalesce((v_share->>'share_paise')::bigint, 0)
      );
    end loop;
  end if;

  if p_food_id is not null then
    update foods
       set times_eaten = times_eaten + 1,
           last_eaten_on = greatest(coalesce(last_eaten_on, p_meal_date), p_meal_date)
     where id = p_food_id;
  end if;

  return v_meal_id;
end;
$$;

grant execute on function create_meal(uuid, text, date, jsonb, meal_type, meal_source, bigint, bigint, bigint, bigint, uuid, uuid, jsonb, text, text, text) to authenticated, service_role;
