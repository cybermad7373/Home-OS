-- 046 — N-10 gets a producer
--
-- The notification catalogue has carried N-10, "a rejected chore was redone",
-- since migration 041, and nothing has ever raised it: PROGRESS.md recorded the
-- gap as "no redone-after-rejection transition distinct from an ordinary
-- confirmation".
--
-- There is one, and it was already being written. `reject_chore` increments
-- `retry_count`; nothing else touches it. So a row arriving at `confirmed` with
-- `retry_count > 0` is precisely a chore that was rejected and then done again,
-- and the trigger can say so without a new column or a new state.
--
-- The whole trigger function is restated here rather than patched, because
-- `create or replace function` replaces a body whole. The only change is the
-- N-10 block inside the `confirmed` branch.

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

    -- N-10 — a chore that had been rejected and was redone. `retry_count` is
    -- what makes this distinguishable from an ordinary confirmation: it is
    -- incremented by `reject_chore` and by nothing else, so a positive value on
    -- a confirmed row means exactly "this was done twice".
    --
    -- It goes to the house rather than to the doer, who has just had N-07 for
    -- the same event. The point of the notification is that the house sees the
    -- rejection was answered — an unanswered rejection is the state that turns
    -- into an argument.
    if coalesce(new.retry_count, 0) > 0 then
      perform enqueue_house_notification(
        new.house_id, 'N-10',
        jsonb_build_object(
          'name', member_display_name(new.assignee_member_id),
          'chore', v_chore,
          'confirmer', coalesce(member_display_name(new.confirmed_by), 'the clock')),
        new.assignee_member_id,
        'chore-' || new.id::text || '-redone',
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
