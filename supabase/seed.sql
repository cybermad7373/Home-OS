-- Development seed — docs/04-DATABASE.md section 9, phase-1 subset.
--
-- Creates one house with its rooms and settings so that the house screens have
-- something to show before anybody signs up. Members are deliberately absent:
-- a house_members row needs a real auth.users row behind it, and inventing one
-- would leave a login nobody can use. Sign up through the app and join with the
-- code below.
--
--   Invite code: SEED01
--
-- Applied automatically by `supabase db reset`. Never run against production.

do $$
declare
  v_owner_id uuid;
  v_house_id uuid;
begin
  -- The first real user becomes the seed house's creator. With no users yet,
  -- the seed does nothing rather than failing the reset.
  select id into v_owner_id from auth.users order by created_at limit 1;
  if v_owner_id is null then
    raise notice 'No auth users yet — skipping seed. Sign up, then re-run: supabase db reset';
    return;
  end if;

  insert into public.users (id, email, display_name)
  select v_owner_id, email, coalesce(raw_user_meta_data->>'display_name', 'Seed admin')
    from auth.users where id = v_owner_id
  on conflict (id) do nothing;

  insert into houses (name, address, timezone, currency, invite_code, created_by)
  values ('Anna Nagar Boys', '12 Second Street, Anna Nagar', 'Asia/Kolkata', 'INR',
          'SEED01', v_owner_id)
  on conflict (invite_code) do nothing
  returning id into v_house_id;

  if v_house_id is null then
    select id into v_house_id from houses where invite_code = 'SEED01';
  end if;

  insert into house_settings (house_id) values (v_house_id)
  on conflict (house_id) do nothing;

  insert into house_members (house_id, user_id, role, status, residency, can_cook)
  values (v_house_id, v_owner_id, 'admin', 'active', 'full_time', true)
  on conflict (house_id, user_id) do nothing;

  insert into rooms (house_id, name, capacity, monthly_rent_paise) values
    (v_house_id, 'Front room',  3, 900000),
    (v_house_id, 'Middle room', 3, 900000),
    (v_house_id, 'Back room',   2, 700000)
  on conflict (house_id, name) do nothing;
end $$;
