-- 082 — Food restrictions: the exclusions no score may outrank
--
-- A dislike is a weight in the recommendation score. A restriction is not.
-- Allergy, intolerance and an absolutely-held diet are the same concept with
-- different severities, so they are one table, per docs/15-FOOD-SPEC.md 5.2a.
--
-- The invariant this migration puts in the database, not only in application
-- code: a meal may not record a participant for whom one of its items is an
-- allergen. A service-role key bypasses RLS; it does not bypass this trigger.

create type restriction_severity as enum ('allergy', 'intolerance', 'diet');

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------

create table member_restrictions (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references houses(id) on delete cascade,
  member_id uuid not null references house_members(id) on delete cascade,
  -- What the person entered, kept verbatim so the interface can show it back.
  item_name text not null,
  -- Lowercased and stripped, for matching against meal_items.name and
  -- foods.name. Generated, so no writer can forget to normalise.
  canonical_item text generated always as (
    lower(regexp_replace(trim(item_name), '[^a-zA-Z0-9]+', ' ', 'g'))
  ) stored,
  severity restriction_severity not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restriction_item_not_blank check (length(trim(item_name)) > 0)
);

create unique index member_restrictions_unique_item
  on member_restrictions (member_id, canonical_item);
create index member_restrictions_house_idx
  on member_restrictions (house_id, member_id);
create index member_restrictions_canonical_idx
  on member_restrictions (house_id, canonical_item);

-- ---------------------------------------------------------------------------
-- RLS. A restriction is health information about one person.
--
-- It is readable by that person and by a dependent's guardian, and by nobody
-- else — not by a lead, not by the rest of the Home. The recommender and the
-- meal form read it through the security-definer functions below, which return
-- only what the caller needs (a filtered candidate set, or a conflict list) and
-- never the underlying rows.
-- ---------------------------------------------------------------------------

alter table member_restrictions enable row level security;

create or replace function owns_member_record(p_member_id uuid) returns boolean as $$
  select exists (
    select 1
      from house_members m
      left join house_members g on g.id = m.guardian_member_id
     where m.id = p_member_id
       and (
         m.user_id = auth.uid()
         or (m.member_kind = 'dependent' and g.user_id = auth.uid())
       )
  );
$$ language sql security definer stable set search_path = public;

create policy "member_restrictions_read_own" on member_restrictions
  for select to authenticated
  using (owns_member_record(member_id));

create policy "member_restrictions_insert_own" on member_restrictions
  for insert to authenticated
  with check (owns_member_record(member_id) and is_house_member(house_id));

create policy "member_restrictions_update_own" on member_restrictions
  for update to authenticated
  using (owns_member_record(member_id))
  with check (owns_member_record(member_id));

create policy "member_restrictions_delete_own" on member_restrictions
  for delete to authenticated
  using (owns_member_record(member_id));

-- ---------------------------------------------------------------------------
-- Matching
--
-- A meal conflicts with a participant when any of its items, its own name, or
-- its library food matches one of that participant's restricted items. Matching
-- is on the canonical form, and is containment in either direction so that
-- "peanut" catches "peanut oil" and "groundnut oil" catches "groundnut".
-- ---------------------------------------------------------------------------

create or replace function canonical_food_text(p_text text) returns text as $$
  select lower(regexp_replace(trim(coalesce(p_text, '')), '[^a-zA-Z0-9]+', ' ', 'g'));
$$ language sql immutable;

create or replace function meal_restriction_conflicts(p_meal_id uuid)
returns table (
  member_id uuid,
  item_name text,
  restricted_item text,
  severity restriction_severity
) as $$
  with meal_texts as (
    select canonical_food_text(mi.name) as txt, mi.name as shown
      from meal_items mi
     where mi.meal_id = p_meal_id
    union all
    select canonical_food_text(f.name), f.name
      from meals m
      join foods f on f.id = m.food_id
     where m.id = p_meal_id
    union all
    select canonical_food_text(m.name), m.name
      from meals m
     where m.id = p_meal_id
  )
  select p.member_id, t.shown, r.item_name, r.severity
    from meal_participants p
    join member_restrictions r on r.member_id = p.member_id
    join meal_texts t
      on t.txt like '%' || r.canonical_item || '%'
      or r.canonical_item like '%' || t.txt || '%'
   where p.meal_id = p_meal_id;
$$ language sql security definer stable set search_path = public;

-- The candidate filter the recommender uses. Given the people being served, it
-- returns the ids of foods that are safe for all of them. The restrictions
-- themselves never leave the function.
create or replace function foods_safe_for(p_house_id uuid, p_member_ids uuid[])
returns table (food_id uuid) as $$
  select f.id
    from foods f
   where f.house_id = p_house_id
     and not exists (
       select 1
         from member_restrictions r
        where r.member_id = any(p_member_ids)
          and (
            canonical_food_text(f.name) like '%' || r.canonical_item || '%'
            or r.canonical_item like '%' || canonical_food_text(f.name) || '%'
          )
     );
$$ language sql security definer stable set search_path = public;

-- ---------------------------------------------------------------------------
-- The invariant
--
-- Allergy severity blocks the write, from either side: adding the participant,
-- or adding the item to a meal they are already on. Intolerance and diet are
-- warnings, which belong in the interface rather than in a constraint.
--
-- Both triggers are deferred constraint triggers, so a single transaction that
-- builds a meal, its items and its participants is judged once, when it is
-- complete, rather than at whatever intermediate moment the rows happen to
-- arrive in.
-- ---------------------------------------------------------------------------

create or replace function reject_allergen_participation() returns trigger as $$
declare
  v_conflict record;
begin
  select c.member_id, c.item_name, c.restricted_item
    into v_conflict
    from meal_restriction_conflicts(new.meal_id) c
   where c.severity = 'allergy'
   limit 1;

  if found then
    raise exception 'FOOD_RESTRICTION_VIOLATION: member % is allergic to % (in %)',
      v_conflict.member_id, v_conflict.restricted_item, v_conflict.item_name
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create constraint trigger meal_participants_no_allergen
  after insert or update on meal_participants
  deferrable initially deferred
  for each row execute function reject_allergen_participation();

create constraint trigger meal_items_no_allergen
  after insert or update on meal_items
  deferrable initially deferred
  for each row execute function reject_allergen_participation();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on member_restrictions to authenticated, service_role;
grant execute on function owns_member_record(uuid) to authenticated, service_role;
grant execute on function canonical_food_text(text) to anon, authenticated, service_role;
grant execute on function meal_restriction_conflicts(uuid) to authenticated, service_role;
grant execute on function foods_safe_for(uuid, uuid[]) to authenticated, service_role;
