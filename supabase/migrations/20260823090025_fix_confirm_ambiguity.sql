-- 025 — Fix the last ambiguous OUT parameter, and stop the pattern recurring
--
-- Third instance of the same defect: `returns table (status settlement_status,
-- ...)` puts `status` in scope for the whole body, and the remaining-payments
-- query read `where status <> 'confirmed'` against settlements. 42702 again,
-- again only at run time.
--
-- Every `returns table` function in the schema has now been audited:
--
--   join_house              — fixed in 015
--   period_close_readiness  — fixed in 024
--   confirm_settlement      — fixed here
--   create_house            — checked: its OUT names (house_id, invite_code)
--                             appear only in INSERT column lists, which are
--                             never ambiguous
--
-- The rule from here: name OUT parameters so they cannot collide with a column,
-- and qualify every column reference regardless.

drop function if exists confirm_settlement(uuid);

create function confirm_settlement(p_settlement_id uuid)
returns table (settlement_status_now settlement_status, period_locked boolean) as $$
declare
  v_settlement settlements;
  v_me         house_members;
  v_remaining  integer;
  v_locked     boolean := false;
begin
  select s.* into v_settlement from settlements s where s.id = p_settlement_id;
  if v_settlement.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  v_me := current_member(v_settlement.house_id);
  if v_me.id is null then
    raise exception 'NOT_HOUSE_MEMBER' using errcode = 'insufficient_privilege';
  end if;
  -- BR-109 — only the person being paid may say the money arrived.
  if v_me.id <> v_settlement.to_member_id then
    raise exception 'NOT_THE_PAYEE' using errcode = 'insufficient_privilege';
  end if;

  update settlements s
     set status = 'confirmed', confirmed_at = now()
   where s.id = p_settlement_id;

  select count(*)::integer into v_remaining
    from settlements s
   where s.period_id = v_settlement.period_id
     and s.status   <> 'confirmed';

  -- BR-105 — the month locks on the last confirmation, not on a timer.
  if v_remaining = 0 then
    update monthly_periods p
       set status = 'closed', locked_at = now()
     where p.id = v_settlement.period_id;
    v_locked := true;
  end if;

  return query select 'confirmed'::settlement_status, v_locked;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function confirm_settlement(uuid) to authenticated;
