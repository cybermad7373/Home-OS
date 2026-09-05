-- 091 — Erasing an account without erasing the household's ledger
--
-- `docs/18-GO-LIVE.md` section 6, and the privacy page in as many words: "There
-- is no self-service account deletion. To have an account and its records
-- removed, ask using the contact below." This is that, built the only way it can
-- honestly be built for a product where one person's records are several
-- people's money.
--
-- ## Why this is not a DELETE
--
-- The schema already refuses the obvious version, and it is right to. Deleting
-- an `auth.users` row cascades to `public.users` and then to `house_members` —
-- and `expenses.paid_by_member_id`, `expense_splits.member_id`,
-- `settlements.from_member_id` and a dozen more reference `house_members(id)`
-- with no cascade at all. Postgres would refuse the delete, and if it did not,
-- what it destroyed would be the record of who paid for what: balances other
-- people have already settled against.
--
-- So erasure here means what it can mean: **the person is erased, the
-- arithmetic is kept.** Display name, username, email, phone, payment address
-- and avatar are gone. What is left where a name used to be is "Former member",
-- and the ledger still adds up.
--
-- ## Why an active member cannot do this
--
-- Removal from a Home is a governed decision (D-45, and the governance
-- specification's whole purpose). An account that could erase itself out of a
-- Home would be a way to leave without asking anybody — the exact thing
-- `remove_member` exists to prevent, reachable by a different door. So this
-- refuses while any membership is `active`, and says so. Leaving is a Home
-- decision; deleting the account afterwards is not.
--
-- An account that never joined anything — signed up, never got in, changed
-- their mind — is the common case and it works immediately.
--
-- ## What is deleted outright
--
-- The things that are only ever about the person and never about the household:
-- push subscriptions, notification preferences, their own notification queue,
-- and any join request still waiting for an answer. None of these appears in
-- anybody else's screen.
-- ---------------------------------------------------------------------------

create table if not exists account_erasures (
  user_id      uuid primary key references users(id) on delete cascade,
  erased_at    timestamptz not null default now(),
  -- How many memberships the ledger still points at. Not who, and not which
  -- Home: this row exists to answer "was this account erased, and when", which
  -- is a question a support request asks and a regulator may.
  memberships  integer not null default 0
);

comment on table account_erasures is
  'One row per erased account. Proof the erasure happened, carrying no personal '
  'data of its own — the point of the exercise was to remove that.';

alter table account_erasures enable row level security;
revoke all on table account_erasures from public, anon, authenticated;
grant select, insert on table account_erasures to service_role;

-- ---------------------------------------------------------------------------
-- erase_account: anonymise the person, keep the arithmetic.
--
-- Service-role only, and it takes the user id as an argument rather than
-- reading `auth.uid()`. That is deliberate and it is the opposite of the choice
-- migration 090 made for the rate limiter: the caller here is the Next server,
-- which has already established whose session this is, and which must be able
-- to run the whole erasure — this function, then the auth changes that make
-- sign-in impossible — as one operation it can roll back. A browser-callable
-- version could do the first half and be closed before the second.
-- ---------------------------------------------------------------------------
create or replace function erase_account(p_user_id uuid)
returns table (memberships integer, already_erased boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active     integer;
  v_members    integer;
  v_existing   boolean;
begin
  if p_user_id is null then
    raise exception 'VALIDATION_FAILED';
  end if;

  if not exists (select 1 from users where id = p_user_id) then
    raise exception 'NOT_FOUND';
  end if;

  select exists (select 1 from account_erasures where user_id = p_user_id) into v_existing;
  if v_existing then
    -- Idempotent: the route may retry after a failure on the auth side, and a
    -- second run must not be an error.
    select count(*) into v_members from house_members where user_id = p_user_id;
    return query select v_members, true;
    return;
  end if;

  select count(*) into v_active
    from house_members
   where user_id = p_user_id and status = 'active';

  if v_active > 0 then
    -- Leaving a Home is a decision the Home makes. This is not a second door
    -- out of one.
    raise exception 'ACCOUNT_IN_USE';
  end if;

  -- A request nobody has answered is about the person, not the household, and
  -- an answer to an erased account is an answer to nobody.
  delete from join_requests where user_id = p_user_id and status = 'requested';

  -- Delivery channels and the person's own queue. None of these is on anybody
  -- else's screen.
  delete from push_subscriptions
   where member_id in (select id from house_members where user_id = p_user_id);
  delete from notification_prefs
   where member_id in (select id from house_members where user_id = p_user_id);
  delete from notifications
   where member_id in (select id from house_members where user_id = p_user_id);

  -- A membership that never became one carries nothing and names somebody.
  delete from house_members where user_id = p_user_id and status = 'requested';

  select count(*) into v_members from house_members where user_id = p_user_id;

  /*
    The erasure itself.

    `email` is not null and unique, so it becomes a tombstone rather than null:
    unique because the column demands it, and on `.invalid` — the reserved TLD
    from RFC 2606 — because an address that could be delivered to is not erased.
    The real address is freed for a new account, which somebody who deletes an
    account and later changes their mind will want.

    `username` goes to null and frees itself the same way.
  */
  update users
     set display_name = 'Former member',
         username     = null,
         email        = 'erased-' || p_user_id::text || '@erased.invalid',
         phone        = null,
         upi_vpa      = null,
         avatar_url   = null,
         updated_at   = now()
   where id = p_user_id;

  insert into account_erasures (user_id, memberships) values (p_user_id, v_members);

  return query select v_members, false;
end;
$$;

comment on function erase_account(uuid) is
  'Anonymises a user and removes their personal channels, keeping every '
  'house_members row the ledger references. Refuses while any membership is active.';

revoke all on function erase_account(uuid) from public, anon, authenticated;
grant execute on function erase_account(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- account_erasure_blockers: what stands in the way, for a screen to show
-- *before* anybody presses anything.
--
-- Readable by the account itself, because "which of my Homes still counts me as
-- a member" is a question about the caller and nobody else. It names the Homes
-- because "leave your Homes first" is useless advice if the person cannot see
-- which ones.
-- ---------------------------------------------------------------------------
create or replace function account_erasure_blockers()
returns table (house_id uuid, house_name text, role member_role)
language sql
security definer
set search_path = public
as $$
  select h.id, h.name, m.role
    from house_members m
    join houses h on h.id = m.house_id
   where m.user_id = auth.uid()
     and m.status = 'active'
   order by h.name;
$$;

comment on function account_erasure_blockers() is
  'The Homes that still count the caller as active, and so must be left before '
  'the account can be erased. Scoped to auth.uid(); names no other member.';

revoke all on function account_erasure_blockers() from public, anon;
grant execute on function account_erasure_blockers() to authenticated, service_role;
