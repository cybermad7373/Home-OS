-- 010 — Triggers and integrity rules (phase 1 subset)
-- Source: docs/04-DATABASE.md section 6, plus BR-001 (last admin) from
-- docs/09-BUSINESS-RULES.md section 1.1.

-- 6.1  updated_at maintenance, applied to every table that has the column.
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_users_touch          before update on users
  for each row execute function touch_updated_at();
create trigger trg_houses_touch         before update on houses
  for each row execute function touch_updated_at();
create trigger trg_house_settings_touch before update on house_settings
  for each row execute function touch_updated_at();
create trigger trg_rooms_touch          before update on rooms
  for each row execute function touch_updated_at();
create trigger trg_house_members_touch  before update on house_members
  for each row execute function touch_updated_at();

-- Profile mirror: every auth.users row gets a public.users row. The display name
-- comes from the sign-up metadata; Google OAuth supplies `full_name` instead.
create or replace function handle_new_user() returns trigger as $$
begin
  insert into public.users (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data->>'display_name', ''),
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(new.raw_user_meta_data->>'name', ''),
      split_part(new.email, '@', 1)
    ),
    nullif(new.raw_user_meta_data->>'avatar_url', '')
  )
  on conflict (id) do update
    set email      = excluded.email,
        avatar_url = coalesce(public.users.avatar_url, excluded.avatar_url);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- BR-001  A house always has at least one active admin. Demoting or deactivating
-- the last one is refused in the database, not only in the route handler.
create or replace function assert_admin_remains() returns trigger as $$
declare v_admins integer;
begin
  if old.role = 'admin' and old.status = 'active'
     and (new.role <> 'admin' or new.status <> 'active') then
    select count(*) into v_admins
      from house_members
     where house_id = old.house_id
       and role     = 'admin'
       and status   = 'active'
       and id      <> old.id;
    if v_admins = 0 then
      raise exception 'LAST_ADMIN' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_last_admin
  before update on house_members
  for each row execute function assert_admin_remains();

-- BR-010  A room's occupant count may not exceed its capacity.
create or replace function assert_room_capacity() returns trigger as $$
declare
  v_capacity  integer;
  v_occupants integer;
begin
  if new.to_date is not null then
    return new;
  end if;
  select capacity into v_capacity from rooms where id = new.room_id;
  select count(*) into v_occupants
    from room_assignments ra
    join house_members m on m.id = ra.member_id
   where ra.room_id = new.room_id
     and ra.to_date is null
     and ra.id     <> new.id
     and m.status   = 'active';
  if v_occupants >= v_capacity then
    raise exception 'ROOM_FULL' using errcode = 'check_violation';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_room_capacity
  before insert or update on room_assignments
  for each row execute function assert_room_capacity();
