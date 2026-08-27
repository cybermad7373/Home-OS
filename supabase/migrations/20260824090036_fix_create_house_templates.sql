-- 036 — create_house seeds chore templates again
--
-- Migration 035 rewrote create_house from the copy in migration 017, which
-- predates the chore engine. That copy has no `seed_default_chore_templates`
-- call, so every house created between 035 and this migration started with an
-- empty chore list and generated an empty week — silently, because an empty
-- schedule is a legitimate state.
--
-- The lesson, recorded in DECISIONS.md as D-19: a `create or replace` of a
-- function that several migrations have amended has to start from the newest
-- definition, not the one whose file happens to be open.

create or replace function create_house(
  p_name     text,
  p_address  text default null,
  p_timezone text default 'Asia/Kolkata',
  p_currency text default 'INR',
  p_type     household_type default 'shared'
) returns table (house_id uuid, invite_code text) as $$
declare
  v_user_id uuid := auth.uid();
  v_house   houses%rowtype;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = 'insufficient_privilege';
  end if;

  insert into houses (name, address, timezone, currency, invite_code, created_by,
                      household_type)
  values (trim(p_name), nullif(trim(coalesce(p_address, '')), ''),
          p_timezone, p_currency, generate_invite_code(), v_user_id, p_type)
  returning * into v_house;

  insert into house_settings (house_id, money_mode, penalty_enabled)
  values (
    v_house.id,
    case when p_type = 'family' then 'pot'::money_mode else 'split'::money_mode end,
    p_type <> 'family'
  );

  insert into house_members (house_id, user_id, role, status)
  values (v_house.id, v_user_id, 'admin', 'active');

  perform seed_default_categories(v_house.id, p_type);
  perform seed_default_chore_templates(v_house.id);

  return query select v_house.id, v_house.invite_code;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function create_house(text, text, text, text, household_type)
  to authenticated;

-- Repair the houses created against the broken definition. Seeding is
-- idempotent, so running it over a house that already has templates is a no-op.
do $$
declare v_house_id uuid;
begin
  for v_house_id in
    select h.id from houses h
     where not exists (select 1 from chore_templates t where t.house_id = h.id)
  loop
    perform seed_default_chore_templates(v_house_id);
  end loop;
end $$;
