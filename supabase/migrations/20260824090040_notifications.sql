-- 040 — Notifications: subscriptions, preferences, and the feed
-- Source: docs/04-DATABASE.md section 4.7, docs/11-NOTIFICATIONS-SPEC.md.
--
-- The feed is the record. Section 1 of the notifications spec is explicit:
-- every notification writes a row here regardless of what push and Telegram
-- do afterwards. That is why `notifications` carries the content and the two
-- delivery timestamps rather than one row per channel — a member who reads the
-- feed has been told, whatever their phone did with it.

create table push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  house_id    uuid not null references houses(id) on delete cascade,
  member_id   uuid not null references house_members(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  -- Set when a send returns 404 or 410 so a broken device stops being retried
  -- before the next dispatcher run deletes it.
  failed_at   timestamptz,
  created_at  timestamptz not null default now()
);

create table telegram_links (
  member_id    uuid primary key references house_members(id) on delete cascade,
  house_id     uuid not null references houses(id) on delete cascade,
  chat_id      text not null,
  linked_at    timestamptz not null default now()
);

-- Section 7: a code such as LINK-7F2A, valid ten minutes, consumed once.
create table telegram_link_codes (
  code        text primary key,
  house_id    uuid not null references houses(id) on delete cascade,
  member_id   uuid not null references house_members(id) on delete cascade,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);

-- Section 6. `settlement_updates` is stored for symmetry and refused by
-- `set_notification_prefs`: a member who has muted the app cannot then claim
-- they were never told they owed money.
create table notification_prefs (
  member_id             uuid primary key references house_members(id) on delete cascade,
  house_id              uuid not null references houses(id) on delete cascade,
  chore_reminders       boolean not null default true,
  confirmation_requests boolean not null default true,
  chore_outcomes        boolean not null default true,
  house_activity        boolean not null default true,
  expense_activity      boolean not null default true,
  weekly_digest         boolean not null default true,
  settlement_updates    boolean not null default true,
  quiet_hours_start     time default '23:00',
  quiet_hours_end       time default '07:00',
  telegram_enabled      boolean not null default false,
  updated_at            timestamptz not null default now(),
  -- Both null means quiet hours are off. One of each is a half-open range with
  -- no end, which the dispatcher cannot act on.
  check ((quiet_hours_start is null) = (quiet_hours_end is null))
);

create table notifications (
  id             uuid primary key default gen_random_uuid(),
  house_id       uuid not null references houses(id) on delete cascade,
  member_id      uuid not null references house_members(id) on delete cascade,
  type           text not null,
  title          text not null,
  body           text not null,
  deep_link      text,
  channel        notify_channel not null default 'in_app',
  -- Push collapse key (section 4). A second reminder for the same chore
  -- replaces the first on the device rather than stacking beneath it.
  tag            text,
  priority       integer not null default 5,
  -- Everything the action handler needs, so the service worker does not have to
  -- parse the tag to find an assignment id.
  payload        jsonb not null default '{}'::jsonb,
  -- When it becomes eligible. `now()` for anything immediate; a computed
  -- instant for the availability-aware reminders of section 3.1.
  scheduled_for  timestamptz not null default now(),
  sent_at        timestamptz,
  push_sent_at   timestamptz,
  telegram_sent_at timestamptz,
  read_at        timestamptz,
  -- Set on a row that was folded into a coalesced digest instead of pushed.
  coalesced_into uuid references notifications(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index idx_notif_unread    on notifications(member_id, read_at) where read_at is null;
create index idx_notif_due       on notifications(scheduled_for) where sent_at is null;
create index idx_notif_member    on notifications(member_id, created_at desc);
create index idx_notif_house_day on notifications(house_id, created_at desc);
create index idx_notif_dedupe    on notifications(member_id, tag, scheduled_for);
create index idx_push_member     on push_subscriptions(member_id);
create index idx_push_house      on push_subscriptions(house_id);
create index idx_tg_code_expiry  on telegram_link_codes(expires_at) where consumed_at is null;

create trigger trg_notif_prefs_touch before update on notification_prefs
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Preferences exist for every member from the moment they exist, so no read
-- path has to cope with their absence and no member is silently opted out by a
-- missing row.
-- ---------------------------------------------------------------------------

create or replace function ensure_notification_prefs() returns trigger as $$
begin
  insert into notification_prefs (member_id, house_id)
  values (new.id, new.house_id)
  on conflict (member_id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_member_notification_prefs after insert on house_members
  for each row execute function ensure_notification_prefs();

-- Backfill for every member who predates this migration.
insert into notification_prefs (member_id, house_id)
select id, house_id from house_members
on conflict (member_id) do nothing;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table push_subscriptions   enable row level security;
alter table telegram_links       enable row level security;
alter table telegram_link_codes  enable row level security;
alter table notification_prefs   enable row level security;
alter table notifications        enable row level security;

-- A notification is addressed to one person. Housemates do not read each
-- other's feed, even inside the same house — N-12 reaches everybody by being
-- written to everybody, not by being readable by everybody.
create policy read_own_notifications on notifications
  for select using (
    member_id in (select id from house_members where user_id = auth.uid())
  );

create policy update_own_notifications on notifications
  for update using (
    member_id in (select id from house_members where user_id = auth.uid())
  ) with check (
    member_id in (select id from house_members where user_id = auth.uid())
  );

create policy manage_own_push_subscriptions on push_subscriptions
  for all using (
    member_id in (select id from house_members where user_id = auth.uid())
  ) with check (
    member_id in (select id from house_members where user_id = auth.uid())
  );

create policy read_own_telegram_link on telegram_links
  for select using (
    member_id in (select id from house_members where user_id = auth.uid())
  );

create policy delete_own_telegram_link on telegram_links
  for delete using (
    member_id in (select id from house_members where user_id = auth.uid())
  );

-- Link codes are never read by the browser. The bot resolves them through a
-- security-definer function with the service role; no policy is the point.
revoke all on telegram_link_codes from anon, authenticated;

create policy read_own_prefs on notification_prefs
  for select using (
    member_id in (select id from house_members where user_id = auth.uid())
  );

create policy update_own_prefs on notification_prefs
  for update using (
    member_id in (select id from house_members where user_id = auth.uid())
  ) with check (
    member_id in (select id from house_members where user_id = auth.uid())
  );

-- No insert policy anywhere on `notifications`: a member cannot write their own
-- feed, and cannot write anybody else's. Every row arrives through
-- `enqueue_notification` in migration 041, which is security definer.
