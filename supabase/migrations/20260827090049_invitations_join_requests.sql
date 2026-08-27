-- 049 — Invite links, join requests, and the Home's own shape
--
-- Source: docs/04-DATABASE.md section 4.1, docs/05-API-SPEC.md section 2.1,
-- docs/07-ROADMAP.md phase 10.
--
-- This is the migration that makes HM-06 true: a person asks, and the Home
-- answers. Every path that created a member for somebody else is dropped here,
-- and the only insert into `house_members` that a client can reach afterwards
-- is `accept_join_request`, which requires a request the person raised.

-- ---------------------------------------------------------------------------
-- The Home's shape and where it is
-- ---------------------------------------------------------------------------
-- `household_type` was named before "Home" was the word for this. The type and
-- the column both take the specification's name; renaming a type is
-- transparent to every function signature that mentions it.
alter type household_type rename to home_type;
alter table houses rename column household_type to home_type;

-- Location is context for food suggestions and nothing else (HM-03, SEC-18).
-- Every part optional, and nothing more precise than an area — the Home is not
-- asked for a pin on a map for a feature that suggests dinner.
alter table houses
  add column country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  add column state        text,
  add column city         text,
  add column area         text;

-- ---------------------------------------------------------------------------
-- invitations — one live link per Home, rotatable
-- ---------------------------------------------------------------------------
-- SEC-15: possession of the link grants nothing. It identifies the Home to a
-- stranger and lets them ask; a lead still accepts. That is why the token may
-- be handed around a WhatsApp group without any of this being a hole.
create table invitations (
  id         uuid primary key default gen_random_uuid(),
  house_id   uuid not null references houses(id) on delete cascade,
  token      text not null unique,
  created_by uuid not null references house_members(id),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_invitations_house on invitations(house_id);

-- At most one live link per Home. Rotation revokes before it inserts, so this
-- index is what makes "the old link dies immediately" a database fact rather
-- than an ordering the application is trusted to get right.
create unique index uq_invitation_live
  on invitations (house_id)
  where revoked_at is null;

alter table invitations enable row level security;

create policy read_invitations on invitations
  for select using (is_house_member(house_id));

create policy lead_writes_invitations on invitations
  for all using (is_house_lead(house_id)) with check (is_house_lead(house_id));

-- ---------------------------------------------------------------------------
-- join_requests — the only path to membership
-- ---------------------------------------------------------------------------
create table join_requests (
  id             uuid primary key default gen_random_uuid(),
  house_id       uuid not null references houses(id) on delete cascade,
  user_id        uuid not null references users(id) on delete cascade,
  invitation_id  uuid references invitations(id),
  message        text,
  status         text not null default 'requested'
                   check (status in ('requested', 'accepted', 'declined', 'withdrawn')),
  decided_by     uuid references house_members(id),
  decided_at     timestamptz,
  decline_reason text,
  member_id      uuid references house_members(id),
  created_at     timestamptz not null default now()
);

-- At most one live request per person per Home. Declined and withdrawn rows
-- accumulate freely, because "they asked three times" is a fact worth keeping.
create unique index uq_join_request_live
  on join_requests (house_id, user_id)
  where status = 'requested';

create index idx_join_requests_house_status on join_requests(house_id, status);

alter table join_requests enable row level security;

-- A lead sees the queue; the person who asked sees their own request and
-- nothing else about the Home. An ordinary member sees neither: they get the
-- count through `GET /api/houses/current` and a muted entry in the member
-- list, which is what HM-07 asks for.
create policy lead_reads_join_requests on join_requests
  for select using (is_house_lead(house_id) or user_id = auth.uid());

-- Insert, accept and decline all run through the security-definer functions
-- below. There is deliberately no insert, update or delete policy: a request
-- that a client could write directly is a request that could name a Home the
-- caller never had a link to.

-- ---------------------------------------------------------------------------
-- Tokens
-- ---------------------------------------------------------------------------
-- 24 characters of URL-safe base64 over 18 random bytes — 144 bits. The old
-- six-character invite code stays on `houses` because the specification
-- retains it, but nothing reads it as a credential any more.
create or replace function generate_invite_token() returns text as $$
  select translate(encode(gen_random_bytes(18), 'base64'), '+/', '-_');
$$ language sql volatile;

-- Postgres grants EXECUTE on a new function to PUBLIC, which anon and
-- authenticated inherit; revoking from those two alone leaves it callable by
-- everybody. Migration 037 is the record of learning that the hard way.
revoke execute on function generate_invite_token() from public, anon, authenticated;

-- Creates the Home's first link, or replaces the live one. Rotation revokes
-- the previous link in the same statement, and touches neither an existing
-- membership nor an open request (SEC-15).
create or replace function rotate_invitation(p_house_id uuid)
returns invitations as $$
declare
  v_me  house_members%rowtype;
  v_row invitations%rowtype;
begin
  if not is_house_lead(p_house_id) then
    raise exception 'LEAD_REQUIRED' using errcode = 'insufficient_privilege';
  end if;

  select * into v_me from house_members
   where house_id = p_house_id and user_id = auth.uid() and status = 'active';

  update invitations set revoked_at = now()
   where house_id = p_house_id and revoked_at is null;

  insert into invitations (house_id, token, created_by)
  values (p_house_id, generate_invite_token(), v_me.id)
  returning * into v_row;

  return v_row;
end;
$$ language plpgsql security definer set search_path = public;

-- What a stranger sees when they open the link, before signing in. Public by
-- design, and deliberately thin: a name, a shape and a size. An invalid,
-- expired or revoked token returns nothing at all rather than saying which of
-- the three it was, so the endpoint never confirms that a Home exists.
create or replace function lookup_invitation(p_token text)
returns table (house_name text, home_type home_type, member_count integer) as $$
  select h.name,
         h.home_type,
         (select count(*)::integer from house_members m
           where m.house_id = h.id and m.status = 'active')
    from invitations i
    join houses h on h.id = i.house_id
   where i.token = p_token
     and i.revoked_at is null
     and (i.expires_at is null or i.expires_at > now());
$$ language sql security definer stable set search_path = public;

-- The only way to become a candidate for membership (HM-06).
create or replace function request_join(p_token text, p_message text default null)
returns table (house_id uuid, house_name text, status text) as $$
declare
  v_user_id uuid := auth.uid();
  v_invite  invitations%rowtype;
  v_house   houses%rowtype;
  v_request join_requests%rowtype;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = 'insufficient_privilege';
  end if;

  select * into v_invite from invitations i
   where i.token = p_token
     and i.revoked_at is null
     and (i.expires_at is null or i.expires_at > now());

  if v_invite.id is null then
    raise exception 'INVALID_INVITE' using errcode = 'no_data_found';
  end if;

  select * into v_house from houses where id = v_invite.house_id;

  -- Already in this Home, in any state? Say so rather than queueing a second
  -- request the leads would have to read and dismiss.
  if exists (select 1 from house_members m
              where m.house_id = v_house.id and m.user_id = v_user_id) then
    raise exception 'ALREADY_MEMBER' using errcode = 'unique_violation';
  end if;

  -- Asking twice while the first ask is open is a no-op, not an error: the
  -- person tapped the link again, which is not a mistake worth a message.
  select * into v_request from join_requests r
   where r.house_id = v_house.id and r.user_id = v_user_id and r.status = 'requested';

  if v_request.id is null then
    insert into join_requests (house_id, user_id, invitation_id, message)
    values (v_house.id, v_user_id, v_invite.id,
            nullif(trim(coalesce(p_message, '')), ''))
    returning * into v_request;
  end if;

  return query select v_house.id, v_house.name, v_request.status;
end;
$$ language plpgsql security definer set search_path = public;

-- Acceptance is the one insert into house_members a client can reach, and it
-- needs a request that the person themselves raised.
create or replace function accept_join_request(p_request_id uuid)
returns house_members as $$
declare
  v_request join_requests%rowtype;
  v_me      house_members%rowtype;
  v_member  house_members%rowtype;
begin
  select * into v_request from join_requests where id = p_request_id;
  if v_request.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if not is_house_lead(v_request.house_id) then
    raise exception 'LEAD_REQUIRED' using errcode = 'insufficient_privilege';
  end if;
  if v_request.status <> 'requested' then
    raise exception 'REQUEST_NOT_OPEN' using errcode = 'check_violation';
  end if;

  select * into v_me from house_members
   where house_id = v_request.house_id and user_id = auth.uid() and status = 'active';

  insert into house_members (house_id, user_id, role, status)
  values (v_request.house_id, v_request.user_id, 'member', 'active')
  returning * into v_member;

  update join_requests
     set status     = 'accepted',
         decided_by = v_me.id,
         decided_at = now(),
         member_id  = v_member.id
   where id = p_request_id;

  return v_member;
end;
$$ language plpgsql security definer set search_path = public;

-- Declining requires a reason, and the person may ask again — the unique index
-- above only covers open requests.
create or replace function decline_join_request(p_request_id uuid, p_reason text)
returns join_requests as $$
declare
  v_request join_requests%rowtype;
  v_me      house_members%rowtype;
begin
  select * into v_request from join_requests where id = p_request_id;
  if v_request.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if not is_house_lead(v_request.house_id) then
    raise exception 'LEAD_REQUIRED' using errcode = 'insufficient_privilege';
  end if;
  if v_request.status <> 'requested' then
    raise exception 'REQUEST_NOT_OPEN' using errcode = 'check_violation';
  end if;
  if length(coalesce(trim(p_reason), '')) < 10 then
    raise exception 'REASON_REQUIRED' using errcode = 'check_violation';
  end if;

  select * into v_me from house_members
   where house_id = v_request.house_id and user_id = auth.uid() and status = 'active';

  update join_requests
     set status         = 'declined',
         decided_by     = v_me.id,
         decided_at     = now(),
         decline_reason = trim(p_reason)
   where id = p_request_id
  returning * into v_request;

  return v_request;
end;
$$ language plpgsql security definer set search_path = public;

-- The person may take their own request back.
create or replace function withdraw_join_request(p_request_id uuid)
returns join_requests as $$
declare v_request join_requests%rowtype;
begin
  update join_requests
     set status = 'withdrawn', decided_at = now()
   where id = p_request_id
     and user_id = auth.uid()
     and status = 'requested'
  returning * into v_request;

  if v_request.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;
  return v_request;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- House creation takes the Home's shape and its location
-- ---------------------------------------------------------------------------
-- Restated whole from migration 036, per D-19. Three changes: the location
-- columns, the explicit role on the Admin membership now that the column has
-- no default, and the invite link created alongside the retained invite code.
create or replace function create_house(
  p_name         text,
  p_address      text default null,
  p_timezone     text default 'Asia/Kolkata',
  p_currency     text default 'INR',
  p_type         home_type default 'shared',
  p_country_code text default null,
  p_state        text default null,
  p_city         text default null,
  p_area         text default null
) returns table (house_id uuid, invite_code text, invite_token text) as $$
declare
  v_user_id uuid := auth.uid();
  v_house   houses%rowtype;
  v_member  house_members%rowtype;
  v_invite  invitations%rowtype;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = 'insufficient_privilege';
  end if;

  insert into houses (name, address, timezone, currency, invite_code, created_by,
                      home_type, country_code, state, city, area)
  values (trim(p_name), nullif(trim(coalesce(p_address, '')), ''),
          p_timezone, p_currency, generate_invite_code(), v_user_id, p_type,
          nullif(upper(trim(coalesce(p_country_code, ''))), ''),
          nullif(trim(coalesce(p_state, '')), ''),
          nullif(trim(coalesce(p_city,  '')), ''),
          nullif(trim(coalesce(p_area,  '')), ''))
  returning * into v_house;

  -- A family's money comes out of a pot and its children are not fined.
  -- A flat splits and settles, and its deficit costs money. Both remain
  -- editable afterwards; this only chooses where the Home starts.
  insert into house_settings (house_id, money_mode, penalty_enabled)
  values (
    v_house.id,
    case when p_type = 'family' then 'pot'::money_mode else 'split'::money_mode end,
    p_type <> 'family'
  );

  insert into house_members (house_id, user_id, role, status)
  values (v_house.id, v_user_id, 'admin', 'active')
  returning * into v_member;

  insert into invitations (house_id, token, created_by)
  values (v_house.id, generate_invite_token(), v_member.id)
  returning * into v_invite;

  perform seed_default_categories(v_house.id, p_type);
  perform seed_default_chore_templates(v_house.id);

  return query select v_house.id, v_house.invite_code, v_invite.token;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- Retirement (R-2, docs/05-API-SPEC.md section 0.5)
-- ---------------------------------------------------------------------------
-- `join_house` created a membership from possession of a six-character code.
-- `regenerate_invite_code` rotated that code. Both are replaced by the link
-- and the request above; dropping them is what makes "there is no endpoint
-- anywhere that could have created them without asking" checkable rather than
-- asserted.
drop function if exists join_house(text);
drop function if exists regenerate_invite_code(uuid);
drop function if exists create_house(text, text, text, text, home_type);

-- Every existing Home gets the link its members will be asked for.
insert into invitations (house_id, token, created_by)
select h.id,
       generate_invite_token(),
       (select m.id from house_members m
         where m.house_id = h.id and m.role = 'admin' and m.status = 'active'
         order by m.joined_date limit 1)
  from houses h
 where not exists (select 1 from invitations i
                    where i.house_id = h.id and i.revoked_at is null)
   and exists (select 1 from house_members m
                where m.house_id = h.id and m.role = 'admin' and m.status = 'active');

grant execute on function lookup_invitation(text)              to anon, authenticated;
grant execute on function request_join(text, text)             to authenticated;
grant execute on function rotate_invitation(uuid)              to authenticated;
grant execute on function accept_join_request(uuid)            to authenticated;
grant execute on function decline_join_request(uuid, text)     to authenticated;
grant execute on function withdraw_join_request(uuid)          to authenticated;
grant execute on function create_house(text, text, text, text, home_type,
                                       text, text, text, text) to authenticated;
revoke execute on function seed_default_categories(uuid, home_type)
  from public, anon, authenticated;
