-- 024 — Fix an ambiguous column reference in period_close_readiness
--
-- Same shape of mistake as migration 015: `returns table (..., status
-- period_status)` puts `status` in scope for the whole body, and the query then
-- read `where status = 'pending_approval'` against expenses. Postgres could not
-- tell the OUT parameter from the column: 42702.
--
-- It only bit when the function actually ran, which is why the fix arrives with
-- the first end-to-end close rather than at push time. Every column reference
-- is now table-qualified.
--
-- The lesson, applied from here on: in a `returns table` function, qualify
-- every column, or name the OUT parameters so they cannot collide.

-- Renaming an OUT column changes the return type, and Postgres will not let
-- `create or replace` do that. The function has to go first.
drop function if exists period_close_readiness(uuid);

create function period_close_readiness(p_period_id uuid)
returns table (pending_approvals integer, month_ended boolean, period_status_now period_status)
as $$
declare
  v_period monthly_periods;
  v_tz     text;
  v_today  date;
  v_count  integer;
begin
  select p.* into v_period from monthly_periods p where p.id = p_period_id;
  if v_period.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  select h.timezone into v_tz from houses h where h.id = v_period.house_id;
  v_today := (now() at time zone coalesce(v_tz, 'UTC'))::date;

  select count(*)::integer into v_count
    from expenses e
   where e.period_id = p_period_id
     and e.status    = 'pending_approval';

  return query
  select
    v_count,
    -- BR-103: the month's last day must have passed.
    v_today > (to_date(v_period.period || '-01', 'YYYY-MM-DD')
               + interval '1 month' - interval '1 day')::date,
    v_period.status;
end;
$$ language plpgsql security definer set search_path = public;

-- close_period reads month_ended from it; the column name it selects is
-- unchanged, so only the function above needed replacing.
grant execute on function period_close_readiness(uuid) to authenticated;
