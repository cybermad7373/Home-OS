-- 058 — Shared chore assignment (CE-11) and change_confirmation_policy
--
-- Source: docs/14-GOVERNANCE-SPEC.md section 4, docs/07-ROADMAP.md phase 11 slice 4.
--
-- Two changes in one migration because they touch the same tables:
--
-- 1. Shared assignment (CE-11): an instance may have more than one assignee.
--    The points are divided exactly (no rounding loss) among all assignees.
--    The confirmation quorum excludes ALL assignees.
--
-- 2. change_confirmation_policy: the 15th decision type. It is the only way
--    to write house_settings.confirmation_policy (D-60). Deciding to stop
--    checking each other's work is a Critical decision, not an Admin preference.

-- ---------------------------------------------------------------------------
-- chore_assignments.shared_with
-- ---------------------------------------------------------------------------
-- An array of member_ids who share this assignment. Empty array = solo.
-- The assignee_member_id remains the "primary" for display/legacy purposes.
-- Points are divided equally among (1 + array_length(shared_with)) people.
-- The division is exact: 25 points among 3 = 8 / 8 / 9 (remainder to first).
alter table chore_assignments
  add column shared_with uuid[] not null default '{}';

-- The quorum excludes all assignees (primary + shared). A shared assignment
-- with 2 people in a 3-person house has 0 eligible confirmers → auto-confirms.
-- The chore_quorum_for function is updated below to handle this.

-- ---------------------------------------------------------------------------
-- decision_type enum: add change_confirmation_policy
-- ---------------------------------------------------------------------------
-- This is the 15th decision type. It is Critical and requires the Home to
-- agree before changing how confirmations work.
alter type decision_type add value 'change_confirmation_policy';

-- ---------------------------------------------------------------------------
-- effect_change_confirmation_policy
-- ---------------------------------------------------------------------------
create or replace function effect_change_confirmation_policy(p_decision decisions)
returns jsonb as $$
declare
  v_payload jsonb := coalesce(p_decision.payload, '{}'::jsonb);
  v_policy  house_settings%rowtype;
  v_before  jsonb;
begin
  if v_payload ? 'confirmation_policy' then
    select * into v_policy from house_settings where house_id = p_decision.house_id;
    v_before := to_jsonb(v_policy);

    update house_settings
       set confirmation_policy = (v_payload ->> 'confirmation_policy')::confirmation_policy
     where house_id = p_decision.house_id;

    select * into v_policy from house_settings where house_id = p_decision.house_id;

    return jsonb_build_object('before', v_before, 'after', to_jsonb(v_policy));
  end if;

  return jsonb_build_object('unchanged', true);
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function effect_change_confirmation_policy(decisions) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Update apply_decision_effect dispatcher
-- ---------------------------------------------------------------------------
create or replace function apply_decision_effect(
  p_decision decisions,
  p_input    jsonb default '{}'::jsonb
) returns jsonb as $$
begin
  case p_decision.type
    when 'remove_member'             then return effect_remove_member(p_decision);
    when 'join_request'              then return effect_join_request(p_decision);
    when 'change_governance'         then return effect_change_governance(p_decision);
    when 'change_home_mode'          then return effect_change_home_mode(p_decision);
    when 'absence_request'           then return effect_absence_request(p_decision);
    when 'change_confirmation_policy' then return effect_change_confirmation_policy(p_decision);
  else
    raise exception 'EFFECT_NOT_IMPLEMENTED: %', p_decision.type
      using errcode = 'feature_not_supported';
  end case;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function apply_decision_effect(decisions, jsonb)
  from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- shared_with is a set of this Home's other active members
-- ---------------------------------------------------------------------------
-- A check constraint cannot reach house_members, so the rule is a trigger, in
-- the same spirit as `no_self_confirm_row` in 054: the service-role key
-- bypasses RLS and does not bypass this.
create or replace function chore_shared_with_is_sane() returns trigger as $$
declare
  v_bad integer;
begin
  if coalesce(array_length(new.shared_with, 1), 0) = 0 then
    return new;
  end if;

  if new.assignee_member_id = any (new.shared_with) then
    raise exception 'SHARED_WITH_INCLUDES_ASSIGNEE' using errcode = 'check_violation';
  end if;

  -- Duplicates would divide the points more ways than there are people.
  if array_length(new.shared_with, 1)
     <> (select count(distinct entry) from unnest(new.shared_with) as entry) then
    raise exception 'SHARED_WITH_DUPLICATE' using errcode = 'check_violation';
  end if;

  select count(*) into v_bad
    from unnest(new.shared_with) as shared_member_id
   where not exists (
     select 1 from house_members hm
      where hm.id       = shared_member_id
        and hm.house_id = new.house_id
        and hm.status   = 'active'
   );
  if v_bad > 0 then
    raise exception 'SHARED_WITH_NOT_A_MEMBER' using errcode = 'check_violation';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_chore_shared_with_is_sane
  before insert or update of shared_with, assignee_member_id on chore_assignments
  for each row execute function chore_shared_with_is_sane();

-- ---------------------------------------------------------------------------
-- chore_quorum_for — 054's table, with every assignee out of the pool
-- ---------------------------------------------------------------------------
-- Restated rather than wrapped, because the only thing that changes is which
-- people the pool is drawn from. The counts are unchanged, and still mirror
-- `quorumFor` in lib/domain/governance/quorum.ts value for value — there is a
-- test named "reads the same counts the pure function does" that says so.
--
-- The third parameter defaults, so the two-argument call every existing caller
-- makes still resolves: `chore_quorum_for(house, member)` answers "what would
-- a solo chore for this person need", which is what the preview and the RPC
-- ask. `mark_chore_done` passes the assignment's real `shared_with`, because
-- that is the pool the chore is actually judged by.
--
-- Must drop first: adding a parameter to a function that returns table is not
-- something `create or replace` will do (SQLSTATE 42P13).
drop function if exists chore_quorum_for(uuid, uuid);

create function chore_quorum_for(
  p_house_id           uuid,
  p_assignee_member_id uuid,
  p_shared_with        uuid[] default '{}'
) returns table (required integer, lead_required boolean, auto_confirm boolean) as $$
declare
  v_policy      confirmation_policy;
  v_assignees   uuid[];
  v_adults      integer;
  v_others      integer;
  v_leads_avail boolean;
begin
  select hs.confirmation_policy into v_policy
    from house_settings hs where hs.house_id = p_house_id;
  v_policy := coalesce(v_policy, 'size_aware');

  -- CE-10. A Home that switched confirmation off asks nobody, at any size.
  if v_policy = 'off' then
    return query select 0, false, true;
    return;
  end if;

  -- The primary, then everybody the assignment is shared with (CE-11).
  v_assignees := array_prepend(
    p_assignee_member_id,
    coalesce(p_shared_with, '{}'::uuid[])
  );

  select count(*)::integer,
         count(*) filter (
           where not coalesce(hm.id = any (v_assignees), false)
         )::integer,
         bool_or(not coalesce(hm.id = any (v_assignees), false)
                 and hm.role in ('admin', 'co_admin'))
    into v_adults, v_others, v_leads_avail
    from house_members hm
   where hm.house_id    = p_house_id
     and hm.status      = 'active'
     and hm.member_kind = 'adult';

  v_leads_avail := coalesce(v_leads_avail, false);

  -- Nobody left to ask — a solo Home, or a shared chore whose assignees are
  -- between them every adult in the Home. Confirm on the spot rather than
  -- leaving it in done_pending until the auto-confirm window notices.
  if coalesce(v_others, 0) = 0 then
    return query select 0, false, true;
    return;
  end if;

  if v_policy = 'single' then
    return query select 1, false, false;
    return;
  end if;

  if v_adults <= 3 then
    return query select 1, false, false;
  elsif v_adults <= 6 then
    -- A Home whose only lead is an assignee cannot produce a lead's signature.
    -- Asking for one anyway would make every one of their chores wait out the
    -- auto-confirm window, which is a slow way of turning the feature off.
    return query select least(2, v_others), v_leads_avail, false;
  else
    return query select least(3, v_others), v_leads_avail, false;
  end if;
end;
$$ language plpgsql stable security definer set search_path = public;

-- `service_role` is named explicitly because the revoke below takes the
-- privilege away from `public`, and every role — service_role included —
-- holds this one only through `public` until it is granted by name. The
-- integration suite calls this function with the service-role key to compare
-- the database's answer with the pure function's.
grant execute on function chore_quorum_for(uuid, uuid, uuid[])
  to authenticated, service_role;
revoke execute on function chore_quorum_for(uuid, uuid, uuid[]) from public, anon;

-- ---------------------------------------------------------------------------
-- A shared assignee is not a peer (CE-11)
-- ---------------------------------------------------------------------------
-- 054's trigger banned the assignee, the assignee's guardian, and a second
-- signature from one person. A shared assignment adds a fourth ban: the people
-- it is shared with did the work too, so none of them is the Home's check on
-- it.
create or replace function chore_confirmation_is_peer() returns trigger as $$
declare
  v_assignment chore_assignments;
  v_assignee   house_members;
  v_confirmer  house_members;
begin
  select a.* into v_assignment
    from chore_assignments a where a.id = new.assignment_id;
  if v_assignment.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  if v_assignment.house_id is distinct from new.house_id then
    raise exception 'WRONG_HOUSE' using errcode = 'check_violation';
  end if;

  if v_assignment.status <> 'done_pending' then
    raise exception 'WRONG_STATE' using errcode = 'check_violation';
  end if;

  select * into v_confirmer from house_members where id = new.member_id;
  if v_confirmer.id is null
     or v_confirmer.house_id    is distinct from new.house_id
     or v_confirmer.status      <> 'active'
     or v_confirmer.member_kind <> 'adult' then
    raise exception 'NOT_ELIGIBLE_CONFIRMER' using errcode = 'insufficient_privilege';
  end if;

  if new.member_id = v_assignment.assignee_member_id then
    raise exception 'SELF_CONFIRM'
      using errcode = 'check_violation', constraint = 'no_self_confirm_row';
  end if;

  -- CE-11.
  if new.member_id = any (coalesce(v_assignment.shared_with, '{}'::uuid[])) then
    raise exception 'SELF_CONFIRM'
      using errcode = 'check_violation', constraint = 'no_self_confirm_row';
  end if;

  -- D-24. A guardian may mark their dependent's chore done, and may not then
  -- confirm it: otherwise every piece of work routed through a child would be
  -- marked and confirmed by the same adult in two taps.
  select * into v_assignee from house_members
   where id = v_assignment.assignee_member_id;
  if v_assignee.member_kind = 'dependent'
     and v_assignee.guardian_member_id = new.member_id then
    raise exception 'SELF_CONFIRM'
      using errcode = 'check_violation', constraint = 'no_self_confirm_row';
  end if;

  new.is_lead := coalesce(v_confirmer.role in ('admin', 'co_admin'), false);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- mark_chore_done — restated to snapshot the shared pool's quorum
-- ---------------------------------------------------------------------------
-- Identical to 054's, except that a shared assignee may also mark the chore
-- done and that the quorum call is given the pool the chore is judged by.
create or replace function mark_chore_done(p_assignment_id uuid, p_photo_url text default null)
returns assignment_status as $$
declare
  v_assignment chore_assignments;
  v_me         house_members;
  v_assignee   house_members;
  v_quorum     record;
  v_status     assignment_status;
begin
  select a.* into v_assignment from chore_assignments a where a.id = p_assignment_id;
  if v_assignment.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  v_me := current_member(v_assignment.house_id);
  if v_me.id is null then
    raise exception 'NOT_HOUSE_MEMBER' using errcode = 'insufficient_privilege';
  end if;

  select * into v_assignee from house_members
   where id = v_assignment.assignee_member_id;

  -- The assignee, anybody the assignment is shared with (CE-11), or — where
  -- the assignee is a dependent with no account of their own — the person
  -- responsible for them (039).
  if v_assignment.assignee_member_id is distinct from v_me.id
     and not (v_me.id = any (coalesce(v_assignment.shared_with, '{}'::uuid[])))
     and not (
       v_assignee.member_kind = 'dependent'
       and v_assignee.guardian_member_id = v_me.id
     )
  then
    raise exception 'NOT_ASSIGNEE' using errcode = 'insufficient_privilege';
  end if;

  if v_assignment.status not in ('assigned', 'rejected') then
    raise exception 'WRONG_STATE' using errcode = 'check_violation';
  end if;

  select q.required, q.lead_required, q.auto_confirm into v_quorum
    from chore_quorum_for(
      v_assignment.house_id,
      v_assignment.assignee_member_id,
      coalesce(v_assignment.shared_with, '{}'::uuid[])
    ) q;

  -- Nobody to ask, or a Home that switched confirmation off. The chore
  -- confirms now rather than sitting in done_pending until the auto-confirm
  -- window notices the same thing.
  v_status := case when v_quorum.auto_confirm then 'confirmed' else 'done_pending' end;

  update chore_assignments a
     set status    = v_status,
         done_at   = now(),
         photo_url = coalesce(p_photo_url, a.photo_url),
         confirmations_required  = v_quorum.required,
         confirmations_received  = 0,
         requires_lead_confirmer = v_quorum.lead_required,
         -- confirmed_by stays null: nobody confirmed it. The self-confirmation
         -- constraint is satisfied precisely because of that.
         auto_confirmed = (v_status = 'confirmed'),
         confirmed_at   = case when v_status = 'confirmed' then now() else null end
   where a.id = p_assignment_id;

  return v_status;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function mark_chore_done(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- confirm_chore — the friendlier refusal, extended to a shared assignee
-- ---------------------------------------------------------------------------
create or replace function confirm_chore(p_assignment_id uuid)
returns assignment_status as $$
declare
  v_assignment chore_assignments;
  v_me         house_members;
  v_status     assignment_status;
begin
  select a.* into v_assignment from chore_assignments a where a.id = p_assignment_id;
  if v_assignment.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  v_me := current_member(v_assignment.house_id);
  if v_me.id is null then
    raise exception 'NOT_HOUSE_MEMBER' using errcode = 'insufficient_privilege';
  end if;
  if v_assignment.status <> 'done_pending' then
    raise exception 'WRONG_STATE' using errcode = 'check_violation';
  end if;
  if v_me.id = v_assignment.assignee_member_id
     or v_me.id = any (coalesce(v_assignment.shared_with, '{}'::uuid[])) then
    raise exception 'SELF_CONFIRM' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from chore_confirmations c
     where c.assignment_id = p_assignment_id and c.member_id = v_me.id
  ) then
    raise exception 'ALREADY_CONFIRMED' using errcode = 'check_violation';
  end if;

  insert into chore_confirmations (house_id, assignment_id, member_id)
  values (v_assignment.house_id, p_assignment_id, v_me.id);

  select a.status into v_status
    from chore_assignments a where a.id = p_assignment_id;

  return v_status;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function confirm_chore(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- reject_chore — a shared assignee cannot reject their own work either
-- ---------------------------------------------------------------------------
create or replace function reject_chore(p_assignment_id uuid, p_reason text)
returns assignment_status as $$
declare
  v_assignment chore_assignments;
  v_me         house_members;
  v_assignee   house_members;
  v_next       assignment_status;
begin
  select a.* into v_assignment from chore_assignments a where a.id = p_assignment_id;
  if v_assignment.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  v_me := current_member(v_assignment.house_id);
  if v_me.id is null then
    raise exception 'NOT_HOUSE_MEMBER' using errcode = 'insufficient_privilege';
  end if;
  if v_me.id = v_assignment.assignee_member_id
     or v_me.id = any (coalesce(v_assignment.shared_with, '{}'::uuid[])) then
    raise exception 'SELF_REJECT' using errcode = 'check_violation';
  end if;
  if v_assignment.status <> 'done_pending' then
    raise exception 'WRONG_STATE' using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'REASON_REQUIRED' using errcode = 'check_violation';
  end if;

  -- The guardian ban applies to rejecting for the same reason it applies to
  -- confirming: a parent must not be able to close out their dependent's
  -- chore alone in either direction.
  select * into v_assignee from house_members
   where id = v_assignment.assignee_member_id;
  if v_assignee.member_kind = 'dependent'
     and v_assignee.guardian_member_id = v_me.id then
    raise exception 'SELF_REJECT' using errcode = 'check_violation';
  end if;

  v_next := case when v_assignment.retry_count >= 1 then 'missed' else 'rejected' end;

  delete from chore_confirmations c where c.assignment_id = p_assignment_id;

  update chore_assignments a
     set status          = v_next,
         rejected_by     = v_me.id,
         rejected_reason = p_reason,
         retry_count     = a.retry_count + 1,
         done_at         = null,
         confirmations_received = 0,
         deadline        = case when v_next = 'rejected'
                                then a.deadline + interval '1 day'
                                else a.deadline end
   where a.id = p_assignment_id;

  return v_next;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function reject_chore(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The points, divided exactly among everybody who did the work
-- ---------------------------------------------------------------------------
-- BR-093's rule, applied to effort points rather than paise: the base share to
-- everybody, then the remainder one point at a time in member-id order. The
-- order is the id order rather than the array order so that the same chore
-- always divides the same way, whoever happened to be typed in first.
-- Twenty-five points among three is 9 / 8 / 8, and never 24 and never 27.
create or replace function post_effort_points() returns trigger as $$
declare
  v_week_start date;
  v_assignees  uuid[];
  v_heads      integer;
  v_base       integer;
  v_remainder  integer;
  v_idx        integer;
  v_share      integer;
begin
  if new.status = 'confirmed' and old.status <> 'confirmed'
     and new.assignee_member_id is not null then
    -- The week a chore belongs to is the Monday on or before its date.
    v_week_start := (new.chore_date - ((extract(isodow from new.chore_date)::int - 1)))::date;

    select coalesce(array_agg(distinct member_id), '{}'::uuid[])
      into v_assignees
      from unnest(
        array_prepend(
          new.assignee_member_id,
          coalesce(new.shared_with, '{}'::uuid[])
        )
      ) as member_id;

    v_heads     := array_length(v_assignees, 1);
    v_base      := new.effort_points / v_heads;
    v_remainder := new.effort_points % v_heads;

    for v_idx in 1..v_heads loop
      v_share := v_base + case when v_idx <= v_remainder then 1 else 0 end;

      insert into effort_ledger (house_id, member_id, week_start, earned_points, confirmed_count)
      values (new.house_id, v_assignees[v_idx], v_week_start, v_share, 1)
      on conflict (house_id, member_id, week_start)
        do update set earned_points   = effort_ledger.earned_points + excluded.earned_points,
                      confirmed_count = effort_ledger.confirmed_count + 1;
    end loop;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
