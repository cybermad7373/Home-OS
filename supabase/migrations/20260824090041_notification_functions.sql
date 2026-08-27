-- 041 — The notification catalogue, the enqueue path, and the domain triggers
-- Source: docs/11-NOTIFICATIONS-SPEC.md sections 2, 4, 5 and 6.
--
-- Where the copy lives, and why it lives here
-- -------------------------------------------
-- A notification is produced by a database event — a chore reaching
-- `done_pending`, an expense reaching `pending_approval` — and it has to exist
-- the moment that happens, not an hour later when the dispatcher next wakes.
-- So the row is written by a trigger, which means the copy has to be renderable
-- in SQL, which means it lives in a table rather than in TypeScript.
--
-- `lib/domain/notifications/copy.ts` holds the same strings for the client, and
-- `tests/unit/notifications-copy.test.ts` reads this file and fails if the two
-- ever drift. That is the single source of truth: not one location, but one
-- enforced agreement between two.

-- ---------------------------------------------------------------------------
-- The catalogue
-- ---------------------------------------------------------------------------

create table notification_types (
  type               text primary key,
  category           text not null,
  priority           integer not null,
  quiet_hours_exempt boolean not null default false,
  label              text not null,
  title_template     text not null,
  body_template      text not null,
  deep_link_template text not null
);

-- N-22's body depends on which side of the settlement the member is on.
create table notification_variants (
  type          text not null references notification_types(type) on delete cascade,
  variant       text not null,
  body_template text not null,
  primary key (type, variant)
);

alter table notification_types    enable row level security;
alter table notification_variants enable row level security;

-- Every signed-in member may read the catalogue: the preferences screen names
-- the categories, and the feed renders from it. It contains no house data.
create policy read_catalogue on notification_types    for select using (true);
create policy read_variants  on notification_variants for select using (true);

insert into notification_types
  (type, category, priority, quiet_hours_exempt, label, title_template, body_template, deep_link_template)
values
  ('N-01', 'chore_reminders',       5, false, 'Next week''s chores published',
   'Next week''s chores are up',
   'You have {n} chores, {points} points. First one: {chore}, {day}.',
   '/chores/mine'),
  ('N-02', 'chore_reminders',       5, false, 'A chore window is about to open',
   '{chore} — {time}',
   '{points} points. Window: {start} to {end}.',
   '/chores/mine'),
  ('N-03', 'chore_reminders',       5, false, 'A chore is still pending near its deadline',
   '{chore} still pending',
   'Due by {deadline}. {points} points.',
   '/chores/mine'),
  ('N-04', 'chore_reminders',       5, false, 'A chore was assigned to you',
   'You''ve been given {chore}',
   '{day}, {slot}. {points} points. Assigned by {admin}.',
   '/chores/mine'),
  ('N-05', 'chore_reminders',       5, false, 'A chore moved away from you',
   '{chore} moved to {name}',
   'You no longer have this one.',
   '/chores/mine'),
  ('N-06', 'confirmation_requests', 2, false, 'Someone marked a chore done',
   '{name} did {chore}',
   'Confirm it, or it auto-confirms in {hours}h.',
   '/chores/confirmations'),
  ('N-07', 'chore_outcomes',        5, false, 'Your chore was confirmed',
   '{points} points added',
   '{confirmer} confirmed {chore}. You''re at {earned} of {target} this week.',
   '/chores/mine'),
  ('N-08', 'chore_outcomes',        5, false, 'Your chore auto-confirmed',
   '{points} points added',
   '{chore} auto-confirmed — nobody responded in {hours}h.',
   '/chores/mine'),
  ('N-09', 'chore_outcomes',        5, false, 'Your chore was rejected',
   '{chore} was rejected',
   '{rejecter}: "{reason}" — you have until {deadline} to redo it.',
   '/chores/mine'),
  ('N-10', 'chore_outcomes',        5, false, 'A rejected chore was redone',
   '{name} redid {chore}',
   'Confirmed by {confirmer}.',
   '/chores'),
  ('N-11', 'chore_outcomes',        5, false, 'You missed a chore',
   '{chore} missed',
   '0 points. You''re {deficit} points behind this week.',
   '/chores/mine'),
  ('N-12', 'house_activity',        5, false, 'Someone in the house missed a chore',
   '{name} missed {chore}',
   '{points} points unearned. Currently {deficit} behind.',
   '/chores/standing'),
  ('N-13', 'chore_outcomes',        5, false, 'You are behind on points',
   'You''re {deficit} points behind',
   'At month end that''s about ₹{amount}. {n} chores left this week.',
   '/chores/mine'),
  ('N-14', 'chore_reminders',       5, false, 'Somebody wants to swap with you',
   '{name} wants to swap {chore}',
   '{day}, {points} points. "{message}"',
   '/chores/mine'),
  ('N-15', 'chore_reminders',       5, false, 'Your swap was accepted',
   '{name} took {chore}',
   'The {points} points go to them.',
   '/chores/mine'),
  ('N-16', 'chore_reminders',       5, false, 'Your swap was declined',
   '{name} declined {chore}',
   'It''s still yours — {day}, {deadline}.',
   '/chores/mine'),
  ('N-17', 'house_activity',        5, false, 'A chore was released to the pool',
   '{chore} is up for grabs',
   '{points} points, {day}. First to claim it gets them.',
   '/chores/pool'),
  ('N-18', 'expense_activity',      4, false, 'An expense needs approval',
   '{name} added ₹{amount}',
   '{category} — needs approval. Your share: ₹{share}.',
   '/expenses/approvals'),
  ('N-19', 'expense_activity',      5, false, 'Your expense was approved',
   '₹{amount} approved',
   'Approved by {approver}.',
   '/expenses'),
  ('N-20', 'expense_activity',      5, false, 'Your expense was rejected',
   '₹{amount} rejected',
   '{rejecter}: "{reason}"',
   '/expenses'),
  ('N-21', 'expense_activity',      5, false, 'A category crossed its budget',
   '{category} is at {percent}%',
   '₹{spent} of ₹{budget} this month.',
   '/money/daily'),
  ('N-22', 'settlement_updates',    1, true,  'A month was closed',
   '{month} is settled',
   '{outcome}',
   '/settle'),
  ('N-23', 'settlement_updates',    1, true,  'Somebody says they paid you',
   '{name} says they paid ₹{amount}',
   'Confirm when it lands.',
   '/settle'),
  ('N-24', 'settlement_updates',    1, true,  'Your payment was confirmed',
   '{name} confirmed your ₹{amount}',
   'Settled.',
   '/settle'),
  ('N-25', 'settlement_updates',    1, true,  'A settlement is still outstanding',
   '₹{amount} still unsettled',
   '{payer} to {receiver}, from {month}.',
   '/settle'),
  ('N-26', 'settlement_updates',    1, true,  'A closed month was reopened',
   '{month} was reopened',
   '{admin} reopened it for a late ₹{amount} expense. New amounts to follow.',
   '/settle'),
  ('N-27', 'house_activity',        5, false, 'A new member joined',
   '{name} joined the house',
   'Room {room}. Chores from next week.',
   '/house/members'),
  ('N-28', 'house_activity',        5, false, 'A guest was registered',
   '{host} has a guest: {name}',
   '{from} to {to}. Counts for shared costs.',
   '/house/guests'),
  ('N-29', 'weekly_digest',         5, false, 'The weekly digest',
   'This week in the house',
   '{summary}',
   '/chores/standing'),
  ('N-30', 'house_activity',        5, false, 'Chores could not be assigned',
   '{n} chores couldn''t be assigned',
   'Nobody is available for them. Tap to fix.',
   '/admin/schedule');

insert into notification_variants (type, variant, body_template) values
  ('N-22', 'owing',  'You owe ₹{amount}. Tap to pay.'),
  ('N-22', 'owed',   'You''re owed ₹{amount}.'),
  ('N-22', 'square', 'You''re square.');

-- ---------------------------------------------------------------------------
-- Rendering
-- ---------------------------------------------------------------------------

-- Substitutes {name} from the supplied variables. A key that is present in the
-- template and absent from the variables is left as-is rather than blanked,
-- so a bug shows up as a visible brace instead of a sentence with a hole in it.
create or replace function render_template(p_template text, p_vars jsonb)
returns text as $$
declare
  v_out text := p_template;
  v_key text;
begin
  if p_vars is null then return v_out; end if;

  for v_key in select jsonb_object_keys(p_vars) loop
    v_out := replace(v_out, '{' || v_key || '}', coalesce(p_vars ->> v_key, ''));
  end loop;

  return v_out;
end;
$$ language plpgsql immutable set search_path = public;

-- A dependent carries their name on the membership row and has no user.
create or replace function member_display_name(p_member_id uuid)
returns text as $$
  select coalesce(u.display_name, hm.display_name, 'Someone')
    from house_members hm
    left join users u on u.id = hm.user_id
   where hm.id = p_member_id;
$$ language sql security definer stable set search_path = public;

-- ---------------------------------------------------------------------------
-- The enqueue path. Everything that produces a notification goes through here.
-- ---------------------------------------------------------------------------

/**
 * Writes one feed row and schedules it.
 *
 * Duplicate suppression (section 5) is applied at write time: the same tag for
 * the same member within ten minutes, still unsent, is *replaced* rather than
 * added. The later row wins, because it carries the fresher numbers — a second
 * reminder knows the deadline moved and the first does not.
 *
 * A dependent has no device and no account, so nothing is enqueued for one.
 * Their guardian is notified by the caller where that is the intent.
 */
create or replace function enqueue_notification(
  p_house_id      uuid,
  p_member_id     uuid,
  p_type          text,
  p_vars          jsonb default '{}'::jsonb,
  p_tag           text default null,
  p_payload       jsonb default '{}'::jsonb,
  p_scheduled_for timestamptz default now(),
  p_variant       text default null
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
   where id = p_member_id and user_id is not null and status = 'active';
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

/** The same, to every active adult in the house, optionally excluding one. */
create or replace function enqueue_house_notification(
  p_house_id      uuid,
  p_type          text,
  p_vars          jsonb default '{}'::jsonb,
  p_exclude       uuid default null,
  p_tag           text default null,
  p_payload       jsonb default '{}'::jsonb,
  p_scheduled_for timestamptz default now(),
  p_admins_only   boolean default false
) returns integer as $$
declare
  v_member record;
  v_count  integer := 0;
begin
  for v_member in
    select id from house_members
     where house_id = p_house_id
       and status   = 'active'
       and user_id is not null
       and (p_exclude is null or id <> p_exclude)
       and (not p_admins_only or role = 'admin')
  loop
    if enqueue_notification(
         p_house_id, v_member.id, p_type, p_vars,
         case when p_tag is null then null else p_tag || '-' || v_member.id::text end,
         p_payload, p_scheduled_for) is not null then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- Domain triggers. Each one is the notification's trigger column from
-- section 2, expressed where the event actually happens.
-- ---------------------------------------------------------------------------

create or replace function notify_chore_status_change() returns trigger as $$
declare
  v_chore     text;
  v_hours     integer;
  v_actor     text;
  v_assignee  text;
  v_earned    integer;
  v_target    integer;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select name into v_chore from chore_templates where id = new.template_id;
  v_chore := coalesce(v_chore, 'a chore');

  -- N-06 — somebody marked it done; everybody else may confirm it.
  if new.status = 'done_pending' and new.assignee_member_id is not null then
    select auto_confirm_hours into v_hours from house_settings where house_id = new.house_id;
    v_assignee := member_display_name(new.assignee_member_id);

    perform enqueue_house_notification(
      new.house_id, 'N-06',
      jsonb_build_object('name', v_assignee, 'chore', v_chore,
                         'hours', coalesce(v_hours, 48)::text),
      new.assignee_member_id,
      'chore-' || new.id::text,
      jsonb_build_object('assignment_id', new.id, 'action', 'confirm'));
    return new;
  end if;

  -- N-07 and N-08 — the points landed, by a housemate or by the clock.
  if new.status = 'confirmed' and new.assignee_member_id is not null then
    if new.auto_confirmed then
      select auto_confirm_hours into v_hours from house_settings where house_id = new.house_id;
      perform enqueue_notification(
        new.house_id, new.assignee_member_id, 'N-08',
        jsonb_build_object('points', new.effort_points::text, 'chore', v_chore,
                           'hours', coalesce(v_hours, 48)::text),
        'chore-' || new.id::text,
        jsonb_build_object('assignment_id', new.id));
    else
      -- The ledger is written when a week *closes*, so mid-week the most recent
      -- row is last week's. It is the best available answer to "where am I
      -- against target", and a member with no closed week yet gets their own
      -- points back rather than a zero that reads like a bug.
      select earned_points, effective_target into v_earned, v_target
        from effort_ledger
       where member_id = new.assignee_member_id
       order by week_start desc
       limit 1;

      perform enqueue_notification(
        new.house_id, new.assignee_member_id, 'N-07',
        jsonb_build_object(
          'points', new.effort_points::text,
          'confirmer', member_display_name(new.confirmed_by),
          'chore', v_chore,
          'earned', coalesce(v_earned, new.effort_points)::text,
          'target', coalesce(v_target, 0)::text),
        'chore-' || new.id::text,
        jsonb_build_object('assignment_id', new.id));
    end if;
    return new;
  end if;

  -- N-09 — rejected, with the reason and the new deadline.
  if new.status = 'rejected' and new.assignee_member_id is not null then
    perform enqueue_notification(
      new.house_id, new.assignee_member_id, 'N-09',
      jsonb_build_object(
        'chore', v_chore,
        'rejecter', member_display_name(new.rejected_by),
        'reason', coalesce(new.rejected_reason, 'no reason given'),
        'deadline', to_char(new.deadline, 'DD Mon HH24:MI')),
      'chore-' || new.id::text,
      jsonb_build_object('assignment_id', new.id));
    return new;
  end if;

  -- N-11 — missed. The escalation to the house (N-12) is a separate job, two
  -- hours later, and only if this one goes unanswered.
  if new.status = 'missed' and new.assignee_member_id is not null then
    perform enqueue_notification(
      new.house_id, new.assignee_member_id, 'N-11',
      jsonb_build_object('chore', v_chore, 'deficit', '0'),
      'chore-' || new.id::text,
      jsonb_build_object('assignment_id', new.id, 'escalate_after',
                         (now() + interval '2 hours')::text));
    return new;
  end if;

  -- N-17 — released to the pool, first claim wins.
  if new.status = 'open' and old.status is distinct from 'open'
     and old.assignee_member_id is not null then
    perform enqueue_house_notification(
      new.house_id, 'N-17',
      jsonb_build_object('chore', v_chore, 'points', new.effort_points::text,
                         'day', to_char(new.chore_date, 'Day')),
      old.assignee_member_id,
      'pool-' || new.id::text,
      jsonb_build_object('assignment_id', new.id));

    -- N-05 — and the person it left.
    perform enqueue_notification(
      new.house_id, old.assignee_member_id, 'N-05',
      jsonb_build_object('chore', v_chore, 'name', 'the pool'),
      'chore-' || new.id::text,
      jsonb_build_object('assignment_id', new.id));
    return new;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_notify_chore_status after update on chore_assignments
  for each row execute function notify_chore_status_change();

create or replace function notify_expense_event() returns trigger as $$
declare
  v_category text;
  v_amount   text;
begin
  select name into v_category from expense_categories where id = new.category_id;
  v_amount := to_char(new.amount_paise / 100.0, 'FM999999990.00');

  if tg_op = 'INSERT' and new.status = 'pending_approval' then
    perform enqueue_house_notification(
      new.house_id, 'N-18',
      jsonb_build_object('name', member_display_name(new.paid_by_member_id),
                         'amount', v_amount,
                         'category', coalesce(v_category, 'Uncategorised'),
                         'share', '—'),
      new.paid_by_member_id,
      'expense-' || new.id::text,
      jsonb_build_object('expense_id', new.id, 'action', 'approve'));
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'approved' and old.status = 'pending_approval' then
      perform enqueue_notification(
        new.house_id, new.paid_by_member_id, 'N-19',
        jsonb_build_object('amount', v_amount,
                           'approver', member_display_name(new.approved_by)),
        'expense-' || new.id::text,
        jsonb_build_object('expense_id', new.id));
    elsif new.status = 'rejected' then
      perform enqueue_notification(
        new.house_id, new.paid_by_member_id, 'N-20',
        jsonb_build_object('amount', v_amount,
                           'rejecter', member_display_name(new.approved_by),
                           'reason', coalesce(new.rejection_reason, 'no reason given')),
        'expense-' || new.id::text,
        jsonb_build_object('expense_id', new.id));
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_notify_expense_insert after insert on expenses
  for each row execute function notify_expense_event();

create trigger trg_notify_expense_update after update on expenses
  for each row execute function notify_expense_event();

create or replace function notify_swap_event() returns trigger as $$
declare
  v_chore  text;
  v_points integer;
  v_day    text;
  v_deadline text;
begin
  select ct.name, ca.effort_points, to_char(ca.chore_date, 'Day'),
         to_char(ca.deadline, 'DD Mon HH24:MI')
    into v_chore, v_points, v_day, v_deadline
    from chore_assignments ca
    join chore_templates ct on ct.id = ca.template_id
   where ca.id = new.assignment_id;

  if tg_op = 'INSERT' then
    perform enqueue_notification(
      new.house_id, new.to_member_id, 'N-14',
      jsonb_build_object('name', member_display_name(new.from_member_id),
                         'chore', coalesce(v_chore, 'a chore'),
                         'day', coalesce(trim(v_day), 'this week'),
                         'points', coalesce(v_points, 0)::text,
                         'message', coalesce(new.message, '')),
      'swap-' || new.id::text,
      jsonb_build_object('swap_id', new.id, 'assignment_id', new.assignment_id));
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'accepted' then
      perform enqueue_notification(
        new.house_id, new.from_member_id, 'N-15',
        jsonb_build_object('name', member_display_name(new.to_member_id),
                           'chore', coalesce(v_chore, 'a chore'),
                           'points', coalesce(v_points, 0)::text),
        'swap-' || new.id::text,
        jsonb_build_object('swap_id', new.id));
    elsif new.status = 'declined' then
      perform enqueue_notification(
        new.house_id, new.from_member_id, 'N-16',
        jsonb_build_object('name', member_display_name(new.to_member_id),
                           'chore', coalesce(v_chore, 'a chore'),
                           'day', coalesce(trim(v_day), 'this week'),
                           'deadline', coalesce(v_deadline, 'the deadline')),
        'swap-' || new.id::text,
        jsonb_build_object('swap_id', new.id));
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_notify_swap_insert after insert on swap_requests
  for each row execute function notify_swap_event();

create trigger trg_notify_swap_update after update on swap_requests
  for each row execute function notify_swap_event();

create or replace function notify_settlement_event() returns trigger as $$
declare
  v_amount text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_amount := to_char(new.amount_paise / 100.0, 'FM999999990.00');

  if new.status = 'marked_paid' then
    perform enqueue_notification(
      new.house_id, new.to_member_id, 'N-23',
      jsonb_build_object('name', member_display_name(new.from_member_id),
                         'amount', v_amount),
      'settlement-' || new.id::text,
      jsonb_build_object('settlement_id', new.id));
  elsif new.status = 'confirmed' then
    perform enqueue_notification(
      new.house_id, new.from_member_id, 'N-24',
      jsonb_build_object('name', member_display_name(new.to_member_id),
                         'amount', v_amount),
      'settlement-' || new.id::text,
      jsonb_build_object('settlement_id', new.id));
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_notify_settlement after update on settlements
  for each row execute function notify_settlement_event();

create or replace function notify_member_approved() returns trigger as $$
declare
  v_room text;
begin
  if new.status = 'active' and old.status is distinct from 'active' then
    select r.name into v_room
      from room_assignments ra
      join rooms r on r.id = ra.room_id
     where ra.member_id = new.id and ra.to_date is null
     limit 1;

    perform enqueue_house_notification(
      new.house_id, 'N-27',
      jsonb_build_object('name', member_display_name(new.id),
                         'room', coalesce(v_room, 'not assigned yet')),
      new.id,
      'member-' || new.id::text,
      jsonb_build_object('member_id', new.id));
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_notify_member_approved after update on house_members
  for each row execute function notify_member_approved();

create or replace function notify_guest_registered() returns trigger as $$
begin
  perform enqueue_house_notification(
    new.house_id, 'N-28',
    jsonb_build_object('host', member_display_name(new.host_member_id),
                       'name', new.name,
                       'from', to_char(new.from_date, 'DD Mon'),
                       'to', to_char(new.to_date, 'DD Mon')),
    null,
    'guest-' || new.id::text,
    jsonb_build_object('guest_id', new.id));
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_notify_guest after insert on guests
  for each row execute function notify_guest_registered();

-- ---------------------------------------------------------------------------
-- What the browser is allowed to call
-- ---------------------------------------------------------------------------

create or replace function mark_notification_read(p_notification_id uuid)
returns void as $$
  update notifications
     set read_at = coalesce(read_at, now())
   where id = p_notification_id
     and member_id in (select id from house_members where user_id = auth.uid());
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
     and member_id in (select id from house_members where user_id = auth.uid());
  get diagnostics v_count = row_count;
  return v_count;
end;
$$ language plpgsql security definer set search_path = public;

/**
 * The `later` action of section 4 — an hour on, at most twice.
 *
 * The count lives in the row's payload rather than in the service worker,
 * because the service worker is per device and the limit is per notification: a
 * member with a phone and a laptop must not get four snoozes.
 */
create or replace function snooze_notification(p_notification_id uuid)
returns timestamptz as $$
declare
  v_row   notifications%rowtype;
  v_count integer;
  v_next  timestamptz;
begin
  select * into v_row from notifications
   where id = p_notification_id
     and member_id in (select id from house_members where user_id = auth.uid());

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  v_count := coalesce((v_row.payload ->> 'snoozes')::int, 0);
  if v_count >= 2 then
    return null;
  end if;

  v_next := greatest(now(), v_row.scheduled_for) + interval '1 hour';

  update notifications
     set scheduled_for = v_next,
         sent_at       = null,
         push_sent_at  = null,
         payload       = v_row.payload || jsonb_build_object('snoozes', v_count + 1)
   where id = p_notification_id;

  return v_next;
end;
$$ language plpgsql security definer set search_path = public;

/**
 * Preference updates. Settlement is accepted and ignored: it is stored as a
 * column for symmetry with the rest, and forced true here, because a member who
 * has muted the app cannot then claim they were never told they owed money.
 */
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
  p_telegram_enabled      boolean default null
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
         settlement_updates    = true,
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

/** One row per device, keyed by endpoint, re-registered on every app open. */
create or replace function save_push_subscription(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text default null
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

  insert into push_subscriptions (house_id, member_id, endpoint, p256dh, auth, user_agent)
  values (v_member.house_id, v_member.id, p_endpoint, p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update
    set member_id  = excluded.member_id,
        house_id   = excluded.house_id,
        p256dh     = excluded.p256dh,
        auth       = excluded.auth,
        user_agent = excluded.user_agent,
        failed_at  = null
  returning id into v_id;

  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function delete_push_subscription(p_endpoint text)
returns void as $$
  delete from push_subscriptions
   where endpoint = p_endpoint
     and member_id in (select id from house_members where user_id = auth.uid());
$$ language sql security definer set search_path = public;

/** Section 7 — a code such as LINK-7F2A, valid ten minutes. */
create or replace function create_telegram_link_code()
returns text as $$
declare
  v_member house_members%rowtype;
  v_code   text;
begin
  select * into v_member from house_members
   where user_id = auth.uid() and status = 'active'
   order by joined_date desc limit 1;

  if v_member.id is null then
    raise exception 'No active membership' using errcode = 'P0001';
  end if;

  -- Four hex characters is 65,536 codes against a ten-minute window and a
  -- house-sized population. Collisions are handled by the primary key, not by
  -- hoping.
  loop
    v_code := 'LINK-' || upper(encode(gen_random_bytes(2), 'hex'));
    exit when not exists (select 1 from telegram_link_codes where code = v_code);
  end loop;

  delete from telegram_link_codes
   where member_id = v_member.id and consumed_at is null;

  insert into telegram_link_codes (code, house_id, member_id, expires_at)
  values (v_code, v_member.house_id, v_member.id, now() + interval '10 minutes');

  return v_code;
end;
$$ language plpgsql security definer set search_path = public;

/** Called by the bot with the service role. Never by a browser. */
create or replace function consume_telegram_link_code(p_code text, p_chat_id text)
returns uuid as $$
declare
  v_row telegram_link_codes%rowtype;
begin
  select * into v_row from telegram_link_codes
   where code = upper(p_code) and consumed_at is null and expires_at > now();

  if not found then
    return null;
  end if;

  update telegram_link_codes set consumed_at = now() where code = v_row.code;

  insert into telegram_links (member_id, house_id, chat_id)
  values (v_row.member_id, v_row.house_id, p_chat_id)
  on conflict (member_id) do update
    set chat_id = excluded.chat_id, linked_at = now();

  update notification_prefs set telegram_enabled = true where member_id = v_row.member_id;

  return v_row.member_id;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- Grants. The default `PUBLIC` execute grant is revoked before anything is
-- handed back, so a function reachable only by a job stays that way (D-20).
-- ---------------------------------------------------------------------------

revoke execute on function enqueue_notification(uuid, uuid, text, jsonb, text, jsonb, timestamptz, text) from public, anon, authenticated;
revoke execute on function enqueue_house_notification(uuid, text, jsonb, uuid, text, jsonb, timestamptz, boolean) from public, anon, authenticated;
revoke execute on function consume_telegram_link_code(text, text) from public, anon, authenticated;
revoke execute on function render_template(text, jsonb) from public, anon;

grant execute on function mark_notification_read(uuid)        to authenticated;
grant execute on function mark_all_notifications_read(uuid)   to authenticated;
grant execute on function snooze_notification(uuid)           to authenticated;
grant execute on function set_notification_prefs(boolean, boolean, boolean, boolean, boolean, boolean, time, time, boolean, boolean) to authenticated;
grant execute on function save_push_subscription(text, text, text, text) to authenticated;
grant execute on function delete_push_subscription(text)      to authenticated;
grant execute on function create_telegram_link_code()         to authenticated;
grant execute on function member_display_name(uuid)           to authenticated;
