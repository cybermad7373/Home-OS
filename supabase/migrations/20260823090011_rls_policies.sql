-- 011 — Row Level Security
-- Source: docs/04-DATABASE.md section 7, docs/03-ARCHITECTURE.md section 7.
--
-- House isolation is enforced here and nowhere else that matters. A route
-- handler that forgets a check cannot leak another house's data.

alter table users             enable row level security;
alter table houses            enable row level security;
alter table house_settings    enable row level security;
alter table rooms             enable row level security;
alter table house_members     enable row level security;
alter table room_assignments  enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers. All are `security definer` so that a policy which reads
-- house_members does not re-enter house_members' own policies.
-- ---------------------------------------------------------------------------

create or replace function is_house_member(p_house_id uuid) returns boolean as $$
  select exists (
    select 1 from house_members
     where house_id = p_house_id
       and user_id  = auth.uid()
       and status   = 'active'
  );
$$ language sql security definer stable set search_path = public;

create or replace function is_house_admin(p_house_id uuid) returns boolean as $$
  select exists (
    select 1 from house_members
     where house_id = p_house_id
       and user_id  = auth.uid()
       and status   = 'active'
       and role     = 'admin'
  );
$$ language sql security definer stable set search_path = public;

-- Any membership at all, including `pending`. BR-003 keeps a pending member out
-- of house data; this is only for the two things they may see — the house name
-- on the waiting screen, and their own membership row.
create or replace function has_membership(p_house_id uuid) returns boolean as $$
  select exists (
    select 1 from house_members
     where house_id = p_house_id
       and user_id  = auth.uid()
  );
$$ language sql security definer stable set search_path = public;

create or replace function shares_active_house_with(p_user_id uuid) returns boolean as $$
  select exists (
    select 1
      from house_members mine
      join house_members theirs on theirs.house_id = mine.house_id
     where mine.user_id   = auth.uid()
       and mine.status    = 'active'
       and theirs.user_id = p_user_id
  );
$$ language sql security definer stable set search_path = public;

-- ---------------------------------------------------------------------------
-- users — own profile, plus the profiles of people in the same house.
-- ---------------------------------------------------------------------------

create policy read_self_and_housemates on users
  for select using (id = auth.uid() or shares_active_house_with(id));

create policy update_own_profile on users
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- houses
-- ---------------------------------------------------------------------------

create policy read_own_house on houses
  for select using (has_membership(id));

create policy admin_updates_house on houses
  for update using (is_house_admin(id)) with check (is_house_admin(id));

-- ---------------------------------------------------------------------------
-- house_settings
-- ---------------------------------------------------------------------------

create policy read_house_settings on house_settings
  for select using (is_house_member(house_id));

create policy admin_writes_house_settings on house_settings
  for all using (is_house_admin(house_id)) with check (is_house_admin(house_id));

-- ---------------------------------------------------------------------------
-- rooms — everyone reads, admin writes.
-- ---------------------------------------------------------------------------

create policy read_rooms on rooms
  for select using (is_house_member(house_id));

create policy admin_writes_rooms on rooms
  for all using (is_house_admin(house_id)) with check (is_house_admin(house_id));

-- ---------------------------------------------------------------------------
-- house_members — everyone in the house reads every member; a member may edit
-- their own row (cooking flag, residency); only an admin may change anybody
-- else's, and role/status changes are admin-only even on your own row.
-- ---------------------------------------------------------------------------

create policy read_house_members on house_members
  for select using (is_house_member(house_id) or user_id = auth.uid());

create policy admin_writes_members on house_members
  for all using (is_house_admin(house_id)) with check (is_house_admin(house_id));

create policy member_updates_self on house_members
  for update using (user_id = auth.uid() and status = 'active')
              with check (user_id = auth.uid());

-- Role and status are privileged columns. The policy above cannot see the old
-- row's values, so the guard is a trigger.
create or replace function assert_member_field_privilege() returns trigger as $$
begin
  if (new.role <> old.role or new.status <> old.status or new.left_date is distinct from old.left_date)
     and not is_house_admin(old.house_id) then
    raise exception 'ADMIN_REQUIRED' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_member_field_privilege
  before update on house_members
  for each row execute function assert_member_field_privilege();

-- ---------------------------------------------------------------------------
-- room_assignments — everyone reads, admin writes (BR-011 is applied in the
-- assign RPC, which closes the previous assignment).
-- ---------------------------------------------------------------------------

create policy read_room_assignments on room_assignments
  for select using (is_house_member(house_id));

create policy admin_writes_room_assignments on room_assignments
  for all using (is_house_admin(house_id)) with check (is_house_admin(house_id));
