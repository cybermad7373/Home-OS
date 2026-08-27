-- 050 — Leaving a Home with money still on the table
--
-- Source: docs/04-DATABASE.md section 4.1 (HM-13, HM-14), DECISIONS.md D-45,
-- docs/07-ROADMAP.md phase 10.
--
-- Removal used to be one update: status becomes 'inactive', left_date becomes
-- today, and the person is gone. That is wrong whenever they still owe the
-- Home or the Home still owes them — an Inactive member who is nobody's payer
-- and nobody's payee is a settlement quietly written off.
--
-- So removal becomes two states. `pending_settlement` says the decision has
-- been made and the money has not moved. The member stays in the settlement,
-- stays visible in their own group in the member list with the amount stated,
-- and stops being scheduled work. A daily job finishes the removal on the day
-- the last payment is confirmed, so nobody has to remember to come back.

alter table house_members
  -- The decision that ordered the removal. The foreign key to `decisions`
  -- arrives with that table in phase 11 — the column ships now because the
  -- job below is what phase 11's remove_member effect will set it for.
  add column removal_decision_id uuid,
  add column pending_settlement  boolean not null default false;

create index idx_members_pending_settlement on house_members(house_id)
  where pending_settlement;

-- ---------------------------------------------------------------------------
-- Is this member financially clear?
-- ---------------------------------------------------------------------------
-- Clear means: no settlement on either side of them is still open. A
-- 'marked_paid' row is not clear — the payee has not agreed the money arrived,
-- and BR-109 says only they may say so.
create or replace function member_is_financially_clear(p_member_id uuid)
returns boolean as $$
  select not exists (
    select 1 from settlements s
     where (s.from_member_id = p_member_id or s.to_member_id = p_member_id)
       and s.status <> 'confirmed'
  );
$$ language sql security definer stable set search_path = public;

-- ---------------------------------------------------------------------------
-- Begin a removal (D-45)
-- ---------------------------------------------------------------------------
-- Called by phase 11's `remove_member` decision effect, and by nothing a
-- client can reach: `execute` is granted to no role at all, so only the
-- service role and other security-definer functions may call it.
--
-- Whether it finishes today or waits is the function's decision, not the
-- caller's, so there is one implementation of "what does removal mean".
create or replace function begin_member_removal(
  p_member_id   uuid,
  p_decision_id uuid default null
) returns house_members as $$
declare
  v_member house_members%rowtype;
  v_clear  boolean;
begin
  select * into v_member from house_members where id = p_member_id;
  if v_member.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if v_member.status = 'inactive' then
    return v_member;
  end if;

  v_clear := member_is_financially_clear(p_member_id);

  -- The privileged-column trigger asks `is_house_admin`, which reads
  -- auth.uid(). A cron run has no auth.uid() and a decision effect acts for
  -- the Home rather than for whoever happened to cast the last response, so
  -- either would be refused. The flag below is transaction-local — the `true`
  -- third argument — and says "this update has already been authorised by the
  -- path that set it". It is set nowhere else.
  perform set_config('app.member_write_authorised', 'on', true);

  update house_members
     set status              = 'inactive',
         left_date           = coalesce(left_date, current_date),
         pending_settlement  = not v_clear,
         removal_decision_id = coalesce(p_decision_id, removal_decision_id)
   where id = p_member_id
  returning * into v_member;

  return v_member;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- The daily job that finishes what the decision started
-- ---------------------------------------------------------------------------
-- Returns the number of removals it completed, so the run is legible in the
-- cron log rather than being a silent no-op every day for three weeks.
create or replace function complete_pending_removals() returns integer as $$
declare v_count integer;
begin
  with cleared as (
    update house_members m
       set pending_settlement = false
     where m.pending_settlement
       and member_is_financially_clear(m.id)
    returning m.id
  )
  select count(*)::integer into v_count from cleared;

  return v_count;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- The privileged-column trigger learns about the authorised path
-- ---------------------------------------------------------------------------
-- Restated whole from 048, per D-19. The single change is the first clause:
-- an update that set `app.member_write_authorised` skips the Admin check,
-- because it has already been authorised by a decision or by the removal job.
-- The setting is transaction-local, so it cannot leak into the next statement
-- on a pooled connection, and no client can set it — `set_config` is reachable
-- only from inside the security-definer functions that use it.
create or replace function assert_member_field_privilege() returns trigger as $$
begin
  if coalesce(current_setting('app.member_write_authorised', true), 'off') <> 'on' then
    if (new.role      is distinct from old.role
        or new.status    is distinct from old.status
        or new.left_date is distinct from old.left_date)
       and not is_house_admin(old.house_id) then
      raise exception 'ADMIN_REQUIRED' using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- The last-Admin guard holds on every path, authorised or not. A Home with
  -- no Admin cannot change its own settings, and no decision should be able to
  -- produce that state either.
  if old.role = 'admin' and old.status = 'active'
     and not (new.role = 'admin' and new.status = 'active')
     and not exists (
       select 1 from house_members other
        where other.house_id = old.house_id
          and other.id      <> old.id
          and other.role     = 'admin'
          and other.status   = 'active'
     ) then
    raise exception 'LAST_ADMIN' using errcode = 'check_violation';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- The caller-facing removal, until phase 11 puts it behind a decision
-- ---------------------------------------------------------------------------
-- `begin_member_removal` above takes a decision id and asks nobody's
-- permission, because its caller is either a decision effect or a cron job.
-- This is the wrapper a person reaches, and it checks Admin the way the
-- shipped `PATCH /api/members/:id` did.
--
-- Phase 11 replaces this with a `remove_member` decision (R-3). The route that
-- calls it becomes a proposer and this function is dropped; the two-state
-- removal underneath it does not change.
create or replace function remove_member(p_member_id uuid) returns house_members as $$
declare v_member house_members%rowtype;
begin
  select * into v_member from house_members where id = p_member_id;
  if v_member.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if not is_house_admin(v_member.house_id) then
    raise exception 'ADMIN_REQUIRED' using errcode = 'insufficient_privilege';
  end if;

  return begin_member_removal(p_member_id, null);
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function remove_member(uuid)                to authenticated;
revoke execute on function begin_member_removal(uuid, uuid)  from anon, authenticated;
revoke execute on function complete_pending_removals()       from anon, authenticated;
revoke execute on function member_is_financially_clear(uuid) from anon;

-- 06:00 IST, an hour after the settlement reminders have run and any payment
-- confirmed overnight has landed.
select cron.unschedule('complete-pending-removals')
 where exists (select 1 from cron.job where jobname = 'complete-pending-removals');

select cron.schedule('complete-pending-removals', '30 0 * * *',
                     $$select complete_pending_removals()$$);
