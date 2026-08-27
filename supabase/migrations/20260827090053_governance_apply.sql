-- 053 — Applying a decision, and the effects it is allowed to have
--
-- Source: docs/14-GOVERNANCE-SPEC.md section 3.1, docs/07-ROADMAP.md phase 11.
--
-- Migration 051 built the record and 052 the ways in and out of `waiting`.
-- Neither of them changes anything in the Home. This is the file where an
-- approved decision finally does something, and the whole design is organised
-- around the property the specification states twice:
--
--   **`approved` and `applied` are separate states.** A decision can be
--   approved and then fail to apply — a settlement close whose balances no
--   longer net to zero, a removal whose subject has already left. The record
--   keeps both facts, so a failure leaves a decision that is still `approved`
--   and an effect that did not run, never a half-applied one.
--
-- The effect runs inside `apply_decision`'s transaction. If it raises,
-- everything rolls back including the `applied` stamp, and the Home is left
-- holding an approved decision that can be tried again. That is why the
-- dispatcher raises rather than returning a failure code: a return value would
-- have to be committed alongside the effect it is reporting on.

-- ---------------------------------------------------------------------------
-- The foreign key migration 050 left open
-- ---------------------------------------------------------------------------
-- `house_members.removal_decision_id` shipped in 050 as a bare uuid, because
-- `decisions` did not exist yet and the column was needed for the job that
-- finishes a removal. The table exists now.
alter table house_members
  add constraint house_members_removal_decision_fkey
  foreign key (removal_decision_id) references decisions(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Acting for the Home rather than for a person
-- ---------------------------------------------------------------------------
-- Every caller-facing function in this schema asks who is calling:
-- `is_house_lead`, `is_house_admin`, `current_member`, all of them reading
-- `auth.uid()`. A decision effect has no such person. It is applied by the
-- application after the last response lands, or by a job with nobody logged
-- in, and it acts on the authority of the Home's answer rather than on the
-- authority of whoever happened to tap last.
--
-- Migration 050 met this first and answered it with a transaction-local
-- setting (`app.member_write_authorised`). This is the same device with a
-- wider scope: set only inside `apply_decision`, cleared when the transaction
-- ends, and unreachable from any client because `set_config` is called only
-- from inside security-definer functions.
create or replace function decision_effect_authorised() returns boolean as $$
  select coalesce(current_setting('app.decision_effect', true), 'off') = 'on';
$$ language sql stable set search_path = public;

revoke execute on function decision_effect_authorised() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- accept_join_request — restated so that a decision can be its caller
-- ---------------------------------------------------------------------------
-- Whole body restated from migration 049 per D-19. Two changes, both about the
-- caller no longer necessarily being a person:
--
--   * the lead check passes when the call comes from a decision effect;
--   * `decided_by` is supplied by the caller when there is no `auth.uid()` to
--     read it from — the proposer of the decision, which is the truthful
--     answer to "who decided this" once a Home has answered it.
--
-- The one-argument version is dropped rather than left beside this one: two
-- overloads where the second argument has a default make every existing
-- one-argument call ambiguous.
drop function if exists accept_join_request(uuid);

create or replace function accept_join_request(
  p_request_id uuid,
  p_decided_by uuid default null
) returns house_members as $$
declare
  v_request join_requests%rowtype;
  v_me      house_members%rowtype;
  v_member  house_members%rowtype;
begin
  select * into v_request from join_requests where id = p_request_id;
  if v_request.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if not decision_effect_authorised() and not is_house_lead(v_request.house_id) then
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
         decided_by = coalesce(v_me.id, p_decided_by),
         decided_at = now(),
         member_id  = v_member.id
   where id = p_request_id;

  return v_member;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function accept_join_request(uuid, uuid) from public, anon;
grant  execute on function accept_join_request(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- apply_decision_effect — one branch per decision type
-- ---------------------------------------------------------------------------
-- Returns the `result` jsonb: what actually changed, read back from the rows
-- after they changed rather than copied from the payload. The distinction
-- matters when the Home asks later what a decision did — the payload is what
-- was proposed, the result is what happened.
--
-- It is granted to nobody. `apply_decision` is its only caller, and the checks
-- that make an effect legitimate all live there.
create or replace function apply_decision_effect(
  p_decision decisions,
  p_input    jsonb default '{}'::jsonb
) returns jsonb as $$
declare
  v_payload jsonb := coalesce(p_decision.payload, '{}'::jsonb);
  v_member  house_members%rowtype;
  v_policy  governance_policy%rowtype;
  v_house   houses%rowtype;
  v_absence member_role[];
  v_join    member_role[];
  v_before  jsonb;
begin
  case p_decision.type

  -- -------------------------------------------------------------------------
  when 'remove_member' then
  -- -------------------------------------------------------------------------
    -- The two-state removal from 050 is the whole effect: whether it finishes
    -- today or waits on money is that function's decision, not this one's.
    if p_decision.subject_member_id is null then
      raise exception 'SUBJECT_REQUIRED: remove_member without a subject'
        using errcode = 'invalid_parameter_value';
    end if;

    v_member := begin_member_removal(p_decision.subject_member_id, p_decision.id);

    return jsonb_build_object(
      'member_id',          v_member.id,
      'status',             v_member.status,
      'left_date',          v_member.left_date,
      -- The fact the Home most needs from this record months later: was the
      -- money settled when they left, or is it still outstanding?
      'pending_settlement', v_member.pending_settlement
    );

  -- -------------------------------------------------------------------------
  when 'join_request' then
  -- -------------------------------------------------------------------------
    if p_decision.subject_id is null then
      raise exception 'SUBJECT_REQUIRED: join_request without a subject'
        using errcode = 'invalid_parameter_value';
    end if;

    v_member := accept_join_request(p_decision.subject_id, p_decision.requested_by);

    return jsonb_build_object(
      'member_id', v_member.id,
      'user_id',   v_member.user_id,
      'role',      v_member.role
    );

  -- -------------------------------------------------------------------------
  when 'change_governance' then
  -- -------------------------------------------------------------------------
    -- The Home changing the rules by which it changes rules. `governance_policy`
    -- has no write policy at all (051), so this branch is the only way any of
    -- these columns ever moves.
    --
    -- An absent key keeps its current value rather than reverting to the
    -- default: a decision to raise one threshold is not a decision to reset the
    -- other eight.
    select * into v_policy from governance_policy where house_id = p_decision.house_id;
    v_before := to_jsonb(v_policy);

    if v_payload ? 'absence_approver_roles' then
      select array_agg(value::member_role) into v_absence
        from jsonb_array_elements_text(v_payload -> 'absence_approver_roles');
    end if;
    if v_payload ? 'join_approver_roles' then
      select array_agg(value::member_role) into v_join
        from jsonb_array_elements_text(v_payload -> 'join_approver_roles');
    end if;

    -- Nothing here validates a range. Every one of these columns carries its
    -- own check constraint, so a decision that approved an impossible policy
    -- fails at apply time and stays approved — which is exactly the state the
    -- specification asks for.
    update governance_policy set
      critical_requires_coadmin =
        coalesce((v_payload ->> 'critical_requires_coadmin')::boolean, critical_requires_coadmin),
      critical_member_rule =
        coalesce(v_payload ->> 'critical_member_rule', critical_member_rule),
      critical_member_value =
        coalesce((v_payload ->> 'critical_member_value')::integer, critical_member_value),
      governance_requires_all =
        coalesce((v_payload ->> 'governance_requires_all')::boolean, governance_requires_all),
      expense_approvals_required =
        coalesce((v_payload ->> 'expense_approvals_required')::integer, expense_approvals_required),
      decision_deadline_days =
        coalesce((v_payload ->> 'decision_deadline_days')::integer, decision_deadline_days),
      absence_deadline_hours =
        coalesce((v_payload ->> 'absence_deadline_hours')::integer, absence_deadline_hours),
      absence_approver_roles = coalesce(v_absence, absence_approver_roles),
      join_approver_roles    = coalesce(v_join, join_approver_roles)
     where house_id = p_decision.house_id;

    select * into v_policy from governance_policy where house_id = p_decision.house_id;

    -- Both halves, because a governance change is the one kind of change where
    -- what it was before is part of what the Home agreed to.
    return jsonb_build_object('before', v_before, 'after', to_jsonb(v_policy));

  -- -------------------------------------------------------------------------
  when 'change_home_mode' then
  -- -------------------------------------------------------------------------
    -- Home type lives on `houses`; the three modes live on `house_settings`.
    -- One decision moves both, because from the Home's side it is one answer.
    if v_payload ? 'home_type' then
      update houses set home_type = (v_payload ->> 'home_type')::home_type
       where id = p_decision.house_id;
    end if;

    update house_settings set
      money_mode      = coalesce((v_payload ->> 'money_mode')::money_mode, money_mode),
      effort_mode     = coalesce((v_payload ->> 'effort_mode')::effort_mode, effort_mode),
      penalty_enabled = coalesce((v_payload ->> 'penalty_enabled')::boolean, penalty_enabled)
     where house_id = p_decision.house_id;

    select * into v_house from houses where id = p_decision.house_id;

    return jsonb_build_object(
      'home_type', v_house.home_type,
      'settings',  (select to_jsonb(s) from house_settings s
                     where s.house_id = p_decision.house_id)
    );

  -- -------------------------------------------------------------------------
  else
  -- -------------------------------------------------------------------------
    -- The remaining types have no effect to run yet, because the rows they
    -- would touch do not exist yet:
    --
    --   close_settlement, reopen_settlement, balance_adjustment
    --     — the money slice, which needs apply-time netting from
    --       `lib/domain/settlement/` handed in through `p_input`
    --   expense_approval, chore_confirmation
    --     — the two shipped flows becoming decisions
    --   absence_request — `absence_requests` does not exist
    --   change_rule     — phase 12
    --   set_expected_contribution, create_reserve, reserve_draw — the reserve
    --
    -- A named refusal rather than a silent no-op, and rather than an `applied`
    -- status over nothing having happened. A decision the Home answered and
    -- the code cannot carry out stays `approved` and stays visible.
    raise exception 'EFFECT_NOT_IMPLEMENTED: %', p_decision.type
      using errcode = 'feature_not_supported';
  end case;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function apply_decision_effect(decisions, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- apply_decision
-- ---------------------------------------------------------------------------
-- The only way an effect ever runs. Everything it checks, it checks again from
-- the rows rather than trusting `status` — because `status` was written by
-- `resolve_decision`, and the acceptance criterion for this function is that it
-- refuses a decision missing a mandatory response *when called with the
-- service-role key*, which is to say when called by something that could have
-- written that status itself.
--
-- `p_input` carries the apply-time numbers the database cannot compute. It is
-- unused by every effect in this migration and exists for the settlement close,
-- whose balances come from `lib/domain/settlement/netting.ts` and are computed
-- at apply time, not at proposal time.
create or replace function apply_decision(
  p_decision_id uuid,
  p_input       jsonb default '{}'::jsonb
) returns decisions as $$
declare
  v_decision   decisions%rowtype;
  v_missing    integer;
  v_responders integer;
  v_result     jsonb;
begin
  select * into v_decision from decisions where id = p_decision_id for update;
  if v_decision.id is null then
    raise exception 'DECISION_NOT_FOUND: %', p_decision_id using errcode = 'no_data_found';
  end if;

  -- Applying an applied decision is a no-op, not an error. The caller is a
  -- route handler that may have been retried, or a job sweeping a list it read
  -- a moment ago; neither should be able to run an effect twice, and neither
  -- deserves a failure for asking.
  if v_decision.status = 'applied' then
    return v_decision;
  end if;

  if v_decision.status <> 'approved' then
    raise exception 'NOT_APPROVED: %', v_decision.status
      using errcode = 'invalid_parameter_value';
  end if;

  -- An auto-approved decision is a one-person Home's, and has no participants
  -- by construction. Everything below is about a decision people answered.
  if not v_decision.auto_approved then
    -- A rejection anywhere ends it, whatever the stored status says.
    if exists (
      select 1
        from decision_responses r
        join decision_participants p
          on p.decision_id = r.decision_id
         and p.member_id   = r.member_id
         and p.capacity    = r.capacity
       where r.decision_id = v_decision.id
         and r.capacity    = 'approver'
         and r.response    = 'reject'
    ) then
      raise exception 'DECISION_REJECTED: % has a rejection', v_decision.id
        using errcode = 'check_violation';
    end if;

    select count(*)
      into v_missing
      from decision_participants p
     where p.decision_id = v_decision.id
       and p.is_mandatory
       and not exists (
         select 1 from decision_responses r
          where r.decision_id = p.decision_id
            and r.member_id   = p.member_id
       );

    if v_missing > 0 then
      raise exception 'MANDATORY_RESPONSE_MISSING: % still owed', v_missing
        using errcode = 'check_violation';
    end if;

    -- The floor of the whole version, checked at the last moment it can be: a
    -- Critical decision that two distinct people did not answer does not take
    -- effect, however it came to be marked approved.
    select count(distinct r.member_id)
      into v_responders
      from decision_responses r
      join decision_participants p
        on p.decision_id = r.decision_id
       and p.member_id   = r.member_id
       and p.capacity    = r.capacity
     where r.decision_id = v_decision.id;

    if v_decision.level = 'critical' and v_responders < 2 then
      raise exception 'CRITICAL_NEEDS_TWO_RESPONDERS: % responded', v_responders
        using errcode = 'check_violation';
    end if;
  end if;

  -- Transaction-local, and the only place it is ever set. It is set after the
  -- checks above rather than before, so that a refused apply authorises
  -- nothing.
  perform set_config('app.decision_effect', 'on', true);

  v_result := apply_decision_effect(v_decision, coalesce(p_input, '{}'::jsonb));

  update decisions
     set status     = 'applied',
         applied_at = now(),
         result     = coalesce(v_result, '{}'::jsonb)
   where id = p_decision_id
  returning * into v_decision;

  return v_decision;
end;
$$ language plpgsql security definer set search_path = public;

-- Phase 11's roadmap entry names this explicitly: revoked from `public`, `anon`
-- and `authenticated`. A browser never applies a decision — it responds, and
-- the server applies what the responses produced.
revoke execute on function apply_decision(uuid, jsonb) from public, anon, authenticated;
grant  execute on function apply_decision(uuid, jsonb) to service_role;
