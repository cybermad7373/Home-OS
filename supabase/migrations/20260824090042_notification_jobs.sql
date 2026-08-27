-- 042 — The notification jobs, and the events that are not row updates
-- Source: docs/11-NOTIFICATIONS-SPEC.md sections 2.3, 2.5, 2.6 and 5.
--
-- Migration 041 covers everything that is a consequence of one row changing.
-- What is left is the notifications that are consequences of *time* — an
-- escalation two hours after a miss, a budget crossing at the end of the day, a
-- settlement still outstanding a week after the close.
--
-- These are plain SQL functions on `pg_cron`, not Edge Functions, because they
-- only write feed rows. Sending is the dispatcher's job and the dispatcher is
-- the only piece that needs to speak HTTP.

-- ---------------------------------------------------------------------------
-- N-01 and N-30 — the week was published
--
-- Publishing is not a single row update: `publish_schedule_for_house` writes a
-- run and then a week of assignments. Rather than rewrite that function and
-- risk what D-19 cost us the last time a working function was rewritten from a
-- copy, this is a separate call the two publish paths make afterwards.
-- ---------------------------------------------------------------------------

create or replace function notify_schedule_published(p_run_id uuid)
returns integer as $$
declare
  v_run    schedule_runs%rowtype;
  v_member record;
  v_first  record;
  v_count  integer := 0;
begin
  select * into v_run from schedule_runs where id = p_run_id;
  if not found then
    return 0;
  end if;

  for v_member in
    select hm.id
      from house_members hm
      join notification_prefs np on np.member_id = hm.id
     where hm.house_id = v_run.house_id
       and hm.status = 'active'
       and hm.user_id is not null
  loop
    select ct.name, ca.chore_date, count(*) over () as n,
           sum(ca.effort_points) over () as points
      into v_first
      from chore_assignments ca
      join chore_templates ct on ct.id = ca.template_id
     where ca.schedule_run_id = p_run_id
       and ca.assignee_member_id = v_member.id
     order by ca.window_start
     limit 1;

    if v_first.n is null or v_first.n = 0 then
      continue;
    end if;

    perform enqueue_notification(
      v_run.house_id, v_member.id, 'N-01',
      jsonb_build_object('n', v_first.n::text,
                         'points', coalesce(v_first.points, 0)::text,
                         'chore', v_first.name,
                         'day', trim(to_char(v_first.chore_date, 'Day'))),
      'schedule-' || p_run_id::text || '-' || v_member.id::text,
      jsonb_build_object('schedule_run_id', p_run_id));
    v_count := v_count + 1;
  end loop;

  -- N-30 — the admin is told what the solver could not place, because an open
  -- chore nobody can take is a configuration problem, not a member's problem.
  if v_run.unassigned_count > 0 then
    perform enqueue_house_notification(
      v_run.house_id, 'N-30',
      jsonb_build_object('n', v_run.unassigned_count::text),
      null,
      'unassigned-' || p_run_id::text,
      jsonb_build_object('schedule_run_id', p_run_id),
      now(),
      true);
  end if;

  return v_count;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- N-22 and N-26 — the month closed, and the month reopened
-- ---------------------------------------------------------------------------

create or replace function notify_period_status() returns trigger as $$
declare
  v_balance record;
  v_mode    money_mode;
  v_month   text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select money_mode into v_mode from house_settings where house_id = new.house_id;
  -- A family pot has nothing to settle, so telling everybody the month is
  -- settled would be telling them about a screen that is hidden (D-21).
  if v_mode = 'pot' then
    return new;
  end if;

  v_month := to_char(to_date(new.period || '-01', 'YYYY-MM-DD'), 'FMMonth YYYY');

  if new.status = 'closing' and old.status <> 'closing' then
    for v_balance in
      select member_id, final_net_paise
        from member_period_balances
       where period_id = new.id
    loop
      perform enqueue_notification(
        new.house_id, v_balance.member_id, 'N-22',
        jsonb_build_object(
          'month', v_month,
          'amount', to_char(abs(v_balance.final_net_paise) / 100.0, 'FM999999990.00')),
        'period-' || new.id::text || '-' || v_balance.member_id::text,
        jsonb_build_object('period_id', new.id),
        now(),
        case
          when v_balance.final_net_paise < 0 then 'owing'
          when v_balance.final_net_paise > 0 then 'owed'
          else 'square'
        end);
    end loop;
  elsif new.status = 'reopened' then
    perform enqueue_house_notification(
      new.house_id, 'N-26',
      jsonb_build_object('month', v_month,
                         'admin', coalesce(member_display_name(new.closed_by), 'An admin'),
                         'amount', '—'),
      null,
      'reopen-' || new.id::text,
      jsonb_build_object('period_id', new.id));
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_notify_period after update on monthly_periods
  for each row execute function notify_period_status();

-- ---------------------------------------------------------------------------
-- N-12 — the escalation
--
-- The sharpest notification in the product, and the one that turns a private
-- lapse into a house-visible fact. It fires only after the private N-11 has
-- gone unanswered for two hours, and at most once per member per day however
-- many chores they missed (section 5).
-- ---------------------------------------------------------------------------

create or replace function escalate_missed_chores() returns integer as $$
declare
  v_miss  record;
  v_count integer := 0;
begin
  for v_miss in
    select distinct on (ca.assignee_member_id)
           ca.id, ca.house_id, ca.assignee_member_id, ca.effort_points,
           ct.name as chore_name
      from chore_assignments ca
      join chore_templates ct on ct.id = ca.template_id
     where ca.status = 'missed'
       and ca.assignee_member_id is not null
       and ca.deadline < now() - interval '2 hours'
       and ca.deadline > now() - interval '2 days'
       -- Only if the private reminder actually went out. N-11 always precedes
       -- N-12 by two hours; it never overtakes it.
       and exists (
         select 1 from notifications n
          where n.type = 'N-11'
            and n.payload ->> 'assignment_id' = ca.id::text
            and n.sent_at is not null)
       -- One escalation per member per day, whatever else they missed.
       and not exists (
         select 1 from notifications n
          where n.type = 'N-12'
            and n.house_id = ca.house_id
            and n.payload ->> 'subject_member_id' = ca.assignee_member_id::text
            and n.created_at > date_trunc('day', now()))
     order by ca.assignee_member_id, ca.deadline
  loop
    perform enqueue_house_notification(
      v_miss.house_id, 'N-12',
      jsonb_build_object('name', member_display_name(v_miss.assignee_member_id),
                         'chore', v_miss.chore_name,
                         'points', v_miss.effort_points::text,
                         'deficit', coalesce((
                           select greatest(0, -carry_out)::text from effort_ledger
                            where member_id = v_miss.assignee_member_id
                            order by week_start desc limit 1), '0')),
      v_miss.assignee_member_id,
      'escalation-' || v_miss.id::text,
      jsonb_build_object('assignment_id', v_miss.id,
                         'subject_member_id', v_miss.assignee_member_id));
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- N-13 — the Friday deficit warning
--
-- Friday, not Sunday, because a warning that arrives after the last chore of
-- the week has passed is a bill, not a warning.
-- ---------------------------------------------------------------------------

create or replace function warn_deficits(p_threshold integer default 40)
returns integer as $$
declare
  v_row   record;
  v_count integer := 0;
begin
  for v_row in
    select el.house_id, el.member_id,
           el.effective_target - el.earned_points as deficit,
           hs.penalty_rate_paise,
           (select count(*) from chore_assignments ca
             where ca.assignee_member_id = el.member_id
               and ca.status in ('assigned', 'rejected')
               and ca.deadline > now()) as remaining
      from effort_ledger el
      join house_settings hs on hs.house_id = el.house_id
     where el.week_start = date_trunc('week', current_date)::date
       and hs.penalty_enabled
       and el.effective_target - el.earned_points > p_threshold
  loop
    perform enqueue_notification(
      v_row.house_id, v_row.member_id, 'N-13',
      jsonb_build_object(
        'deficit', v_row.deficit::text,
        'amount', to_char(v_row.deficit * v_row.penalty_rate_paise / 100.0, 'FM999999990'),
        'n', v_row.remaining::text),
      'deficit-' || v_row.member_id::text || '-' || current_date::text,
      jsonb_build_object('member_id', v_row.member_id));
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- N-21 — a budget crossed, on the day it crossed
--
-- Thresholds at 80 and 100 per cent. Each fires once per category per month, so
-- a house that keeps spending in an over-budget category is not told about it
-- every evening for a fortnight.
-- ---------------------------------------------------------------------------

create or replace function check_budget_thresholds() returns integer as $$
declare
  v_row   record;
  v_count integer := 0;
  v_step  integer;
begin
  for v_row in
    select c.house_id, c.id as category_id, c.name,
           c.monthly_budget_paise as budget,
           coalesce(sum(e.amount_paise), 0) as spent
      from expense_categories c
      left join expenses e
        on e.category_id = c.id
       and e.status = 'approved'
       and to_char(e.expense_date, 'YYYY-MM') = to_char(current_date, 'YYYY-MM')
     where c.active
       and c.monthly_budget_paise is not null
       and c.monthly_budget_paise > 0
     group by c.house_id, c.id, c.name, c.monthly_budget_paise
  loop
    v_step := case
                when v_row.spent >= v_row.budget then 100
                when v_row.spent * 100 >= v_row.budget * 80 then 80
                else null
              end;

    if v_step is null then
      continue;
    end if;

    -- Once per category per threshold per month.
    if exists (
      select 1 from notifications n
       where n.type = 'N-21'
         and n.house_id = v_row.house_id
         and n.payload ->> 'category_id' = v_row.category_id::text
         and (n.payload ->> 'threshold')::int >= v_step
         and to_char(n.created_at, 'YYYY-MM') = to_char(current_date, 'YYYY-MM')
    ) then
      continue;
    end if;

    perform enqueue_house_notification(
      v_row.house_id, 'N-21',
      jsonb_build_object(
        'category', v_row.name,
        'percent', floor(v_row.spent * 100.0 / v_row.budget)::text,
        'spent', to_char(v_row.spent / 100.0, 'FM999999990'),
        'budget', to_char(v_row.budget / 100.0, 'FM999999990')),
      null,
      'budget-' || v_row.category_id::text || '-' || v_step::text,
      jsonb_build_object('category_id', v_row.category_id, 'threshold', v_step));
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- N-25 — a settlement still outstanding, daily from day 7 after the close
-- ---------------------------------------------------------------------------

create or replace function remind_outstanding_settlements() returns integer as $$
declare
  v_row   record;
  v_count integer := 0;
  v_vars  jsonb;
begin
  for v_row in
    select s.id, s.house_id, s.from_member_id, s.to_member_id, s.amount_paise,
           p.period
      from settlements s
      join monthly_periods p on p.id = s.period_id
     where s.status in ('pending', 'marked_paid')
       and p.closed_at is not null
       and p.closed_at < now() - interval '7 days'
  loop
    v_vars := jsonb_build_object(
      'amount', to_char(v_row.amount_paise / 100.0, 'FM999999990.00'),
      'payer', member_display_name(v_row.from_member_id),
      'receiver', member_display_name(v_row.to_member_id),
      'month', to_char(to_date(v_row.period || '-01', 'YYYY-MM-DD'), 'FMMonth'));

    perform enqueue_notification(v_row.house_id, v_row.from_member_id, 'N-25', v_vars,
      'unsettled-' || v_row.id::text || '-' || current_date::text,
      jsonb_build_object('settlement_id', v_row.id));
    perform enqueue_notification(v_row.house_id, v_row.to_member_id, 'N-25', v_vars,
      'unsettled-' || v_row.id::text || '-' || current_date::text,
      jsonb_build_object('settlement_id', v_row.id));
    v_count := v_count + 2;
  end loop;

  return v_count;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- Housekeeping — section 8: entries older than 90 days are pruned.
-- ---------------------------------------------------------------------------

create or replace function prune_notifications() returns integer as $$
declare
  v_count integer;
begin
  delete from notifications where created_at < now() - interval '90 days';
  get diagnostics v_count = row_count;

  delete from telegram_link_codes where expires_at < now() - interval '1 day';

  return v_count;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- Schedule. Times are UTC; the comments give the Asia/Kolkata equivalent.
-- ---------------------------------------------------------------------------

-- Every fifteen minutes.
--
-- The spec says the dispatcher runs hourly. It cannot: N-02 is due thirty
-- minutes before a window opens, and a sixty-minute polling interval can put it
-- as much as an hour late — which is to say, after the window it was warning
-- about. Fifteen minutes is the coarsest interval that keeps a thirty-minute
-- lead meaningful. See DECISIONS.md D-27.
select cron.unschedule('dispatch-notifications')
 where exists (select 1 from cron.job where jobname = 'dispatch-notifications');

select cron.schedule(
  'dispatch-notifications',
  '*/15 * * * *',
  $$select call_edge('dispatch-notifications')$$
);

-- 05:00 IST — lay down today's chore reminders against today's availability.
select cron.unschedule('schedule-chore-reminders')
 where exists (select 1 from cron.job where jobname = 'schedule-chore-reminders');

select cron.schedule(
  'schedule-chore-reminders',
  '30 23 * * *',
  $$select call_edge('schedule-chore-reminders')$$
);

-- Sunday 21:00 IST — the digest, an hour after the week is published.
select cron.unschedule('weekly-digest')
 where exists (select 1 from cron.job where jobname = 'weekly-digest');

select cron.schedule(
  'weekly-digest',
  '30 15 * * 0',
  $$select call_edge('weekly-digest')$$
);

-- Hourly — the escalation. Its own two-hour delay is in the query, not here.
select cron.unschedule('escalate-missed')
 where exists (select 1 from cron.job where jobname = 'escalate-missed');

select cron.schedule('escalate-missed', '10 * * * *', $$select escalate_missed_chores()$$);

-- Friday 19:00 IST — the deficit warning, while the week can still be saved.
select cron.unschedule('warn-deficits')
 where exists (select 1 from cron.job where jobname = 'warn-deficits');

select cron.schedule('warn-deficits', '30 13 * * 5', $$select warn_deficits()$$);

-- 20:00 IST — budget thresholds, on the day they cross.
select cron.unschedule('budget-alerts')
 where exists (select 1 from cron.job where jobname = 'budget-alerts');

select cron.schedule('budget-alerts', '30 14 * * *', $$select check_budget_thresholds()$$);

-- 10:00 IST — the unsettled reminder.
select cron.unschedule('settlement-reminders')
 where exists (select 1 from cron.job where jobname = 'settlement-reminders');

select cron.schedule('settlement-reminders', '30 4 * * *',
                     $$select remind_outstanding_settlements()$$);

-- 03:00 IST on the first of the month — prune.
select cron.unschedule('prune-notifications')
 where exists (select 1 from cron.job where jobname = 'prune-notifications');

select cron.schedule('prune-notifications', '30 21 1 * *', $$select prune_notifications()$$);

-- Every one of these is reachable only by the job that owns it.
revoke execute on function notify_schedule_published(uuid) from public, anon, authenticated;
revoke execute on function escalate_missed_chores() from public, anon, authenticated;
revoke execute on function warn_deficits(integer) from public, anon, authenticated;
revoke execute on function check_budget_thresholds() from public, anon, authenticated;
revoke execute on function remind_outstanding_settlements() from public, anon, authenticated;
revoke execute on function prune_notifications() from public, anon, authenticated;
