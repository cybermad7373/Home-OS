-- 028 — The chore lifecycle
--
-- ASSIGNED → DONE_PENDING → CONFIRMED is the path points travel. Every other
-- transition is a way that path can fail, and each one is a separate function
-- so that the rule about who may perform it lives in one place.
--
-- The scheduling arithmetic is not here. Demand, targets, constraints and the
-- solver are pure TypeScript in lib/domain/scheduling, property-tested without
-- a database. These functions store what it decides and police the lifecycle.

/** The Monday on or before a date. Every week in the system starts on one. */
create or replace function week_start_of(p_date date) returns date as $$
  select (p_date - (extract(isodow from p_date)::int - 1))::date;
$$ language sql immutable;

/**
 * The assignee marks it done. Points do not move yet — they move on
 * confirmation, which somebody else has to give.
 */
create or replace function mark_chore_done(p_assignment_id uuid, p_photo_url text default null)
returns assignment_status as $$
declare
  v_assignment chore_assignments;
  v_me         house_members;
begin
  select a.* into v_assignment from chore_assignments a where a.id = p_assignment_id;
  if v_assignment.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  v_me := current_member(v_assignment.house_id);
  if v_me.id is null then
    raise exception 'NOT_HOUSE_MEMBER' using errcode = 'insufficient_privilege';
  end if;
  if v_assignment.assignee_member_id is distinct from v_me.id then
    raise exception 'NOT_ASSIGNEE' using errcode = 'insufficient_privilege';
  end if;
  if v_assignment.status not in ('assigned', 'rejected') then
    raise exception 'WRONG_STATE' using errcode = 'check_violation';
  end if;

  update chore_assignments a
     set status    = 'done_pending',
         done_at   = now(),
         photo_url = coalesce(p_photo_url, a.photo_url)
   where a.id = p_assignment_id;

  return 'done_pending'::assignment_status;
end;
$$ language plpgsql security definer set search_path = public;

/**
 * A peer confirms, and the points post.
 *
 * The self-confirmation ban is a check constraint on the table; this raises the
 * friendlier error before the constraint has to. Mandatory peer confirmation
 * with no timeout would hand non-participants a veto — they simply never tap
 * approve — which is why the auto-confirm job exists alongside this.
 */
create or replace function confirm_chore(p_assignment_id uuid)
returns assignment_status as $$
declare
  v_assignment chore_assignments;
  v_me         house_members;
begin
  select a.* into v_assignment from chore_assignments a where a.id = p_assignment_id;
  if v_assignment.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  v_me := current_member(v_assignment.house_id);
  if v_me.id is null then
    raise exception 'NOT_HOUSE_MEMBER' using errcode = 'insufficient_privilege';
  end if;
  if v_me.id = v_assignment.assignee_member_id then
    raise exception 'SELF_CONFIRM' using errcode = 'check_violation';
  end if;
  if v_assignment.status <> 'done_pending' then
    raise exception 'WRONG_STATE' using errcode = 'check_violation';
  end if;

  update chore_assignments a
     set status       = 'confirmed',
         confirmed_by = v_me.id,
         confirmed_at = now()
   where a.id = p_assignment_id;

  return 'confirmed'::assignment_status;
end;
$$ language plpgsql security definer set search_path = public;

/**
 * A peer rejects it. One retry, with the deadline pushed a day; a second
 * failure is a miss and earns nothing.
 */
create or replace function reject_chore(p_assignment_id uuid, p_reason text)
returns assignment_status as $$
declare
  v_assignment chore_assignments;
  v_me         house_members;
  v_next       assignment_status;
begin
  select a.* into v_assignment from chore_assignments a where a.id = p_assignment_id;
  if v_assignment.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  v_me := current_member(v_assignment.house_id);
  if v_me.id is null then
    raise exception 'NOT_HOUSE_MEMBER' using errcode = 'insufficient_privilege';
  end if;
  if v_me.id = v_assignment.assignee_member_id then
    raise exception 'SELF_REJECT' using errcode = 'check_violation';
  end if;
  if v_assignment.status <> 'done_pending' then
    raise exception 'WRONG_STATE' using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'REASON_REQUIRED' using errcode = 'check_violation';
  end if;

  v_next := case when v_assignment.retry_count >= 1 then 'missed' else 'rejected' end;

  update chore_assignments a
     set status          = v_next,
         rejected_by     = v_me.id,
         rejected_reason = p_reason,
         retry_count     = a.retry_count + 1,
         done_at         = null,
         deadline        = case when v_next = 'rejected'
                                then a.deadline + interval '1 day'
                                else a.deadline end
   where a.id = p_assignment_id;

  return v_next;
end;
$$ language plpgsql security definer set search_path = public;

/** Give it up to the pool. Anybody may then claim it. */
create or replace function release_chore(p_assignment_id uuid)
returns assignment_status as $$
declare
  v_assignment chore_assignments;
  v_me         house_members;
begin
  select a.* into v_assignment from chore_assignments a where a.id = p_assignment_id;
  if v_assignment.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  v_me := current_member(v_assignment.house_id);
  if v_me.id is null then
    raise exception 'NOT_HOUSE_MEMBER' using errcode = 'insufficient_privilege';
  end if;
  if v_assignment.assignee_member_id is distinct from v_me.id and v_me.role <> 'admin' then
    raise exception 'NOT_ASSIGNEE' using errcode = 'insufficient_privilege';
  end if;
  if v_assignment.status not in ('assigned', 'rejected') then
    raise exception 'WRONG_STATE' using errcode = 'check_violation';
  end if;

  update chore_assignments a
     set status = 'open', assignee_member_id = null, source = 'marketplace'
   where a.id = p_assignment_id;

  return 'open'::assignment_status;
end;
$$ language plpgsql security definer set search_path = public;

/** Take one out of the pool. First to claim it gets it. */
create or replace function claim_chore(p_assignment_id uuid)
returns assignment_status as $$
declare
  v_assignment chore_assignments;
  v_me         house_members;
  v_updated    integer;
begin
  select a.* into v_assignment from chore_assignments a where a.id = p_assignment_id;
  if v_assignment.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  v_me := current_member(v_assignment.house_id);
  if v_me.id is null then
    raise exception 'NOT_HOUSE_MEMBER' using errcode = 'insufficient_privilege';
  end if;

  -- The status check is inside the UPDATE, not before it: two people tapping
  -- claim at the same instant must not both succeed.
  update chore_assignments a
     set status = 'assigned', assignee_member_id = v_me.id, source = 'marketplace'
   where a.id = p_assignment_id
     and a.status = 'open';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'ALREADY_CLAIMED' using errcode = 'check_violation';
  end if;

  return 'assigned'::assignment_status;
end;
$$ language plpgsql security definer set search_path = public;

/** Ask somebody specific to take it. They have to accept. */
create or replace function request_swap(
  p_assignment_id uuid,
  p_to_member_id  uuid,
  p_message       text default null
) returns uuid as $$
declare
  v_assignment chore_assignments;
  v_me         house_members;
  v_swap_id    uuid;
begin
  select a.* into v_assignment from chore_assignments a where a.id = p_assignment_id;
  if v_assignment.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  v_me := current_member(v_assignment.house_id);
  if v_me.id is null then
    raise exception 'NOT_HOUSE_MEMBER' using errcode = 'insufficient_privilege';
  end if;
  if v_assignment.assignee_member_id is distinct from v_me.id then
    raise exception 'NOT_ASSIGNEE' using errcode = 'insufficient_privilege';
  end if;
  if v_assignment.status <> 'assigned' then
    raise exception 'WRONG_STATE' using errcode = 'check_violation';
  end if;
  if p_to_member_id = v_me.id then
    raise exception 'SWAP_TO_SELF' using errcode = 'check_violation';
  end if;

  insert into swap_requests (house_id, assignment_id, from_member_id, to_member_id, message)
  values (v_assignment.house_id, p_assignment_id, v_me.id, p_to_member_id, p_message)
  returning id into v_swap_id;

  return v_swap_id;
end;
$$ language plpgsql security definer set search_path = public;

/** Accept or decline. Accepting moves the assignment, not the points. */
create or replace function respond_to_swap(p_swap_id uuid, p_accept boolean)
returns swap_status as $$
declare
  v_swap swap_requests;
  v_me   house_members;
begin
  select s.* into v_swap from swap_requests s where s.id = p_swap_id;
  if v_swap.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  v_me := current_member(v_swap.house_id);
  if v_me.id is null or v_me.id <> v_swap.to_member_id then
    raise exception 'NOT_YOUR_RECORD' using errcode = 'insufficient_privilege';
  end if;
  if v_swap.status <> 'pending' then
    raise exception 'WRONG_STATE' using errcode = 'check_violation';
  end if;

  update swap_requests s
     set status = case when p_accept then 'accepted' else 'declined' end,
         responded_at = now()
   where s.id = p_swap_id;

  if p_accept then
    update chore_assignments a
       set assignee_member_id = v_me.id, source = 'swap'
     where a.id = v_swap.assignment_id
       and a.status = 'assigned';
  end if;

  return case when p_accept then 'accepted' else 'declined' end::swap_status;
end;
$$ language plpgsql security definer set search_path = public;

/**
 * Publishes a generated week.
 *
 * p_assignments is [{ template_id, assignee_member_id, chore_date, slot,
 *                     window_start, window_end, deadline, effort_points,
 *                     duration_min, status }]
 *
 * NFR-11: re-running the generator for a week that already has one replaces
 * only what is still outstanding. Confirmed and done work is never touched —
 * regenerating a week must not take away points somebody already earned.
 */
create or replace function publish_schedule(
  p_week_start   date,
  p_assignments  jsonb,
  p_generator    assignment_source default 'engine',
  p_llm_accepted boolean default null,
  p_llm_rationale text default null,
  p_max_deviation integer default 0
) returns uuid as $$
declare
  v_me     house_members;
  v_run_id uuid;
  v_total  integer;
  v_open   integer;
begin
  v_me := current_member();
  if v_me.id is null or v_me.role <> 'admin' then
    raise exception 'ADMIN_REQUIRED' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(sum((row ->> 'effort_points')::int), 0),
         count(*) filter (where row ->> 'status' = 'open')
    into v_total, v_open
    from jsonb_array_elements(p_assignments) as row;

  insert into schedule_runs (house_id, week_start, generator, llm_accepted,
                             llm_rationale, total_points, unassigned_count,
                             max_deviation)
  values (v_me.house_id, p_week_start, p_generator, p_llm_accepted,
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

  -- Only outstanding work is replaced. Anything done, pending confirmation or
  -- confirmed survives regeneration untouched.
  delete from chore_assignments a
   where a.house_id = v_me.house_id
     and a.chore_date >= p_week_start
     and a.chore_date <  p_week_start + 7
     and a.status in ('assigned', 'open');

  insert into chore_assignments (
    house_id, schedule_run_id, template_id, assignee_member_id, chore_date, slot,
    window_start, window_end, deadline, effort_points, duration_min, status, source
  )
  select v_me.house_id, v_run_id,
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

/**
 * Default chore templates, created with the house (docs/09-BUSINESS-RULES.md
 * section 5). 787 points a week, which for eight members is about 98 each —
 * roughly one substantial chore a day. The admin is shown that figure during
 * setup and told to adjust it if it looks wrong for their house.
 */
create or replace function seed_default_chore_templates(p_house_id uuid) returns void as $$
  insert into chore_templates (house_id, name, category, effort_points, duration_min,
                               slot, frequency, times_per_week,
                               requires_cooking_skill, is_heavy)
  values
    (p_house_id, 'Cook dinner',       'cooking',           30, 60, 'evening', 'daily',          null, true,  false),
    (p_house_id, 'Cook breakfast',    'cooking',           20, 40, 'morning', 'daily',          null, true,  false),
    (p_house_id, 'Clean kitchen',     'kitchen_cleaning',  20, 30, 'evening', 'daily',          null, false, false),
    (p_house_id, 'Wash dishes',       'kitchen_cleaning',  15, 25, 'evening', 'daily',          null, false, false),
    (p_house_id, 'Clean bathroom',    'bathroom_cleaning', 25, 30, 'any',     'times_per_week', 2,    false, true),
    (p_house_id, 'Mop common area',   'mopping',           15, 20, 'morning', 'times_per_week', 3,    false, false),
    (p_house_id, 'Clean common area', 'common_cleaning',   12, 20, 'any',     'times_per_week', 3,    false, false),
    (p_house_id, 'Take out rubbish',  'other',              5,  5, 'evening', 'daily',          null, false, false)
  on conflict do nothing;
$$ language sql security definer set search_path = public;

-- House creation seeds the chore templates too, so a new house can generate a
-- schedule the day it is created rather than after an evening of configuration.
create or replace function create_house(
  p_name     text,
  p_address  text default null,
  p_timezone text default 'Asia/Kolkata',
  p_currency text default 'INR'
) returns table (house_id uuid, invite_code text) as $$
declare
  v_user_id uuid := auth.uid();
  v_house   houses%rowtype;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = 'insufficient_privilege';
  end if;

  insert into houses (name, address, timezone, currency, invite_code, created_by)
  values (trim(p_name), nullif(trim(coalesce(p_address, '')), ''),
          p_timezone, p_currency, generate_invite_code(), v_user_id)
  returning * into v_house;

  insert into house_settings (house_id) values (v_house.id);

  insert into house_members (house_id, user_id, role, status)
  values (v_house.id, v_user_id, 'admin', 'active');

  perform seed_default_categories(v_house.id);
  perform seed_default_chore_templates(v_house.id);

  return query select v_house.id, v_house.invite_code;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function week_start_of(date)                        to authenticated;
grant execute on function mark_chore_done(uuid, text)                to authenticated;
grant execute on function confirm_chore(uuid)                        to authenticated;
grant execute on function reject_chore(uuid, text)                   to authenticated;
grant execute on function release_chore(uuid)                        to authenticated;
grant execute on function claim_chore(uuid)                          to authenticated;
grant execute on function request_swap(uuid, uuid, text)             to authenticated;
grant execute on function respond_to_swap(uuid, boolean)             to authenticated;
grant execute on function publish_schedule(date, jsonb, assignment_source, boolean, text, integer)
                                                                     to authenticated;
grant execute on function create_house(text, text, text, text)       to authenticated;
revoke execute on function seed_default_chore_templates(uuid) from anon, authenticated;
