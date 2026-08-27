-- 052 — Proposing a decision, withdrawing one, and letting one lapse
--
-- Source: docs/14-GOVERNANCE-SPEC.md sections 3.1, 3.3 and 3.4,
-- docs/07-ROADMAP.md phase 11.
--
-- Migration 051 built the record. This file is the three ways a decision gets
-- into and out of `waiting` without anybody applying anything: it is proposed,
-- it is withdrawn, or its deadline passes.
--
-- **Where the participant selector lives, and why it is not here.** The rules
-- for who is asked — which pool, who is excluded, whether they approve or
-- acknowledge — are in `lib/domain/governance/participants.ts`, over plain
-- values, where they are property-tested against randomised Homes. Restating
-- fourteen cases of that in PL/pgSQL would double the surface without doubling
-- the confidence, and the two copies would drift on the first new decision
-- type.
--
-- So `create_decision` takes the selector's output and *validates* it rather
-- than recomputing it. Every invariant that must hold whatever produced the
-- list is checked here, in the database, where a caller holding the
-- service-role key still meets it: participants are real, active members of
-- this Home; the subject is not among them; and a Critical decision has at
-- least two distinct people who could answer it. A selector that went wrong,
-- or a caller that skipped it entirely, gets a refusal rather than a decision
-- one person can finish alone.

-- ---------------------------------------------------------------------------
-- create_decision
-- ---------------------------------------------------------------------------
-- The whole proposal in one statement: the decision row, its participants, and
-- the auto-approval of a Home that has nobody to ask. One transaction, so a
-- decision with no participants cannot exist even for an instant.
create or replace function create_decision(
  p_house_id           uuid,
  p_type               decision_type,
  p_level              decision_level,
  p_participants       jsonb,                  -- [{member_id, capacity, is_mandatory}]
  p_required_approvals integer     default 0,
  p_required_acks      integer     default 0,
  p_subject_type       text        default null,
  p_subject_id         uuid        default null,
  p_subject_member_id  uuid        default null,
  p_payload            jsonb       default '{}'::jsonb,
  p_reason             text        default null,
  p_deadline           timestamptz default null,
  p_supersedes_id      uuid        default null
) returns decisions as $$
declare
  v_me       house_members%rowtype;
  v_decision decisions%rowtype;
  v_count    integer;
  v_distinct integer;
  v_adults   integer;
  v_superseded decisions%rowtype;
begin
  v_me := current_member(p_house_id);
  if v_me.id is null then
    raise exception 'NOT_A_MEMBER' using errcode = 'insufficient_privilege';
  end if;

  if p_participants is null or jsonb_typeof(p_participants) <> 'array' then
    raise exception 'PARTICIPANTS_REQUIRED' using errcode = 'invalid_parameter_value';
  end if;

  -- How many people could answer at all, and how many of them are distinct.
  -- The difference matters: a member listed as both approver and acknowledger
  -- is two rows and one voice.
  select count(*), count(distinct (entry ->> 'member_id')::uuid)
    into v_count, v_distinct
    from jsonb_array_elements(p_participants) as entry;

  -- Every participant is an active member of this Home. Checked with one
  -- query rather than a loop so that a list naming somebody else's Home fails
  -- as a set, not on whichever row happened to come first.
  if exists (
    select 1
      from jsonb_array_elements(p_participants) as entry
     where not exists (
       select 1 from house_members hm
        where hm.id       = (entry ->> 'member_id')::uuid
          and hm.house_id = p_house_id
          and hm.status   = 'active'
     )
  ) then
    raise exception 'PARTICIPANT_NOT_ACTIVE_MEMBER' using errcode = 'invalid_parameter_value';
  end if;

  if p_subject_member_id is not null then
    if not exists (
      select 1 from house_members
       where id = p_subject_member_id and house_id = p_house_id
    ) then
      raise exception 'SUBJECT_NOT_A_MEMBER' using errcode = 'invalid_parameter_value';
    end if;

    -- The trigger in 051 says this too. Saying it here as well turns a
    -- constraint violation into a named refusal at the point the caller can
    -- still do something about it.
    if exists (
      select 1 from jsonb_array_elements(p_participants) as entry
       where (entry ->> 'member_id')::uuid = p_subject_member_id
    ) then
      raise exception 'SUBJECT_IS_PARTICIPANT' using errcode = 'invalid_parameter_value';
    end if;
  end if;

  if p_supersedes_id is not null then
    select * into v_superseded from decisions where id = p_supersedes_id;
    if v_superseded.id is null or v_superseded.house_id <> p_house_id then
      raise exception 'SUPERSEDED_NOT_FOUND' using errcode = 'invalid_parameter_value';
    end if;
    -- Only a decision that ended without an answer may be re-proposed. An
    -- applied or rejected one has been answered, and re-proposing it is a new
    -- argument rather than a retry.
    if v_superseded.status not in ('lapsed', 'cancelled') then
      raise exception 'SUPERSEDED_NOT_LAPSED' using errcode = 'invalid_parameter_value';
    end if;
  end if;

  -- The floor, at the only moment it can be enforced cheaply: a Home that
  -- cannot supply two responders is told now, rather than watching a Critical
  -- decision sit until it lapses.
  select count(*)
    into v_adults
    from house_members
   where house_id = p_house_id
     and status   = 'active'
     and member_kind = 'adult';

  if p_level = 'critical' and v_distinct < 2 and v_adults > 1 then
    raise exception 'NOT_ENOUGH_PARTICIPANTS' using errcode = 'invalid_parameter_value';
  end if;

  if v_count = 0 and v_adults > 1 then
    raise exception 'NOT_ENOUGH_PARTICIPANTS' using errcode = 'invalid_parameter_value';
  end if;

  insert into decisions (
    house_id, type, level, requested_by,
    subject_type, subject_id, subject_member_id,
    payload, reason,
    required_approvals, required_acks,
    deadline, supersedes_id,
    -- A one-person Home approves on the spot and is recorded as having done so
    -- (spec 3.3). Everything else starts waiting.
    status, resolved_at, auto_approved
  ) values (
    p_house_id, p_type, p_level, v_me.id,
    p_subject_type, p_subject_id, p_subject_member_id,
    coalesce(p_payload, '{}'::jsonb), p_reason,
    greatest(coalesce(p_required_approvals, 0), 0),
    greatest(coalesce(p_required_acks, 0), 0),
    p_deadline, p_supersedes_id,
    case when v_adults <= 1 then 'approved'::decision_status else 'waiting'::decision_status end,
    case when v_adults <= 1 then now() end,
    v_adults <= 1
  )
  returning * into v_decision;

  insert into decision_participants (decision_id, member_id, capacity, is_mandatory)
  select
    v_decision.id,
    (entry ->> 'member_id')::uuid,
    (entry ->> 'capacity')::response_capacity,
    coalesce((entry ->> 'is_mandatory')::boolean, false)
  from jsonb_array_elements(p_participants) as entry
  -- The same person may be listed once per capacity and no more. `distinct`
  -- absorbs a caller that sent a duplicate rather than failing the proposal
  -- over a list that means what it says.
  on conflict (decision_id, member_id, capacity) do nothing;

  return v_decision;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function create_decision(
  uuid, decision_type, decision_level, jsonb, integer, integer,
  text, uuid, uuid, jsonb, text, timestamptz, uuid
) from public, anon, authenticated;

grant execute on function create_decision(
  uuid, decision_type, decision_level, jsonb, integer, integer,
  text, uuid, uuid, jsonb, text, timestamptz, uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- cancel_decision — the proposer withdraws
-- ---------------------------------------------------------------------------
-- Only the proposer, and only while it is still waiting. A lead cannot cancel
-- somebody else's proposal: that would be an approval decided by one person,
-- wearing the word "cancel".
create or replace function cancel_decision(p_decision_id uuid)
returns decisions as $$
declare
  v_decision decisions%rowtype;
  v_me       house_members%rowtype;
begin
  select * into v_decision from decisions where id = p_decision_id for update;
  if v_decision.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  v_me := current_member(v_decision.house_id);
  if v_me.id is null or v_me.id <> v_decision.requested_by then
    raise exception 'PROPOSER_REQUIRED' using errcode = 'insufficient_privilege';
  end if;

  if v_decision.status <> 'waiting' then
    raise exception 'ALREADY_RESOLVED: %', v_decision.status using errcode = 'invalid_parameter_value';
  end if;

  update decisions
     set status = 'cancelled', resolved_at = now()
   where id = p_decision_id
  returning * into v_decision;

  return v_decision;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function cancel_decision(uuid) from public, anon, authenticated;
grant  execute on function cancel_decision(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- expire_decisions — the hourly job
-- ---------------------------------------------------------------------------
-- A decision past its deadline lapses with nobody logged in (spec 3.4, and one
-- of the phase's acceptance criteria). It runs through `resolve_decision`
-- rather than updating the status directly, because a decision whose last
-- response arrived seconds before the deadline is `approved`, not `lapsed`,
-- and only the resolver knows that.
--
-- Returns the number of decisions it moved, which is what the job logs.
create or replace function expire_decisions()
returns integer as $$
declare
  v_id     uuid;
  v_moved  integer := 0;
  v_status decision_status;
begin
  for v_id in
    select id from decisions
     where status = 'waiting'
       and deadline is not null
       and deadline < now()
     order by deadline
  loop
    v_status := resolve_decision(v_id);
    if v_status <> 'waiting' then
      v_moved := v_moved + 1;
    end if;
  end loop;

  return v_moved;
end;
$$ language plpgsql security definer set search_path = public;

-- No client calls this. The scheduled Edge Function does, as the service role.
revoke execute on function expire_decisions() from public, anon, authenticated;
grant  execute on function expire_decisions() to service_role;
