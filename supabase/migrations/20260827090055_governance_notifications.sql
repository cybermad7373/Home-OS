-- 055 — The notifications governance and membership need, and the jobs behind them
--
-- Source: docs/11-NOTIFICATIONS-SPEC.md sections 2.8, 2.9 and 6,
-- docs/14-GOVERNANCE-SPEC.md section 3.4, docs/07-ROADMAP.md phase 11.
--
-- Migrations 051 to 053 built decisions that nobody is told about. A decision
-- nobody is told about is a decision that lapses, so this file is not a
-- cosmetic layer over the engine — it is the half that makes the engine work
-- at all.
--
-- Thirteen types arrive, N-32 to N-44. Every one of them is produced by a
-- trigger on the event itself rather than by the route handler that caused it,
-- for the reason migration 041 gives: the notification has to exist the moment
-- its cause happens, including when the cause is a cron job with nobody logged
-- in. The one exception is N-37, and the comment above it says why.

-- ---------------------------------------------------------------------------
-- A feed row for somebody who is not a member
-- ---------------------------------------------------------------------------
-- N-40 tells a person their request to join was declined. They have no
-- membership in that Home — that is the whole content of the message — so
-- there is no `house_members` row to address it to, and `notifications` as
-- written in migration 040 cannot hold it.
--
-- So a notification is addressed to a member or to a user, and exactly one of
-- the two. The member case is everything that existed before this migration
-- and is unchanged. The user case exists for the small family of messages
-- about a Home the reader is not in.
alter table notifications
  alter column member_id drop not null;

alter table notifications
  add column user_id uuid references users(id) on delete cascade;

alter table notifications
  add constraint notification_has_one_addressee check (
    (member_id is not null) <> (user_id is not null)
  );

create index idx_notif_user on notifications(user_id, created_at desc)
  where user_id is not null;

-- The feed reads through RLS and nothing else — `lib/data/notifications.ts`
-- passes no member filter — so extending the policy is the whole of the change
-- the client needs to see these.
drop policy read_own_notifications on notifications;
create policy read_own_notifications on notifications
  for select using (
    member_id in (select id from house_members where user_id = auth.uid())
    or user_id = auth.uid()
  );

drop policy update_own_notifications on notifications;
create policy update_own_notifications on notifications
  for update using (
    member_id in (select id from house_members where user_id = auth.uid())
    or user_id = auth.uid()
  ) with check (
    member_id in (select id from house_members where user_id = auth.uid())
    or user_id = auth.uid()
  );

-- Marking one read has to reach the same rows the feed shows, or a
-- user-addressed notification is permanently unread and the badge never clears.
create or replace function mark_notification_read(p_notification_id uuid)
returns void as $$
  update notifications
     set read_at = coalesce(read_at, now())
   where id = p_notification_id
     and (
       member_id in (select id from house_members where user_id = auth.uid())
       or user_id = auth.uid()
     );
$$ language sql security definer set search_path = public;

create or replace function mark_all_notifications_read(p_house_id uuid)
returns integer as $$
declare
  v_count integer;
begin
  update notifications
     set read_at = now()
   where house_id = p_house_id
     and read_at is null
     and (
       member_id in (select id from house_members where user_id = auth.uid())
       or user_id = auth.uid()
     );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- enqueue_notification gains one argument
-- ---------------------------------------------------------------------------
-- The function refuses to write to a member who is not active, which is right
-- for every notification except the one that tells somebody they have stopped
-- being active. N-43 is that notification, and a rule with an exception is
-- better stated than worked around.
--
-- Dropped and recreated rather than replaced: a trailing argument with a
-- default would make the eight-argument call ambiguous between the two
-- versions, and Postgres refuses such a call rather than guessing.
drop function enqueue_notification(uuid, uuid, text, jsonb, text, jsonb, timestamptz, text);

create or replace function enqueue_notification(
  p_house_id         uuid,
  p_member_id        uuid,
  p_type             text,
  p_vars             jsonb default '{}'::jsonb,
  p_tag              text default null,
  p_payload          jsonb default '{}'::jsonb,
  p_scheduled_for    timestamptz default now(),
  p_variant          text default null,
  p_even_if_inactive boolean default false
) returns uuid as $$
declare
  v_type      notification_types%rowtype;
  v_body_tpl  text;
  v_title     text;
  v_body      text;
  v_link      text;
  v_tag       text;
  v_existing  uuid;
  v_id        uuid;
begin
  select * into v_type from notification_types where type = p_type;
  if not found then
    raise exception 'Unknown notification type %', p_type using errcode = 'P0001';
  end if;

  -- Nothing is sent to a member without an account or without an active
  -- membership. A pending member is not yet part of the house (BR-003).
  perform 1 from house_members
   where id = p_member_id
     and user_id is not null
     and (status = 'active' or p_even_if_inactive);
  if not found then
    return null;
  end if;

  v_body_tpl := v_type.body_template;
  if p_variant is not null then
    select body_template into v_body_tpl
      from notification_variants
     where type = p_type and variant = p_variant;
    if not found then
      raise exception 'Unknown variant % for %', p_variant, p_type using errcode = 'P0001';
    end if;
  end if;

  v_title := render_template(v_type.title_template, p_vars);
  v_body  := render_template(v_body_tpl, p_vars);
  v_link  := render_template(v_type.deep_link_template, p_vars);
  v_tag   := coalesce(p_tag, p_type || '-' || p_member_id::text);

  select id into v_existing
    from notifications
   where member_id = p_member_id
     and tag       = v_tag
     and sent_at is null
     and scheduled_for between p_scheduled_for - interval '10 minutes'
                           and p_scheduled_for + interval '10 minutes'
   order by scheduled_for desc
   limit 1;

  if v_existing is not null then
    update notifications
       set type = p_type,
           title = v_title,
           body = v_body,
           deep_link = v_link,
           priority = v_type.priority,
           payload = p_payload,
           scheduled_for = p_scheduled_for
     where id = v_existing;
    return v_existing;
  end if;

  insert into notifications
    (house_id, member_id, type, title, body, deep_link, tag, priority, payload, scheduled_for)
  values
    (p_house_id, p_member_id, p_type, v_title, v_body, v_link, v_tag,
     v_type.priority, p_payload, p_scheduled_for)
  returning id into v_id;

  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

/**
 * The same, addressed to a user rather than to a member.
 *
 * Written as already sent. The dispatcher reaches people through
 * `push_subscriptions`, whose rows belong to memberships; somebody who is not a
 * member of this Home has no device registered against it, so there is nothing
 * for a later run to do with the row. Recording it as delivered in-app at the
 * moment it is written is the honest state, and it keeps the dispatcher's
 * "due" query — `sent_at is null` — free of rows it can never send.
 */
create or replace function enqueue_user_notification(
  p_house_id  uuid,
  p_user_id   uuid,
  p_type      text,
  p_vars      jsonb default '{}'::jsonb,
  p_payload   jsonb default '{}'::jsonb
) returns uuid as $$
declare
  v_type notification_types%rowtype;
  v_id   uuid;
begin
  select * into v_type from notification_types where type = p_type;
  if not found then
    raise exception 'Unknown notification type %', p_type using errcode = 'P0001';
  end if;

  insert into notifications
    (house_id, user_id, type, title, body, deep_link, tag, priority, payload,
     channel, scheduled_for, sent_at)
  values
    (p_house_id, p_user_id, p_type,
     render_template(v_type.title_template, p_vars),
     render_template(v_type.body_template, p_vars),
     render_template(v_type.deep_link_template, p_vars),
     p_type || '-' || p_user_id::text,
     v_type.priority, p_payload, 'in_app', now(), now())
  returning id into v_id;

  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- Three more preference switches
-- ---------------------------------------------------------------------------
-- Section 6. `decisions` is stored like `settlement_updates` and forced true
-- for the same kind of reason: a Home where a required participant can silence
-- the request and then say nobody asked has a governance model on paper only.
-- Muting these would make lapse the default outcome of every Critical decision.
--
-- `decision_outcomes` and `membership` are news rather than obligation, so they
-- are ordinary switches. The line is exactly that: if the notification asks the
-- reader to do something only they can do, it cannot be muted.
alter table notification_prefs
  add column decisions         boolean not null default true,
  add column decision_outcomes boolean not null default true,
  add column membership        boolean not null default true;

drop function if exists set_notification_prefs(boolean, boolean, boolean, boolean, boolean,
                                         boolean, time, time, boolean);

create or replace function set_notification_prefs(
  p_chore_reminders       boolean default null,
  p_confirmation_requests boolean default null,
  p_chore_outcomes        boolean default null,
  p_house_activity        boolean default null,
  p_expense_activity      boolean default null,
  p_weekly_digest         boolean default null,
  p_quiet_hours_start     time default null,
  p_quiet_hours_end       time default null,
  p_quiet_hours_off       boolean default false,
  p_telegram_enabled      boolean default null,
  p_decision_outcomes     boolean default null,
  p_membership            boolean default null
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

  update notification_prefs
     set chore_reminders       = coalesce(p_chore_reminders, chore_reminders),
         confirmation_requests = coalesce(p_confirmation_requests, confirmation_requests),
         chore_outcomes        = coalesce(p_chore_outcomes, chore_outcomes),
         house_activity        = coalesce(p_house_activity, house_activity),
         expense_activity      = coalesce(p_expense_activity, expense_activity),
         weekly_digest         = coalesce(p_weekly_digest, weekly_digest),
         decision_outcomes     = coalesce(p_decision_outcomes, decision_outcomes),
         membership            = coalesce(p_membership, membership),
         settlement_updates    = true,
         decisions             = true,
         quiet_hours_start     = case when p_quiet_hours_off then null
                                      else coalesce(p_quiet_hours_start, quiet_hours_start) end,
         quiet_hours_end       = case when p_quiet_hours_off then null
                                      else coalesce(p_quiet_hours_end, quiet_hours_end) end,
         telegram_enabled      = coalesce(p_telegram_enabled, telegram_enabled)
   where member_id = v_member
  returning * into v_row;

  return v_row;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- What a decision is asking for, in words
-- ---------------------------------------------------------------------------
-- "{proposer} wants to {action}" needs a verb phrase, and the phrase has to
-- exist in SQL because the notification is rendered by a trigger.
-- `DECISION_ACTION_PHRASE` in `lib/types/domain.ts` is the same map for the
-- client, and `tests/unit/governance-notifications.test.ts` reads this function
-- and fails if the two ever differ.
create or replace function decision_action_phrase(p_type decision_type)
returns text as $$
  select case p_type
    when 'close_settlement'          then 'close the month'
    when 'reopen_settlement'         then 'reopen a closed month'
    when 'remove_member'             then 'remove a member'
    when 'change_rule'               then 'change a house rule'
    when 'change_governance'         then 'change how decisions are made'
    when 'change_home_mode'          then 'change how the home works'
    when 'balance_adjustment'        then 'adjust a balance'
    when 'absence_request'           then 'take time away'
    when 'join_request'              then 'let somebody join'
    when 'expense_approval'          then 'approve an expense'
    when 'chore_confirmation'        then 'confirm a chore'
    when 'set_expected_contribution' then 'set an expected contribution'
    when 'create_reserve'            then 'start a reserve'
    when 'reserve_draw'              then 'draw from the reserve'
  end;
$$ language sql immutable;

-- ---------------------------------------------------------------------------
-- The catalogue
-- ---------------------------------------------------------------------------
-- Priorities follow section 5: a decision waiting on the reader is an approval
-- and sorts at 4; a decision that has already happened is news and sorts at 5.
--
-- Only N-33 is exempt from quiet hours. Section 6 exempts "decisions with a
-- deadline inside 24 hours", and N-33 is by definition the one sent inside
-- that window; exempting N-32 as well would let a proposal raised at any
-- distance from its deadline wake the Home at two in the morning.
insert into notification_types
  (type, category, priority, quiet_hours_exempt, label, title_template, body_template, deep_link_template)
values
  ('N-32', 'decisions', 4, false, 'A decision needs your response',
   '{proposer} wants to {action}',
   'You need to {verb} this. {n} others too.',
   '/more/approvals/{id}'),
  ('N-33', 'decisions', 4, true, 'A decision deadline is approaching',
   '{action} — 1 day left',
   'Nothing happens until you answer.',
   '/more/approvals/{id}'),
  ('N-34', 'decision_outcomes', 5, false, 'A decision resolved',
   '{action}: {outcome}',
   '{n} approved, {m} acknowledged.',
   '/more/decisions'),
  ('N-35', 'decisions', 4, false, 'Your decision was rejected',
   '{name} said no to {action}',
   '"{reason}"',
   '/more/decisions'),
  ('N-36', 'decisions', 4, false, 'A decision lapsed',
   '{action} lapsed',
   'Nobody answered in time. Nothing changed.',
   '/more/decisions'),
  ('N-37', 'decisions', 4, false, 'A decision was approved and could not be applied',
   '{action} couldn''t be done',
   'The house agreed, but: {reason}',
   '/more/decisions'),
  ('N-38', 'membership', 4, false, 'Somebody asked to join',
   '{name} wants to join',
   '"{message}"',
   '/house/members'),
  ('N-39', 'membership', 5, false, 'Your request was accepted',
   'You''re in — {home}',
   'Set when you''re home, and you''re done.',
   '/house/availability'),
  ('N-40', 'membership', 5, false, 'Your request was declined',
   '{home} declined your request',
   '"{reason}"',
   '/homes'),
  ('N-41', 'house_activity', 5, false, 'A new member joined',
   '{name} joined',
   'Chores from next week.',
   '/house/members'),
  ('N-42', 'decisions', 4, false, 'Your removal was proposed',
   '{proposer} proposed removing you',
   '"{reason}" — the house is deciding.',
   '/more/decisions'),
  ('N-43', 'decisions', 4, false, 'You are inactive, pending settlement',
   'You''re no longer active in {home}',
   '₹{amount} is still to settle. You''ll stay in the money view until it''s clear.',
   '/settle'),
  ('N-44', 'membership', 5, false, 'You were made a co-admin',
   'You''re a co-admin of {home}',
   'You can now approve day-to-day things and you''re needed for the big ones.',
   '/house/members');

-- ---------------------------------------------------------------------------
-- N-32, and N-42 alongside it
-- ---------------------------------------------------------------------------
-- Two deferred constraint triggers rather than a line at the end of
-- `create_decision`, which would have meant restating its hundred and fifty
-- lines to add one call — the duplication D-19 accepted reluctantly and only
-- where there was no other option.
--
-- Deferred, because both need the whole proposal to exist. `create_decision`
-- writes the decision row first and its participants after, so an ordinary
-- `after insert` trigger on `decisions` would count no participants and tell
-- nobody. A deferred one runs at commit, when the proposal is whole.
--
-- N-32 hangs off `decision_participants` rather than off `decisions`, so that
-- it does not depend on the two writes sharing a transaction. Every path that
-- adds a participant tells that participant, whether the row arrived from
-- `create_decision`, from a later slice of this phase, or from a script.
create or replace function notify_decision_participant() returns trigger as $$
declare
  v_decision decisions%rowtype;
  v_capacity text;
  v_total    integer;
begin
  select * into v_decision from decisions where id = new.decision_id;

  -- Nothing to ask about a decision that has already resolved: a one-person
  -- Home's Critical decision is auto-approved inside the same transaction
  -- (spec 3.3), and a cancelled one is not waiting on anybody.
  if v_decision.id is null or v_decision.status <> 'waiting' then
    return null;
  end if;

  -- A member may be listed in both capacities. 'approver' sorts after
  -- 'acknowledger', and the stronger ask is the true one; the tag below is per
  -- member, so the second row updates the first rather than arriving twice.
  select count(distinct member_id) into v_total
    from decision_participants
   where decision_id = new.decision_id;

  select max(capacity::text) into v_capacity
    from decision_participants
   where decision_id = new.decision_id and member_id = new.member_id;

  -- NT-07: addressed only to the people whose response is required.
  -- Broadcasting a decision to the whole Home is how the Approvals queue
  -- becomes noise everyone learns to ignore.
  perform enqueue_notification(
    v_decision.house_id, new.member_id, 'N-32',
    jsonb_build_object(
      'proposer', member_display_name(v_decision.requested_by),
      'action',   decision_action_phrase(v_decision.type),
      'verb',     case when v_capacity = 'approver' then 'approve' else 'acknowledge' end,
      'n',        greatest(v_total - 1, 0),
      'id',       v_decision.id::text
    ),
    'N-32-' || v_decision.id::text || '-' || new.member_id::text,
    jsonb_build_object('decision_id', v_decision.id)
  );

  return null;
end;
$$ language plpgsql security definer set search_path = public;

create constraint trigger trg_decision_participant_added
  after insert on decision_participants
  deferrable initially deferred
  for each row execute function notify_decision_participant();

-- N-42 goes to the person being removed, at proposal time rather than after
-- the fact. A Home that decides to remove somebody without telling them is not
-- using a governance feature, it is using a trapdoor. They are never a
-- participant — migration 051 enforces that — so this is the only message they
-- get, and it is deliberately sent before anything is decided.
create or replace function notify_decision_created() returns trigger as $$
declare
  v_decision decisions%rowtype;
begin
  select * into v_decision from decisions where id = new.id;
  if v_decision.id is null or v_decision.status <> 'waiting' then
    return null;
  end if;

  if v_decision.type = 'remove_member' and v_decision.subject_member_id is not null then
    perform enqueue_notification(
      v_decision.house_id, v_decision.subject_member_id, 'N-42',
      jsonb_build_object(
        'proposer', member_display_name(v_decision.requested_by),
        'reason',   coalesce(v_decision.reason, 'no reason given')
      ),
      'N-42-' || v_decision.id::text,
      jsonb_build_object('decision_id', v_decision.id)
    );
  end if;

  return null;
end;
$$ language plpgsql security definer set search_path = public;

create constraint trigger trg_decision_created
  after insert on decisions
  deferrable initially deferred
  for each row execute function notify_decision_created();

-- ---------------------------------------------------------------------------
-- N-34, N-35 and N-36
-- ---------------------------------------------------------------------------
-- One trigger for all three, because they are one event seen from three
-- positions: the Home learns the outcome, the proposer learns a rejection, and
-- everybody who bothered to answer learns that the answer went nowhere.
--
-- `applied` produces nothing. The Home was told when the decision became
-- approved, and being told twice about one decision is how a queue becomes
-- noise.
create or replace function notify_decision_resolved() returns trigger as $$
declare
  v_action    text;
  v_approvals integer;
  v_acks      integer;
  v_rejecter  text;
  v_reason    text;
  v_member    record;
begin
  v_action := decision_action_phrase(new.type);

  select count(*) filter (where response = 'approve'),
         count(*) filter (where response = 'acknowledge')
    into v_approvals, v_acks
    from decision_responses where decision_id = new.id;

  if new.status in ('approved', 'rejected') then
    perform enqueue_house_notification(
      new.house_id, 'N-34',
      jsonb_build_object(
        'action',  v_action,
        'outcome', case when new.status = 'approved' then 'approved' else 'rejected' end,
        'n',       v_approvals,
        'm',       v_acks
      ),
      null,
      'N-34-' || new.id::text,
      jsonb_build_object('decision_id', new.id)
    );
  end if;

  if new.status = 'rejected' then
    select member_display_name(r.member_id), r.reason
      into v_rejecter, v_reason
      from decision_responses r
     where r.decision_id = new.id and r.response = 'reject'
     order by r.responded_at
     limit 1;

    perform enqueue_notification(
      new.house_id, new.requested_by, 'N-35',
      jsonb_build_object(
        'name',   coalesce(v_rejecter, 'Somebody'),
        'action', v_action,
        'reason', coalesce(v_reason, 'no reason given')
      ),
      'N-35-' || new.id::text,
      jsonb_build_object('decision_id', new.id)
    );
  end if;

  if new.status = 'lapsed' then
    -- The proposer, and everybody who did answer. Somebody who answered and
    -- watched it lapse is owed the same courtesy as the person who asked: they
    -- spent attention on it, and nothing came of it.
    for v_member in
      select new.requested_by as member_id
      union
      select distinct member_id from decision_responses where decision_id = new.id
    loop
      perform enqueue_notification(
        new.house_id, v_member.member_id, 'N-36',
        jsonb_build_object('action', v_action),
        'N-36-' || new.id::text || '-' || v_member.member_id::text,
        jsonb_build_object('decision_id', new.id)
      );
    end loop;
  end if;

  return null;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_decision_resolved
  after update of status on decisions
  for each row
  when (old.status is distinct from new.status)
  execute function notify_decision_resolved();

-- ---------------------------------------------------------------------------
-- N-37 — approved, and could not be carried out
-- ---------------------------------------------------------------------------
-- The one notification in this file with no trigger behind it, because it has
-- no database event behind it either. `apply_decision` runs the effect inside
-- its own transaction and raises when the effect refuses, which rolls back
-- everything it touched — a notification written there would roll back with it.
-- The failure survives only in the application path that caught it, so that is
-- where the call lives: `applyIfApproved` in `lib/data/governance.ts`.
create or replace function notify_apply_refused(p_decision_id uuid, p_reason text)
returns uuid as $$
declare
  v_decision decisions%rowtype;
begin
  select * into v_decision from decisions where id = p_decision_id;
  if v_decision.id is null then
    return null;
  end if;

  return enqueue_notification(
    v_decision.house_id, v_decision.requested_by, 'N-37',
    jsonb_build_object(
      'action', decision_action_phrase(v_decision.type),
      'reason', coalesce(nullif(btrim(p_reason), ''), 'the app could not do it')
    ),
    'N-37-' || v_decision.id::text,
    jsonb_build_object('decision_id', v_decision.id)
  );
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function notify_apply_refused(uuid, text) from public, anon, authenticated;
grant  execute on function notify_apply_refused(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- N-38, N-39 and N-40 — the join request, from both ends
-- ---------------------------------------------------------------------------
create or replace function notify_join_request() returns trigger as $$
declare
  v_name text;
  v_home text;
  v_lead record;
begin
  select display_name into v_name from users where id = new.user_id;
  select name into v_home from houses where id = new.house_id;

  if tg_op = 'INSERT' then
    -- Leads, which is Admin and Co-Admin both. `enqueue_house_notification`'s
    -- admins-only flag predates the Co-Admin role and would silently miss half
    -- of them.
    for v_lead in
      select id from house_members
       where house_id = new.house_id
         and status = 'active'
         and role in ('admin', 'co_admin')
    loop
      perform enqueue_notification(
        new.house_id, v_lead.id, 'N-38',
        jsonb_build_object(
          'name',    coalesce(v_name, 'Somebody'),
          'message', coalesce(nullif(btrim(new.message), ''), 'No message')
        ),
        'N-38-' || new.id::text || '-' || v_lead.id::text,
        jsonb_build_object('join_request_id', new.id)
      );
    end loop;
    return null;
  end if;

  if new.status = 'accepted' and new.member_id is not null then
    perform enqueue_notification(
      new.house_id, new.member_id, 'N-39',
      jsonb_build_object('home', coalesce(v_home, 'the home')),
      'N-39-' || new.id::text,
      jsonb_build_object('join_request_id', new.id)
    );
  end if;

  -- A declined request is the one message in the product addressed to somebody
  -- who is not a member of the Home it is about.
  if new.status = 'declined' then
    perform enqueue_user_notification(
      new.house_id, new.user_id, 'N-40',
      jsonb_build_object(
        'home',   coalesce(v_home, 'The home'),
        'reason', coalesce(nullif(btrim(new.decline_reason), ''), 'No reason given')
      ),
      jsonb_build_object('join_request_id', new.id)
    );
  end if;

  return null;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_join_request_created
  after insert on join_requests
  for each row execute function notify_join_request();

create trigger trg_join_request_decided
  after update of status on join_requests
  for each row
  when (old.status is distinct from new.status)
  execute function notify_join_request();

-- ---------------------------------------------------------------------------
-- N-41, N-43 and N-44 — what happens to a membership
-- ---------------------------------------------------------------------------
-- On `house_members` rather than on the functions that write it, so that every
-- path is covered: a request accepted, an invitation taken up, a removal
-- applied by a decision, and a removal completed by the daily job.
create or replace function notify_membership_change() returns trigger as $$
declare
  v_home       text;
  v_name       text;
  v_owed_paise bigint;
begin
  select name into v_home from houses where id = new.house_id;

  if new.status = 'active' and old.status is distinct from 'active' then
    v_name := member_display_name(new.id);
    perform enqueue_house_notification(
      new.house_id, 'N-41',
      jsonb_build_object('name', v_name),
      new.id,
      'N-41-' || new.id::text,
      jsonb_build_object('member_id', new.id)
    );
  end if;

  if new.role = 'co_admin' and old.role is distinct from 'co_admin' then
    perform enqueue_notification(
      new.house_id, new.id, 'N-44',
      jsonb_build_object('home', coalesce(v_home, 'the home')),
      'N-44-' || new.id::text,
      jsonb_build_object('member_id', new.id)
    );
  end if;

  -- The removal has taken effect and the money has not moved (D-45). The
  -- amount is stated rather than left to be discovered, and this is the one
  -- notification allowed to reach a member who is no longer active — telling
  -- somebody they are inactive is not something to withhold on the grounds
  -- that they are inactive.
  --
  -- Paise become rupees here because this is the boundary: the string is
  -- rendered now and read by a person, not stored and recalculated.
  if new.status = 'inactive'
     and new.pending_settlement
     and (old.status is distinct from 'inactive' or not old.pending_settlement)
  then
    select coalesce(sum(amount_paise), 0) into v_owed_paise
      from settlements
     where status <> 'confirmed'
       and (from_member_id = new.id or to_member_id = new.id);

    perform enqueue_notification(
      new.house_id, new.id, 'N-43',
      jsonb_build_object(
        'home',   coalesce(v_home, 'the home'),
        'amount', to_char(v_owed_paise / 100.0, 'FM999999990.00')
      ),
      'N-43-' || new.id::text,
      jsonb_build_object('member_id', new.id),
      now(), null, true
    );
  end if;

  return null;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_membership_change
  after update on house_members
  for each row
  when (
    old.status is distinct from new.status
    or old.role is distinct from new.role
    or old.pending_settlement is distinct from new.pending_settlement
  )
  execute function notify_membership_change();

-- ---------------------------------------------------------------------------
-- N-33 — the reminder job
-- ---------------------------------------------------------------------------
-- Twenty-four hours before a deadline, to the people who have not answered.
-- Runs hourly and must not repeat itself, so it asks whether an N-33 already
-- exists for this decision and this member — `enqueue_notification`'s own
-- ten-minute dedupe window is built for a job that runs on the minute, and this
-- one runs on the hour.
--
-- Returns the number of reminders sent, which is what the cron log shows.
create or replace function remind_decision_participants() returns integer as $$
declare
  v_row   record;
  v_tag   text;
  v_count integer := 0;
begin
  for v_row in
    select d.id, d.house_id, d.type, p.member_id
      from decisions d
      join decision_participants p on p.decision_id = d.id
     where d.status = 'waiting'
       and d.deadline is not null
       and d.deadline > now()
       and d.deadline <= now() + interval '24 hours'
       and not exists (
         select 1 from decision_responses r
          where r.decision_id = d.id and r.member_id = p.member_id
       )
     group by d.id, d.house_id, d.type, p.member_id
  loop
    v_tag := 'N-33-' || v_row.id::text || '-' || v_row.member_id::text;

    if exists (select 1 from notifications where tag = v_tag) then
      continue;
    end if;

    if enqueue_notification(
         v_row.house_id, v_row.member_id, 'N-33',
         jsonb_build_object(
           'action', decision_action_phrase(v_row.type),
           'id',     v_row.id::text
         ),
         v_tag,
         jsonb_build_object('decision_id', v_row.id)
       ) is not null
    then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function remind_decision_participants() from public, anon, authenticated;
grant  execute on function remind_decision_participants() to service_role;

-- ---------------------------------------------------------------------------
-- The schedules
-- ---------------------------------------------------------------------------
-- `complete_pending_removals` was scheduled by migration 050. These are the
-- other two of the three governance jobs. Both run hourly and both are cheap:
-- the expiry sweep is indexed on `(deadline) where status = 'waiting'`, and the
-- reminder sweep reads a 24-hour window of the same index.
--
-- Five past the hour and twenty past, rather than both on the hour, so that a
-- decision lapsing is not competing with the reminder that would have told
-- somebody to answer it.
select cron.schedule('expire-decisions', '5 * * * *',
  $$select expire_decisions()$$);

select cron.schedule('decision-reminders', '20 * * * *',
  $$select remind_decision_participants()$$);
