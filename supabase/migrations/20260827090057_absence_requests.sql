-- 057 — Absence requests, and the effects that make one real
--
-- Source: docs/01-BRD.md AV-05 to AV-09, docs/14-GOVERNANCE-SPEC.md section 3.3,
-- docs/07-ROADMAP.md phase 11 slice 3.
--
-- Version 1.0 let anybody declare themselves away and the schedule rearranged
-- itself on the spot. That is still right for "home all day" and "different
-- hours", which cost the Home nothing. It is not right for an away day, which
-- takes work off one person and puts it on somebody else and lowers a target
-- that money is eventually calculated from. AV-05 makes that a request; the
-- decision engine already knows how to ask.
--
-- Three rules this file exists to hold, all of them in the database because
-- all of them have to survive a service-role key:
--
--   * An absence takes effect when it is approved, never when it is asked
--     for. A waiting request changes no schedule and no target.
--   * An unapproved absence is not an absence (AV-06). Nothing here writes an
--     `availability_exceptions` row until the effect runs, so a member who
--     asked and was refused misses their chores in the ordinary way.
--   * An approved absence never leaves work sitting on the absent person.
--     The effect opens it. `mark-missed-chores` cancels an unclaimed open
--     chore without a miss against anybody, so the worst case of the
--     redistribution pass never running is work nobody did — not a penalty
--     against somebody the Home excused.
--
-- ---------------------------------------------------------------------------
-- Why `apply_decision_effect` is restated as a dispatcher of one-liners (D-62)
-- ---------------------------------------------------------------------------
-- D-19 is the standing rule: replacing a function means restating its whole
-- body. `apply_decision_effect` in 053 is a hundred and fifty lines of inline
-- branches, and four more phase-11 slices each add one. Restating all of it
-- five more times is how a branch gets dropped the way `create_house` dropped
-- its template seed.
--
-- So this migration restates it once, as a `case` that dispatches to one
-- `effect_*` function per type. The four bodies from 053 move out unchanged.
-- From here a new decision type is a new function plus one line, and the line
-- is short enough that a restatement can be read in full.

-- ---------------------------------------------------------------------------
-- absence_requests
-- ---------------------------------------------------------------------------
-- Its own lifecycle enum rather than `decision_status`: a request can be
-- withdrawn by the person who made it, and 'cancelled' means that here, while
-- on a decision it means the proposer withdrew the question. The two happen to
-- share five spellings and are not the same vocabulary.
create type absence_status as enum (
  'waiting', 'approved', 'rejected', 'cancelled', 'lapsed'
);

create table absence_requests (
  id        uuid primary key default gen_random_uuid(),
  house_id  uuid not null references houses(id) on delete cascade,
  member_id uuid not null references house_members(id) on delete cascade,

  -- Inclusive on both ends. A single day is from = to, which is what the form
  -- sends when somebody picks one date.
  from_date date not null,
  to_date   date not null,

  reason text,

  status     absence_status not null default 'waiting',
  decided_at timestamptz,
  created_at timestamptz not null default now(),

  constraint absence_range_sane check (to_date >= from_date),

  -- A range longer than a season is a member who has left, which is a removal
  -- and a different decision with a different answer.
  constraint absence_range_bounded check (to_date - from_date <= 120),

  constraint absence_decided_matches_status check (
    (status = 'waiting') = (decided_at is null)
  )
);

create index idx_absence_member on absence_requests(member_id, from_date);
create index idx_absence_open   on absence_requests(house_id, status)
  where status = 'waiting';

-- ---------------------------------------------------------------------------
-- One live request per stretch of days
-- ---------------------------------------------------------------------------
-- Two overlapping requests would produce two decisions over the same days,
-- which the Home would answer separately and which could then disagree. An
-- exclusion constraint would say this in one line and needs `btree_gist`,
-- which this deployment does not install; a trigger says the same thing with
-- the extensions the project already has.
--
-- Only `waiting` and `approved` block. A rejected or withdrawn request is
-- history, and asking again after being refused is allowed — that is what a
-- Home is for.
create or replace function absence_no_overlap() returns trigger as $$
declare
  v_today date;
begin
  select (now() at time zone h.timezone)::date into v_today
    from houses h where h.id = new.house_id;

  -- The past is not a thing that can be requested. Declaring yesterday away
  -- after missing yesterday's chore is not recording an absence, it is editing
  -- the record — the same refusal `POST /api/availability/exceptions` makes.
  if new.status = 'waiting' and new.from_date < v_today then
    raise exception 'ABSENCE_PAST' using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from absence_requests other
     where other.member_id = new.member_id
       and other.id <> new.id
       and other.status in ('waiting', 'approved')
       and other.from_date <= new.to_date
       and other.to_date   >= new.from_date
  ) then
    raise exception 'ABSENCE_OVERLAPS' using errcode = 'unique_violation';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_absence_no_overlap
  before insert or update of from_date, to_date, status on absence_requests
  for each row execute function absence_no_overlap();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table absence_requests enable row level security;

-- The Home sees who is away and who has asked to be. An absence is not private
-- information: it is the reason somebody else is doing the washing up.
create policy read_absence_requests on absence_requests
  for select using (is_house_member(house_id));

-- You ask for your own, and you ask for it `waiting`. Every other transition
-- is a decision's, which is the whole point of the slice.
create policy request_own_absence on absence_requests
  for insert with check (
    status = 'waiting'
    and member_id in (
      select id from house_members
       where house_members.house_id = absence_requests.house_id
         and house_members.user_id  = auth.uid()
         and house_members.status   = 'active'
    )
  );

-- No update policy and no delete policy, deliberately. A member who changes
-- their mind cancels the decision; the trigger below moves the request with it.

-- ---------------------------------------------------------------------------
-- effect_absence_request
-- ---------------------------------------------------------------------------
-- What an approved absence actually does, in one transaction:
--
--   1. an `availability_exceptions` row per day, which is what every reader of
--      presence already consults — the solver, the target calculation, the
--      derived windows. Nothing downstream needs to learn a new table.
--   2. the member's outstanding chores on those days are opened.
--   3. the request is stamped approved.
--
-- Choosing who takes the opened work is not done here. That is the solver's
-- eight hard constraints, which live in `lib/domain/scheduling/`, and the
-- application runs them immediately after this returns. If it does not run —
-- a crash, a retry, a future job applying the decision — the chores are open
-- rather than sitting on somebody the Home has excused, and open is the safe
-- resting state.
create or replace function effect_absence_request(p_decision decisions)
returns jsonb as $$
declare
  v_absence absence_requests%rowtype;
  v_days    integer;
  v_opened  integer;
begin
  if p_decision.subject_id is null then
    raise exception 'SUBJECT_REQUIRED: absence_request without a subject'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_absence from absence_requests
   where id = p_decision.subject_id for update;

  if v_absence.id is null then
    raise exception 'ABSENCE_NOT_FOUND: %', p_decision.subject_id
      using errcode = 'no_data_found';
  end if;
  if v_absence.house_id <> p_decision.house_id then
    raise exception 'ABSENCE_WRONG_HOUSE' using errcode = 'invalid_parameter_value';
  end if;

  -- Applying twice is a no-op rather than a second set of exception rows.
  if v_absence.status = 'approved' then
    return jsonb_build_object(
      'absence_id', v_absence.id,
      'member_id',  v_absence.member_id,
      'from_date',  v_absence.from_date,
      'to_date',    v_absence.to_date,
      'days',       0,
      'opened',     0,
      'already',    true
    );
  end if;
  if v_absence.status <> 'waiting' then
    raise exception 'ABSENCE_NOT_OPEN: %', v_absence.status
      using errcode = 'check_violation';
  end if;

  -- An away day the member had already declared by hand is overwritten rather
  -- than duplicated: `availability_exceptions` is unique on (member, date), and
  -- 'away' is the strongest of the three kinds.
  insert into availability_exceptions
    (house_id, member_id, exc_date, exc_type, reason)
  select v_absence.house_id,
         v_absence.member_id,
         day::date,
         'away'::exception_type,
         v_absence.reason
    from generate_series(v_absence.from_date, v_absence.to_date, interval '1 day') as day
  on conflict (member_id, exc_date) do update
    set exc_type   = 'away'::exception_type,
        leaves_at  = null,
        returns_at = null,
        reason     = excluded.reason;

  get diagnostics v_days = row_count;

  -- Guest work does not move (HC-7 makes the host the only person who may do
  -- it), so it is not opened either: opening it would put it in a pool nobody
  -- is allowed to claim from. A member going away who registered a guest
  -- cancels the guest, which removes the work with it.
  update chore_assignments
     set assignee_member_id = null,
         status             = 'open'
   where house_id           = v_absence.house_id
     and assignee_member_id = v_absence.member_id
     and guest_id is null
     and status             = 'assigned'
     and chore_date between v_absence.from_date and v_absence.to_date;

  get diagnostics v_opened = row_count;

  update absence_requests
     set status = 'approved', decided_at = now()
   where id = v_absence.id;

  return jsonb_build_object(
    'absence_id', v_absence.id,
    'member_id',  v_absence.member_id,
    'from_date',  v_absence.from_date,
    'to_date',    v_absence.to_date,
    'days',       v_days,
    'opened',     v_opened,
    'already',    false
  );
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function effect_absence_request(decisions) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The outcomes that are not approval
-- ---------------------------------------------------------------------------
-- Rejected, lapsed and cancelled all mean the same thing to the schedule:
-- nothing happens. They mean different things to the person who asked, so the
-- request keeps which one it was.
--
-- A trigger rather than a line in each route handler, for the reason migration
-- 041 gives: a decision lapses on a cron job's timetable with nobody logged in,
-- and a request left saying `waiting` months after its decision lapsed is a lie
-- the UI would faithfully render.
create or replace function mirror_absence_decision() returns trigger as $$
begin
  if new.type <> 'absence_request' or new.subject_id is null then
    return new;
  end if;
  if new.status = old.status or new.status = 'waiting' then
    return new;
  end if;

  if new.status in ('rejected', 'lapsed', 'cancelled') then
    update absence_requests
       set status     = new.status::text::absence_status,
           decided_at = now()
     where id     = new.subject_id
       and status = 'waiting';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_decision_mirrors_absence
  after update of status on decisions
  for each row execute function mirror_absence_decision();

-- ---------------------------------------------------------------------------
-- The four effects from 053, moved out unchanged
-- ---------------------------------------------------------------------------
create or replace function effect_remove_member(p_decision decisions)
returns jsonb as $$
declare
  v_member house_members%rowtype;
begin
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
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function effect_remove_member(decisions) from public, anon, authenticated;

create or replace function effect_join_request(p_decision decisions)
returns jsonb as $$
declare
  v_member house_members%rowtype;
begin
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
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function effect_join_request(decisions) from public, anon, authenticated;

create or replace function effect_change_governance(p_decision decisions)
returns jsonb as $$
declare
  v_payload jsonb := coalesce(p_decision.payload, '{}'::jsonb);
  v_policy  governance_policy%rowtype;
  v_absence member_role[];
  v_join    member_role[];
  v_before  jsonb;
begin
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

  -- Nothing here validates a range. Every one of these columns carries its own
  -- check constraint, so a decision that approved an impossible policy fails at
  -- apply time and stays approved — which is exactly the state the
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
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function effect_change_governance(decisions) from public, anon, authenticated;

create or replace function effect_change_home_mode(p_decision decisions)
returns jsonb as $$
declare
  v_payload jsonb := coalesce(p_decision.payload, '{}'::jsonb);
  v_house   houses%rowtype;
begin
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
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function effect_change_home_mode(decisions) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- apply_decision_effect — now a dispatcher and nothing else
-- ---------------------------------------------------------------------------
-- `p_input` carries the apply-time numbers the database cannot compute. No
-- effect reads it yet; the settlement close is the one that will, and it is
-- threaded through so that adding that branch does not change this signature.
create or replace function apply_decision_effect(
  p_decision decisions,
  p_input    jsonb default '{}'::jsonb
) returns jsonb as $$
begin
  case p_decision.type
    when 'remove_member'     then return effect_remove_member(p_decision);
    when 'join_request'      then return effect_join_request(p_decision);
    when 'change_governance' then return effect_change_governance(p_decision);
    when 'change_home_mode'  then return effect_change_home_mode(p_decision);
    when 'absence_request'   then return effect_absence_request(p_decision);
  else
    -- The remaining types have no effect to run yet, because the rows they
    -- would touch do not exist yet:
    --
    --   close_settlement, reopen_settlement, balance_adjustment
    --     — the money slice, which needs apply-time netting from
    --       `lib/domain/settlement/` handed in through `p_input`
    --   expense_approval, chore_confirmation
    --     — the two shipped flows becoming decisions
    --   change_rule — phase 12
    --   set_expected_contribution, create_reserve, reserve_draw — the reserve
    --
    -- A named refusal rather than a silent no-op, and rather than an `applied`
    -- status over nothing having happened. A decision the Home answered and the
    -- code cannot carry out stays `approved` and stays visible.
    raise exception 'EFFECT_NOT_IMPLEMENTED: %', p_decision.type
      using errcode = 'feature_not_supported';
  end case;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function apply_decision_effect(decisions, jsonb)
  from public, anon, authenticated;
