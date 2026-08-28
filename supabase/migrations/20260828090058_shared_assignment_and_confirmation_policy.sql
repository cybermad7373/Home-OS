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
-- Update chore_quorum_for to handle shared assignments
-- ---------------------------------------------------------------------------
-- Must drop first because the return type changes (SQLSTATE 42P13).
-- Use OUT parameters instead of setof record for RPC compatibility.
drop function if exists chore_quorum_for(uuid, uuid);
create function chore_quorum_for(p_house_id uuid, p_assignee_member_id uuid)
returns table (required int, lead_required boolean, auto_confirm boolean) as $$
declare
  v_assignee      house_members%rowtype;
  v_assignment    chore_assignments%rowtype;
  v_all_assignees uuid[];
  v_adult_count   int;
  v_eligible      int;
  v_required      int;
  v_lead_required boolean;
  v_auto_confirm  boolean;
begin
  -- Get the assignment to find all assignees (primary + shared_with)
  select a.* into v_assignment
    from chore_assignments a
   where a.assignee_member_id = p_assignee_member_id
     and a.status = 'assigned'
   order by a.chore_date desc
   limit 1;

  if not found then
    -- No active assignment for this member; compute quorum from house
    -- composition alone (for preview/comparison with pure function).
    select count(*) into v_adult_count
      from house_members
     where house_id = p_house_id
       and status = 'active'
       and member_kind = 'adult';

    -- Quorum logic per docs/14-GOVERNANCE-SPEC.md section 4:
    if v_adult_count <= 0 then
      v_required := 0; v_lead_required := false; v_auto_confirm := true;
    elsif v_adult_count = 1 then
      v_required := 1; v_lead_required := false; v_auto_confirm := true;
    elsif v_adult_count <= 3 then
      v_required := 1; v_lead_required := false; v_auto_confirm := false;
    elsif v_adult_count <= 6 then
      v_required := 2; v_lead_required := true; v_auto_confirm := false;
    else
      v_required := 3; v_lead_required := true; v_auto_confirm := false;
    end if;

    required := v_required; lead_required := v_lead_required; auto_confirm := v_auto_confirm;
    return next;
    return;
  end if;

  v_all_assignees := array_append(v_assignment.shared_with, v_assignment.assignee_member_id);

  -- Count active adults in the house excluding ALL assignees
  select count(*) into v_adult_count
    from house_members
   where house_id = p_house_id
     and status = 'active'
     and member_kind = 'adult'
     and id <> ALL(v_all_assignees);

  -- Eligible confirmers = active adults excluding all assignees
  v_eligible := v_adult_count;

  -- Quorum logic per docs/14-GOVERNANCE-SPEC.md section 4:
  -- 1 eligible: 1 confirmation, no lead required, auto-confirm
  -- 2-3 eligible: 2 confirmations, lead required
  -- 4-5 eligible: 3 confirmations, lead required
  -- 6+ eligible: 4 confirmations, lead required
  if v_eligible <= 0 then
    v_required := 0;
    v_lead_required := false;
    v_auto_confirm := true;
  elsif v_eligible = 1 then
    v_required := 1;
    v_lead_required := false;
    v_auto_confirm := true;
  elsif v_eligible <= 3 then
    v_required := 2;
    v_lead_required := true;
    v_auto_confirm := true;
  elsif v_eligible <= 5 then
    v_required := 3;
    v_lead_required := true;
    v_auto_confirm := true;
  else
    v_required := 4;
    v_lead_required := true;
    v_auto_confirm := true;
  end if;

  required := v_required; lead_required := v_lead_required; auto_confirm := v_auto_confirm;
  return next;
end;
$$ language plpgsql security definer set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Grant execute on new functions
-- ---------------------------------------------------------------------------
grant execute on function chore_quorum_for(uuid, uuid) to authenticated;
revoke execute on function chore_quorum_for(uuid, uuid) from public, anon;

-- ---------------------------------------------------------------------------
-- Update post_effort_points trigger to handle shared assignments
-- ---------------------------------------------------------------------------
-- When a shared chore is confirmed, divide the points among all assignees
-- (primary + shared_with). The division is exact with remainder to first.
create or replace function post_effort_points() returns trigger as $$
declare
  v_week_start date;
  v_all_assignees uuid[];
  v_points_per_assignee int;
  v_remainder int;
  v_idx int;
begin
  if new.status = 'confirmed' and old.status <> 'confirmed'
     and new.assignee_member_id is not null then
    -- The week a chore belongs to is the Monday on or before its date.
    v_week_start := (new.chore_date - ((extract(isodow from new.chore_date)::int - 1)))::date;

    -- All assignees: primary + shared_with
    v_all_assignees := array_append(new.shared_with, new.assignee_member_id);
    v_points_per_assignee := new.effort_points / array_length(v_all_assignees, 1);
    v_remainder := new.effort_points % array_length(v_all_assignees, 1);

    -- Distribute points: remainder goes to first assignee
    for v_idx in 1..array_length(v_all_assignees, 1) loop
      insert into effort_ledger (house_id, member_id, week_start, earned_points, confirmed_count)
      values (new.house_id, v_all_assignees[v_idx], v_week_start,
              v_points_per_assignee + case when v_idx = 1 then v_remainder else 0 end, 1)
      on conflict (house_id, member_id, week_start)
        do update set earned_points   = effort_ledger.earned_points + excluded.earned_points,
                      confirmed_count = effort_ledger.confirmed_count + 1;
    end loop;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;