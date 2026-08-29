-- 086 — Merging two library entries (section 4.1), Admin/Co-Admin only.
--
-- Rewrites every reference from the source entry to the target, keeping both
-- original names in History (meals.name is snapshotted and untouched by this).
-- The one place a plain rewrite is not safe is food_preferences: a member who
-- already rated the target keeps that rating rather than having the source's
-- opinion silently overwrite it, because a merge is about the food, not about
-- whose vote wins.

create or replace function merge_food_entries(p_source_id uuid, p_target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_house_id uuid;
  v_target_house_id uuid;
  v_source_times_eaten integer;
  v_source_last_eaten date;
begin
  if p_source_id = p_target_id then
    raise exception 'VALIDATION_FAILED';
  end if;

  select house_id, times_eaten, last_eaten_on
    into v_house_id, v_source_times_eaten, v_source_last_eaten
    from foods where id = p_source_id;
  select house_id into v_target_house_id from foods where id = p_target_id;

  if v_house_id is null or v_target_house_id is null or v_house_id <> v_target_house_id then
    raise exception 'FOOD_NOT_FOUND';
  end if;

  if not is_house_lead(v_house_id) then
    raise exception 'LEAD_REQUIRED';
  end if;

  update meals set food_id = p_target_id where food_id = p_source_id;
  update meal_items set food_id = p_target_id where food_id = p_source_id;
  update meal_plans set food_id = p_target_id where food_id = p_source_id;

  -- A member who already rated the target keeps that rating; the source's
  -- row only moves when there is no conflict.
  update food_preferences
     set food_id = p_target_id
   where food_id = p_source_id
     and member_id not in (
       select member_id from food_preferences where food_id = p_target_id
     );
  delete from food_preferences where food_id = p_source_id;

  update foods
     set times_eaten = times_eaten + coalesce(v_source_times_eaten, 0),
         last_eaten_on = greatest(coalesce(last_eaten_on, v_source_last_eaten), coalesce(v_source_last_eaten, last_eaten_on))
   where id = p_target_id;

  update foods
     set active = false,
         merged_into_id = p_target_id
   where id = p_source_id;
end;
$$;

grant execute on function merge_food_entries(uuid, uuid) to authenticated, service_role;
