-- 048 — The operational tier: is_house_lead(), a role-less Requested state
--
-- Source: docs/04-DATABASE.md sections 4.1 and 7, docs/07-ROADMAP.md phase 10,
-- IMPLEMENTATION-PLAN-2.0 section 2.2.
--
-- Separate from 047 because Postgres refuses to reference an enum value added
-- by `alter type ... add value` in the same transaction. 047 adds 'co_admin';
-- this file is the first that may name it.

-- ---------------------------------------------------------------------------
-- The helper every governance policy from phase 11 onward will use
-- ---------------------------------------------------------------------------
-- Admin *or* Co-Admin. It ships now, with the enum value, so that no policy
-- written in phases 11-15 has to be back-patched onto it.
--
-- Like its two siblings it requires `status = 'active'`, which is the whole
-- implementation of HM-07's "a Requested person has no permissions of any
-- kind" — there is no second code path anywhere.
create or replace function is_house_lead(p_house_id uuid) returns boolean as $$
  select exists (
    select 1 from house_members
     where house_id = p_house_id
       and user_id  = auth.uid()
       and status   = 'active'
       and role in ('admin', 'co_admin')
  );
$$ language sql security definer stable set search_path = public;

-- ---------------------------------------------------------------------------
-- A Requested person has no role at all (HM-07)
-- ---------------------------------------------------------------------------
-- Until now a waiting person carried role 'member', which read as "an ordinary
-- member who happens not to be approved yet". That is precisely the confusion
-- the null removes: there is no role to have before acceptance.

-- Existing rows first, or the constraint below cannot be added.
update house_members set role = null where status = 'requested';

alter table house_members alter column role drop not null;
-- No default either. Every insert now states the role it means, and the one
-- insert that means "none yet" states null.
alter table house_members alter column role drop default;

-- Both directions, so neither a role on a Requested row nor a null role on an
-- Active one can exist. `=` between two booleans is the biconditional.
alter table house_members add constraint requested_has_no_role
  check ((status = 'requested') = (role is null));

-- ---------------------------------------------------------------------------
-- join_house, restated for the rename
-- ---------------------------------------------------------------------------
-- The live definition is migration 015's, and its body inserts the string
-- 'pending', which no longer exists. Function bodies are re-parsed at call
-- time, so this would have failed on the next join and on no earlier statement.
--
-- The function is retired outright in 049, when the invite-link flow that
-- replaces it lands. It is restated rather than dropped here so that this
-- migration leaves a schema that works on its own.
create or replace function join_house(p_invite_code text)
returns table (house_id uuid, house_name text, status member_status) as $$
declare
  v_user_id uuid := auth.uid();
  v_house   houses%rowtype;
  v_member  house_members%rowtype;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = 'insufficient_privilege';
  end if;

  select h.* into v_house
    from houses h
   where h.invite_code = upper(replace(trim(p_invite_code), '-', ''));

  if v_house.id is null then
    raise exception 'INVALID_INVITE_CODE' using errcode = 'no_data_found';
  end if;

  select m.* into v_member
    from house_members m
   where m.house_id = v_house.id
     and m.user_id  = v_user_id;

  if v_member.id is null then
    insert into house_members (house_id, user_id, role, status)
    values (v_house.id, v_user_id, null, 'requested')
    returning * into v_member;
  end if;

  return query select v_house.id, v_house.name, v_member.status;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- The lead write policies
-- ---------------------------------------------------------------------------
-- docs/04-DATABASE.md section 7 names the list exactly: chore_templates,
-- rooms, expense_categories, foods, invitations and the accept path on
-- join_requests. The last three arrive with their tables. `house_settings`
-- and `governance_policy` stay Admin-only, deliberately — a Co-Admin runs the
-- Home, they do not decide what kind of Home it is.

drop policy if exists admin_writes_templates on chore_templates;
create policy lead_writes_templates on chore_templates
  for all using (is_house_lead(house_id)) with check (is_house_lead(house_id));

drop policy if exists admin_writes_rooms on rooms;
create policy lead_writes_rooms on rooms
  for all using (is_house_lead(house_id)) with check (is_house_lead(house_id));

drop policy if exists admin_writes_categories on expense_categories;
create policy lead_writes_categories on expense_categories
  for all using (is_house_lead(house_id)) with check (is_house_lead(house_id));

-- Members: "admin for role, lead for the rest" (docs/05-API-SPEC.md 2.2). The
-- policy grants the write; the trigger below keeps role and status behind
-- Admin, because a policy cannot see the row's previous values.
drop policy if exists admin_writes_members on house_members;
create policy lead_writes_members on house_members
  for all using (is_house_lead(house_id)) with check (is_house_lead(house_id));

-- ---------------------------------------------------------------------------
-- The privileged-column trigger, restated
-- ---------------------------------------------------------------------------
-- Three changes from migration 011's version:
--   * `is distinct from`, because role is nullable now and `null <> null` is
--     null, which would have quietly let a role change through;
--   * the last-Admin guard, so a Home cannot be left with nobody who can
--     change its settings (docs/05-API-SPEC.md 2.2, `409 LAST_ADMIN`);
--   * nothing else. A `security definer` function still runs with the caller's
--     auth.uid(), so the accept and removal paths check their own authority.
create or replace function assert_member_field_privilege() returns trigger as $$
begin
  if (new.role      is distinct from old.role
      or new.status    is distinct from old.status
      or new.left_date is distinct from old.left_date)
     and not is_house_admin(old.house_id) then
    raise exception 'ADMIN_REQUIRED' using errcode = 'insufficient_privilege';
  end if;

  -- Losing the last active Admin locks the Home out of its own settings.
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
-- A dependent is created by a lead, not only by an Admin
-- ---------------------------------------------------------------------------
-- The documented exception to HM-06 (docs/05-API-SPEC.md 2.2): there is nobody
-- to send a link to. Restated whole, per D-19, from migration 035's definition;
-- the only changes are the Admin check becoming a lead check and the role now
-- being stated explicitly, because the column has no default any more.
-- Must drop first because Postgres refuses to change parameter defaults via
-- CREATE OR REPLACE FUNCTION (SQLSTATE 42P13).
drop function if exists add_dependent(uuid, text, uuid, boolean, boolean, residency_type);
create function add_dependent(
  p_house_id    uuid,
  p_name        text,
  p_guardian_id uuid,
  p_shares_cost boolean default false,
  p_does_chores boolean default false,
  p_residency   residency_type default 'full_time'
) returns house_members as $$
declare
  v_member house_members%rowtype;
begin
  if not is_house_lead(p_house_id) then
    raise exception 'LEAD_REQUIRED' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'NAME_REQUIRED' using errcode = 'check_violation';
  end if;

  if p_guardian_id is not null and not exists (
    select 1 from house_members
     where id = p_guardian_id and house_id = p_house_id and status = 'active'
  ) then
    raise exception 'GUARDIAN_NOT_FOUND' using errcode = 'foreign_key_violation';
  end if;

  insert into house_members (house_id, user_id, role, status, residency,
                             member_kind, shares_cost, does_chores,
                             guardian_member_id, display_name)
  values (p_house_id, null, 'member', 'active', p_residency,
          'dependent', p_shares_cost, p_does_chores,
          p_guardian_id, trim(p_name))
  returning * into v_member;

  return v_member;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function is_house_lead(uuid) to authenticated;
revoke execute on function is_house_lead(uuid) from public, anon;

grant execute on function add_dependent(uuid, text, uuid, boolean, boolean, residency_type)
  to authenticated;
