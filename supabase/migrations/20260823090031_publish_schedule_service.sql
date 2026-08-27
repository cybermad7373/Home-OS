-- 031 — Publishing a schedule from a scheduled job
--
-- `publish_schedule` resolves the house from `current_member()` and refuses a
-- caller who is not an admin of it. A cron-driven Edge Function carries no JWT,
-- so `current_member()` is null and that check can never pass.
--
-- Weakening the check — treating a null member as a trusted caller — would turn
-- a clear authorisation rule into one with an exception, and the exception is
-- precisely what an attacker would aim for. Instead the job gets its own
-- entry point that takes the house explicitly and is not granted to anon or
-- authenticated at all.
--
-- The body below is `publish_schedule`'s, with the house passed in rather than
-- derived. Keep the two in step: a change to one is almost always a change to
-- both.

create or replace function publish_schedule_for_house(
  p_house_id      uuid,
  p_week_start    date,
  p_assignments   jsonb,
  p_generator     assignment_source default 'engine',
  p_llm_accepted  boolean default null,
  p_llm_rationale text default null,
  p_max_deviation integer default 0
) returns uuid as $$
declare
  v_run_id uuid;
  v_total  integer;
  v_open   integer;
begin
  if p_house_id is null then
    raise exception 'HOUSE_REQUIRED' using errcode = 'invalid_parameter_value';
  end if;

  select coalesce(sum((row ->> 'effort_points')::int), 0),
         count(*) filter (where row ->> 'status' = 'open')
    into v_total, v_open
    from jsonb_array_elements(p_assignments) as row;

  insert into schedule_runs (house_id, week_start, generator, llm_accepted,
                             llm_rationale, total_points, unassigned_count,
                             max_deviation)
  values (p_house_id, p_week_start, p_generator, p_llm_accepted,
          p_llm_rationale, v_total, v_open, p_max_deviation)
  on conflict (house_id, week_start) do update
    set generated_at     = now(),
        generator        = excluded.generator,
        llm_accepted     = excluded.llm_accepted,
        llm_rationale    = excluded.llm_rationale,
        total_points     = excluded.total_points,
        unassigned_count = excluded.unassigned_count,
        max_deviation    = excluded.max_deviation
  returning id into v_run_id;

  -- Only outstanding work is replaced (D-12). Anything done, pending
  -- confirmation or confirmed survives regeneration untouched, because a
  -- regenerated week must never take away points somebody already earned.
  delete from chore_assignments a
   where a.house_id = p_house_id
     and a.chore_date >= p_week_start
     and a.chore_date <  p_week_start + 7
     and a.status in ('assigned', 'open');

  insert into chore_assignments (
    house_id, schedule_run_id, template_id, assignee_member_id, chore_date, slot,
    window_start, window_end, deadline, effort_points, duration_min, status, source
  )
  select p_house_id, v_run_id,
         (row ->> 'template_id')::uuid,
         nullif(row ->> 'assignee_member_id', '')::uuid,
         (row ->> 'chore_date')::date,
         (row ->> 'slot')::chore_slot,
         (row ->> 'window_start')::timestamptz,
         (row ->> 'window_end')::timestamptz,
         (row ->> 'deadline')::timestamptz,
         (row ->> 'effort_points')::int,
         coalesce((row ->> 'duration_min')::int, 30),
         coalesce((row ->> 'status')::assignment_status, 'assigned'),
         p_generator
    from jsonb_array_elements(p_assignments) as row;

  return v_run_id;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function publish_schedule_for_house(
  uuid, date, jsonb, assignment_source, boolean, text, integer
) from anon, authenticated;
