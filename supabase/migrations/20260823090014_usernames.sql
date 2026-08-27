-- 014 — Usernames
--
-- Supabase Auth identifies a person by email or phone; it has no concept of a
-- username. So the username lives here, on the profile, and the sign-in route
-- resolves it to an email server-side before handing the pair to Auth.
--
-- Resolution is deliberately NOT a database function callable by the browser:
-- anything that answers "which email owns this username" is an enumeration
-- tool. Only the server, holding the service-role key, may ask.

alter table users add column username text;

-- Case-insensitive uniqueness. A lower() index rather than citext, so the
-- schema needs no extension and the generated types stay plain text.
create unique index uq_users_username_lower on users (lower(username))
  where username is not null;

-- Shape rule, matched by the Zod schema in lib/validation/common.ts:
-- 3–20 characters, lowercase letters, digits and underscores, starting with a
-- letter. Case is preserved as typed; uniqueness ignores it.
alter table users add constraint users_username_shape
  check (username is null or username ~ '^[A-Za-z][A-Za-z0-9_]{2,19}$');

-- The profile mirror now carries the username through from sign-up metadata.
-- If the name was taken in the moments between the availability check and the
-- insert, the profile is created without one and the app asks again at
-- onboarding, rather than failing the sign-up and stranding an auth user.
create or replace function handle_new_user() returns trigger as $$
declare
  v_username text := nullif(new.raw_user_meta_data->>'username', '');
begin
  if v_username is not null
     and exists (select 1 from public.users where lower(username) = lower(v_username)) then
    v_username := null;
  end if;

  insert into public.users (id, email, display_name, avatar_url, username)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data->>'display_name', ''),
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(new.raw_user_meta_data->>'name', ''),
      v_username,
      split_part(new.email, '@', 1)
    ),
    nullif(new.raw_user_meta_data->>'avatar_url', ''),
    v_username
  )
  on conflict (id) do update
    set email      = excluded.email,
        avatar_url = coalesce(public.users.avatar_url, excluded.avatar_url);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Claiming a username after the fact — the path a Google sign-in takes, since
-- OAuth supplies no username. Security definer so the uniqueness check sees
-- every row rather than only the ones this member may read.
create or replace function claim_username(p_username text) returns text as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = 'insufficient_privilege';
  end if;
  if p_username !~ '^[A-Za-z][A-Za-z0-9_]{2,19}$' then
    raise exception 'INVALID_USERNAME' using errcode = 'check_violation';
  end if;
  if exists (select 1 from users
              where lower(username) = lower(p_username) and id <> v_user_id) then
    raise exception 'USERNAME_TAKEN' using errcode = 'unique_violation';
  end if;

  update users set username = p_username where id = v_user_id;
  return p_username;
end;
$$ language plpgsql security definer set search_path = public;

-- Availability, and only availability: it answers yes or no and never reveals
-- who holds a taken name.
create or replace function username_available(p_username text) returns boolean as $$
  select p_username ~ '^[A-Za-z][A-Za-z0-9_]{2,19}$'
     and not exists (
       select 1 from users
        where lower(username) = lower(p_username)
          and id is distinct from auth.uid()
     );
$$ language sql security definer stable set search_path = public;

grant execute on function claim_username(text)      to authenticated;
grant execute on function username_available(text)  to authenticated, anon;
