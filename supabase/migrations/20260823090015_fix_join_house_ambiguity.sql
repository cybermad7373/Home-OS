-- 015 — Fix an ambiguous column reference in join_house
--
-- `returns table (house_id uuid, ...)` declares house_id as an OUT parameter,
-- which is in scope for the whole function body. The lookup then read
-- `where house_id = v_house.id`, and Postgres could not tell the parameter from
-- the house_members column of the same name: 42702, "column reference
-- house_id is ambiguous". It failed at runtime only, on the first real join.
--
-- The return shape is unchanged — the API and the client still read house_id,
-- house_name and status. Only the body is qualified.

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
    values (v_house.id, v_user_id, 'member', 'pending')
    returning * into v_member;
  end if;

  return query select v_house.id, v_house.name, v_member.status;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function join_house(text) to authenticated;
