-- 044 — Telegram out, devices in
--
-- Phase 7 shipped Telegram as the fallback channel for members whose push does
-- not arrive. It is being removed before it was ever switched on: no bot token
-- was ever configured, so nothing was delivered through it and no member has a
-- link to lose. The fallback is now the native app, which registers a device
-- exactly as the browser does.
--
-- That is the whole reason this is a deletion rather than a deprecation. A
-- second delivery channel is not free — it is a second copy of the copy, a
-- second failure mode in the dispatcher, and a second place a member has to go
-- to stop being interrupted. One channel that reaches every device the member
-- owns is the smaller system and the better answer.
--
-- What replaces it is not another channel but a better register of devices:
-- `push_subscriptions` now records which platform each row came from and when
-- it was last seen, so the settings screen can name a device rather than count
-- them, and so an Android build registering through the same VAPID key is
-- distinguishable from the laptop that registered last March.

-- ---------------------------------------------------------------------------
-- The link tables and their functions
-- ---------------------------------------------------------------------------

drop function if exists consume_telegram_link_code(text, text);
drop function if exists create_telegram_link_code();
drop table if exists telegram_link_codes;
drop table if exists telegram_links;

-- ---------------------------------------------------------------------------
-- The preference and the delivery timestamp
-- ---------------------------------------------------------------------------

alter table notification_prefs drop column if exists telegram_enabled;
alter table notifications      drop column if exists telegram_sent_at;

-- The enum loses its third value. Postgres has no `drop value`, so the type is
-- rebuilt; nothing is currently stamped 'telegram' because nothing was ever
-- sent that way, and the cast maps any that exist to 'in_app' rather than
-- claiming a push happened.
alter table notifications alter column channel drop default;
alter type notify_channel rename to notify_channel_v1;
create type notify_channel as enum ('push', 'in_app');

alter table notifications
  alter column channel type notify_channel
  using (case channel::text when 'telegram' then 'in_app' else channel::text end)::notify_channel;

alter table notifications alter column channel set default 'in_app';
drop type notify_channel_v1;

-- ---------------------------------------------------------------------------
-- Devices
-- ---------------------------------------------------------------------------

alter table push_subscriptions
  add column if not exists platform     text not null default 'web',
  add column if not exists last_seen_at timestamptz not null default now();

alter table push_subscriptions
  add constraint push_platform_known check (platform in ('web', 'android', 'ios'));

comment on column push_subscriptions.platform is
  'Where the subscription was created. The native app registers through the same '
  'VAPID key as the browser, so this is for naming devices in settings and for '
  'reading delivery failures by platform — not for choosing a transport.';

-- ---------------------------------------------------------------------------
-- Functions whose signatures change
-- ---------------------------------------------------------------------------

drop function if exists set_notification_prefs(boolean, boolean, boolean, boolean, boolean, boolean, time, time, boolean, boolean);

create or replace function set_notification_prefs(
  p_chore_reminders       boolean default null,
  p_confirmation_requests boolean default null,
  p_chore_outcomes        boolean default null,
  p_house_activity        boolean default null,
  p_expense_activity      boolean default null,
  p_weekly_digest         boolean default null,
  p_quiet_hours_start     time default null,
  p_quiet_hours_end       time default null,
  p_quiet_hours_off       boolean default false
) returns notification_prefs as $$
declare
  v_member uuid;
  v_row    notification_prefs;
begin
  select id into v_member from house_members
   where user_id = auth.uid() and status = 'active'
   order by joined_date desc limit 1;

  if v_member is null then
    raise exception 'No active membership' using errcode = 'P0001';
  end if;

  -- `settlement_updates` is set rather than coalesced: a member who has muted
  -- the app cannot then claim they were never told they owed money.
  update notification_prefs
     set chore_reminders       = coalesce(p_chore_reminders, chore_reminders),
         confirmation_requests = coalesce(p_confirmation_requests, confirmation_requests),
         chore_outcomes        = coalesce(p_chore_outcomes, chore_outcomes),
         house_activity        = coalesce(p_house_activity, house_activity),
         expense_activity      = coalesce(p_expense_activity, expense_activity),
         weekly_digest         = coalesce(p_weekly_digest, weekly_digest),
         settlement_updates    = true,
         quiet_hours_start     = case when p_quiet_hours_off then null
                                      else coalesce(p_quiet_hours_start, quiet_hours_start) end,
         quiet_hours_end       = case when p_quiet_hours_off then null
                                      else coalesce(p_quiet_hours_end, quiet_hours_end) end
   where member_id = v_member
  returning * into v_row;

  return v_row;
end;
$$ language plpgsql security definer set search_path = public;

drop function if exists save_push_subscription(text, text, text, text);

/**
 * One row per device, keyed by endpoint, re-registered on every app open.
 *
 * `last_seen_at` is what makes the settings list honest: a subscription the
 * push service has not rejected but whose device has not opened the app since
 * February is still listed, and now says so.
 */
create or replace function save_push_subscription(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text default null,
  p_platform   text default 'web'
) returns uuid as $$
declare
  v_member house_members%rowtype;
  v_id     uuid;
begin
  select * into v_member from house_members
   where user_id = auth.uid() and status = 'active'
   order by joined_date desc limit 1;

  if v_member.id is null then
    raise exception 'No active membership' using errcode = 'P0001';
  end if;

  if p_platform not in ('web', 'android', 'ios') then
    raise exception 'Unknown platform %', p_platform using errcode = '22023';
  end if;

  insert into push_subscriptions (
    house_id, member_id, endpoint, p256dh, auth, user_agent, platform, last_seen_at)
  values (
    v_member.house_id, v_member.id, p_endpoint, p_p256dh, p_auth, p_user_agent, p_platform, now())
  on conflict (endpoint) do update
    set member_id    = excluded.member_id,
        house_id     = excluded.house_id,
        p256dh       = excluded.p256dh,
        auth         = excluded.auth,
        user_agent   = excluded.user_agent,
        platform     = excluded.platform,
        last_seen_at = now(),
        failed_at    = null
  returning id into v_id;

  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- Housekeeping loses the code table it was pruning
-- ---------------------------------------------------------------------------

create or replace function prune_notifications() returns integer as $$
declare
  v_count integer;
begin
  delete from notifications where created_at < now() - interval '90 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- Grants. Redefining a function with a new signature creates a new function,
-- and a new function arrives with the default PUBLIC execute grant (D-20).
-- ---------------------------------------------------------------------------

revoke execute on function set_notification_prefs(boolean, boolean, boolean, boolean, boolean, boolean, time, time, boolean) from public, anon;
revoke execute on function save_push_subscription(text, text, text, text, text) from public, anon;
revoke execute on function prune_notifications() from public, anon, authenticated;

grant execute on function set_notification_prefs(boolean, boolean, boolean, boolean, boolean, boolean, time, time, boolean) to authenticated;
grant execute on function save_push_subscription(text, text, text, text, text) to authenticated;
