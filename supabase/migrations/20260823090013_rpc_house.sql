-- 013 — House lifecycle functions
--
-- Creating a house and joining one are both chicken-and-egg problems for RLS:
-- the caller is not yet a member of the house they are about to create, and a
-- joiner cannot read the house row they are looking up by code. Both run as
-- `security definer` functions with a narrow, audited job instead of widening
-- any policy.

-- BR-008  Six characters from an alphabet with no O, 0, I or 1.
create or replace function generate_invite_code() returns text as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_try  integer := 0;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from houses where invite_code = v_code);
    v_try := v_try + 1;
    if v_try > 50 then
      raise exception 'could not allocate a unique invite code';
    end if;
  end loop;
  return v_code;
end;
$$ language plpgsql;

-- Creates the house, its settings row and the caller's admin membership in one
-- transaction. Returns the house and its invite code.
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

  return query select v_house.id, v_house.invite_code;
end;
$$ language plpgsql security definer set search_path = public;

-- Joining creates a `pending` membership. Possession of a code never grants
-- access on its own (SEC-08) — an admin still has to approve.
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

  select * into v_house from houses
   where invite_code = upper(replace(trim(p_invite_code), '-', ''));

  if v_house.id is null then
    raise exception 'INVALID_INVITE_CODE' using errcode = 'no_data_found';
  end if;

  select * into v_member from house_members
   where house_id = v_house.id and user_id = v_user_id;

  if v_member.id is null then
    insert into house_members (house_id, user_id, role, status)
    values (v_house.id, v_user_id, 'member', 'pending')
    returning * into v_member;
  end if;

  return query select v_house.id, v_house.name, v_member.status;
end;
$$ language plpgsql security definer set search_path = public;

-- BR-009  Regenerating invalidates the previous code immediately.
create or replace function regenerate_invite_code(p_house_id uuid) returns text as $$
declare v_code text;
begin
  if not is_house_admin(p_house_id) then
    raise exception 'ADMIN_REQUIRED' using errcode = 'insufficient_privilege';
  end if;
  v_code := generate_invite_code();
  update houses set invite_code = v_code where id = p_house_id;
  return v_code;
end;
$$ language plpgsql security definer set search_path = public;

-- BR-011  A member occupies at most one room at a time. Moving closes the
-- previous assignment with to_date = today and opens a new one.
create or replace function assign_room(
  p_room_id   uuid,
  p_member_id uuid,
  p_from_date date default null
) returns uuid as $$
declare
  v_house_id  uuid;
  v_from      date := coalesce(p_from_date, current_date);
  v_new_id    uuid;
begin
  select house_id into v_house_id from rooms where id = p_room_id and deleted_at is null;
  if v_house_id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if not is_house_admin(v_house_id) then
    raise exception 'ADMIN_REQUIRED' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from house_members
                  where id = p_member_id and house_id = v_house_id) then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  update room_assignments
     set to_date = greatest(from_date, v_from - 1)
   where member_id = p_member_id and to_date is null;

  insert into room_assignments (house_id, room_id, member_id, from_date)
  values (v_house_id, p_room_id, p_member_id, v_from)
  returning id into v_new_id;

  return v_new_id;
end;
$$ language plpgsql security definer set search_path = public;

-- BR-012  A room may not be deleted while it has current occupants. Deletion is
-- soft, because a past month's rent split still needs the room.
create or replace function delete_room(p_room_id uuid) returns void as $$
declare v_house_id uuid;
begin
  select house_id into v_house_id from rooms where id = p_room_id and deleted_at is null;
  if v_house_id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if not is_house_admin(v_house_id) then
    raise exception 'ADMIN_REQUIRED' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from room_assignments ra
               join house_members m on m.id = ra.member_id
              where ra.room_id = p_room_id and ra.to_date is null and m.status = 'active') then
    raise exception 'ROOM_OCCUPIED' using errcode = 'check_violation';
  end if;
  update rooms set deleted_at = now() where id = p_room_id;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function create_house(text, text, text, text)   to authenticated;
grant execute on function join_house(text)                       to authenticated;
grant execute on function regenerate_invite_code(uuid)           to authenticated;
grant execute on function assign_room(uuid, uuid, date)          to authenticated;
grant execute on function delete_room(uuid)                      to authenticated;
revoke execute on function generate_invite_code()                from anon, authenticated;
