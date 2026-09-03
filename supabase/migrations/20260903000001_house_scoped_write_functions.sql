-- 20260903000001_house_scoped_write_functions.sql
--
-- Three caller-facing write functions decided for themselves which Home they
-- were writing to, by calling `current_member()` with no house id:
--
--   create_expense          books an expense and its splits
--   carry_forward_expense   books a correction into the open month
--   publish_schedule        writes a week's chore assignments
--
-- `current_member(p_house_id default null)` is
--
--   select * from house_members
--    where user_id = auth.uid() and status = 'active'
--      and (p_house_id is null or house_id = p_house_id)
--    order by joined_date desc limit 1
--
-- so with no house id it returns *an arbitrary one* of the caller's active
-- memberships — arbitrary in the strict sense, because members who joined on
-- the same day have no tiebreak at all.
--
-- With one membership each that is unambiguous, and every one of these
-- functions predates Homes. The moment somebody belongs to two, the same call
-- can:
--
--   * refuse work they are entitled to do — `publish_schedule` raised
--     ADMIN_REQUIRED for an admin of the selected Home because it had landed on
--     a different Home where they are an ordinary member; or
--   * do the work against the wrong Home — `create_expense` reads the category,
--     the approval threshold and the period from `v_me.house_id` and writes the
--     expense and its splits there. An expense logged in one household could be
--     charged to another.
--
-- The second is the one that matters, and it is silent: every row it writes is
-- internally consistent, just filed under the wrong house.
--
-- The API contract has always been that the Home comes from the caller's
-- selected Home and is re-checked against their memberships
-- (docs/05-API-SPEC.md section 1). These functions were the three places that
-- guessed instead. Now the Home is a parameter, resolved by the route from the
-- membership it already had in hand, and `current_member(p_house_id)` refuses
-- if the caller is not an active member of it.
--
-- The old signatures are dropped rather than left in place. A parameter with a
-- default would leave the arity-exact old call resolving to the old function,
-- and an un-updated caller would keep silently writing to the wrong Home; with
-- them gone it gets "function does not exist" instead. The precedent is
-- `publish_schedule_for_house`, which has taken the Home as its first argument
-- since the jobs needed it.

drop function if exists create_expense(uuid, bigint, date, split_basis, jsonb, text, uuid, text, text, boolean, text, uuid);
drop function if exists carry_forward_expense(uuid, bigint, date, split_basis, jsonb, text, uuid, text);
drop function if exists publish_schedule(date, jsonb, assignment_source, boolean, text, integer);

-- ---------------------------------------------------------------------------
-- create_expense
-- ---------------------------------------------------------------------------
create or replace function create_expense(
  p_house_id              uuid,
  p_category_id           uuid,
  p_amount_paise          bigint,
  p_expense_date          date,
  p_split_basis           split_basis,
  p_splits                jsonb,
  p_description           text default null,
  p_paid_by_member_id     uuid default null,
  p_receipt_url           text default null,
  p_period                text default null,
  p_is_adjustment         boolean default false,
  p_adjustment_for_period text default null,
  p_recurring_id          uuid default null
) returns uuid as $$
declare
  v_me         house_members;
  v_house_id   uuid;
  v_payer_id   uuid;
  v_period     text;
  v_period_id  uuid;
  v_threshold  bigint;
  v_status     expense_status;
  v_expense_id uuid;
begin
  -- The Home is named by the caller and checked here, rather than inferred.
  -- A Home the caller is not an active member of resolves to no row and is
  -- refused, which is the same answer a Home that does not exist gets.
  v_me := current_member(p_house_id);
  if v_me.id is null then
    raise exception 'NOT_HOUSE_MEMBER' using errcode = 'insufficient_privilege';
  end if;

  v_house_id := v_me.house_id;
  v_payer_id := coalesce(p_paid_by_member_id, v_me.id);

  -- BR-083 - the payer must be a member of this house.
  if not exists (select 1 from house_members
                  where id = v_payer_id and house_id = v_house_id) then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  if not exists (select 1 from expense_categories
                  where id = p_category_id and house_id = v_house_id) then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  v_period    := coalesce(p_period, to_char(p_expense_date, 'YYYY-MM'));
  v_period_id := ensure_period(v_house_id, v_period);

  if (select status from monthly_periods where id = v_period_id) = 'closed' then
    raise exception 'PERIOD_CLOSED' using errcode = 'check_violation';
  end if;

  -- BR-084 - above the threshold it waits for somebody else to approve it.
  select expense_approval_threshold_paise into v_threshold
    from house_settings where house_id = v_house_id;

  v_status := case
    when p_amount_paise > coalesce(v_threshold, 0) then 'pending_approval'::expense_status
    else 'approved'::expense_status
  end;

  insert into expenses (
    house_id, period_id, paid_by_member_id, category_id, amount_paise,
    description, expense_date, split_basis, status, receipt_url,
    is_adjustment, adjustment_for_period, recurring_id, created_by
  ) values (
    v_house_id, v_period_id, v_payer_id, p_category_id, p_amount_paise,
    nullif(trim(coalesce(p_description, '')), ''), p_expense_date, p_split_basis,
    v_status, nullif(trim(coalesce(p_receipt_url, '')), ''),
    p_is_adjustment, p_adjustment_for_period, p_recurring_id, v_me.id
  )
  returning id into v_expense_id;

  insert into expense_splits (house_id, expense_id, member_id, share_paise,
                              guest_share_paise, dependent_share_paise, basis_note)
  select v_house_id,
         v_expense_id,
         (row ->> 'member_id')::uuid,
         (row ->> 'share_paise')::bigint,
         coalesce((row ->> 'guest_share_paise')::bigint, 0),
         coalesce((row ->> 'dependent_share_paise')::bigint, 0),
         row ->> 'basis_note'
    from jsonb_array_elements(p_splits) as row;

  return v_expense_id;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- carry_forward_expense
-- ---------------------------------------------------------------------------
create or replace function carry_forward_expense(
  p_house_id          uuid,
  p_category_id       uuid,
  p_amount_paise      bigint,
  p_expense_date      date,
  p_split_basis       split_basis,
  p_splits            jsonb,
  p_description       text default null,
  p_paid_by_member_id uuid default null,
  p_receipt_url       text default null
) returns uuid as $$
declare
  v_me     house_members;
  v_period text;
begin
  v_me := current_member(p_house_id);
  if v_me.id is null then
    raise exception 'NOT_HOUSE_MEMBER' using errcode = 'insufficient_privilege';
  end if;

  -- The current month, in the house's timezone, is where it posts.
  select to_char((now() at time zone h.timezone)::date, 'YYYY-MM') into v_period
    from houses h where h.id = v_me.house_id;

  return create_expense(
    v_me.house_id,
    p_category_id, p_amount_paise, p_expense_date, p_split_basis, p_splits,
    p_description, p_paid_by_member_id, p_receipt_url,
    v_period, true, to_char(p_expense_date, 'YYYY-MM'), null
  );
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- publish_schedule
-- ---------------------------------------------------------------------------
create or replace function publish_schedule(
  p_house_id      uuid,
  p_week_start    date,
  p_assignments   jsonb,
  p_generator     assignment_source default 'engine',
  p_llm_accepted  boolean default null,
  p_llm_rationale text default null,
  p_max_deviation integer default 0
) returns uuid as $$
declare
  v_me     house_members;
  v_run_id uuid;
  v_total  integer;
  v_open   integer;
begin
  -- Admin *of the named Home*. Being an admin somewhere else is not a
  -- qualification to publish a week here, and being an ordinary member here is
  -- not a reason to refuse somebody who is an admin here.
  v_me := current_member(p_house_id);
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
    house_id, schedule_run_id, template_id, assignee_member_id, guest_id,
    chore_date, slot, window_start, window_end, deadline, effort_points,
    duration_min, status, source
  )
  select v_me.house_id, v_run_id,
         (row ->> 'template_id')::uuid,
         nullif(row ->> 'assignee_member_id', '')::uuid,
         nullif(row ->> 'guest_id', '')::uuid,
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

-- ---------------------------------------------------------------------------
-- Grants, matching 20260828090080_routine_grants.sql
-- ---------------------------------------------------------------------------
revoke execute on function create_expense(uuid, uuid, bigint, date, split_basis, jsonb, text, uuid, text, text, boolean, text, uuid) from public;
revoke execute on function carry_forward_expense(uuid, uuid, bigint, date, split_basis, jsonb, text, uuid, text) from public;
revoke execute on function publish_schedule(uuid, date, jsonb, assignment_source, boolean, text, integer) from public;

grant execute on function create_expense(uuid, uuid, bigint, date, split_basis, jsonb, text, uuid, text, text, boolean, text, uuid) to anon, authenticated, service_role;
grant execute on function carry_forward_expense(uuid, uuid, bigint, date, split_basis, jsonb, text, uuid, text) to anon, authenticated, service_role;
grant execute on function publish_schedule(uuid, date, jsonb, assignment_source, boolean, text, integer) to anon, authenticated, service_role;
