-- 038 — add_dependent's guardian is optional
--
-- A dependent who pays their own share needs no guardian: an adult sibling
-- staying long term with no account of their own, a working son who chips in.
-- The column allows null and the table constraint only demands a guardian when
-- shares_cost is false, but the function's parameter had no default, so every
-- caller — and the generated TypeScript signature — was forced to supply one.

create or replace function add_dependent(
  p_house_id    uuid,
  p_name        text,
  p_guardian_id uuid default null,
  p_shares_cost boolean default false,
  p_does_chores boolean default false,
  p_residency   residency_type default 'full_time'
) returns house_members as $$
declare
  v_me     house_members%rowtype;
  v_member house_members%rowtype;
begin
  v_me := current_member(p_house_id);
  if v_me.id is null or v_me.role <> 'admin' then
    raise exception 'ADMIN_REQUIRED' using errcode = 'insufficient_privilege';
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

grant execute on function add_dependent(uuid, text, uuid, boolean, boolean, residency_type)
  to authenticated;
