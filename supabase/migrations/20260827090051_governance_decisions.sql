-- 051 — The Decision record, its participants, its responses, and the resolver
--
-- Source: docs/14-GOVERNANCE-SPEC.md sections 3.1 to 3.3, docs/07-ROADMAP.md
-- phase 11, docs/04-DATABASE.md section 4.1.
--
-- The engine itself already exists, framework- and database-free, in
-- `lib/domain/governance/`. This migration is its other half: the record it
-- operates on, and a Postgres restatement of the rules that must hold even
-- when the caller holds the service-role key. Design decision D-06 is the
-- standing explanation for that duplication — a service-role key bypasses RLS,
-- and does not bypass a constraint or a trigger.
--
-- Nothing here applies an effect. `apply_decision` and its dispatcher are the
-- next migration, deliberately: `approved` and `applied` are separate states
-- (spec 3.1), and they land as separate files so that the state machine can be
-- read and tested before any of it moves money.

-- ---------------------------------------------------------------------------
-- The vocabulary
-- ---------------------------------------------------------------------------
-- These mirror `lib/domain/governance/types.ts` value for value. When a
-- fifteenth decision type arrives it is added in both places or in neither.
create type decision_type as enum (
  'close_settlement',
  'reopen_settlement',
  'remove_member',
  'change_rule',
  'change_governance',
  'change_home_mode',
  'balance_adjustment',
  'absence_request',
  'join_request',
  'expense_approval',
  'chore_confirmation',
  'set_expected_contribution',
  'create_reserve',
  'reserve_draw'
);

create type decision_level as enum ('normal', 'important', 'critical');

create type decision_status as enum (
  'waiting', 'approved', 'rejected', 'lapsed', 'cancelled', 'applied'
);

create type response_capacity as enum ('approver', 'acknowledger');
create type response_kind     as enum ('approve', 'reject', 'acknowledge');

-- ---------------------------------------------------------------------------
-- governance_policy — one row per Home, every column a documented default
-- ---------------------------------------------------------------------------
-- Section 9. The Home may raise or lower these, and the phase-11 warning in the
-- roadmap is about exactly this table: levels set too high make the product
-- unusable, so the shipped defaults are the specification's own.
create table governance_policy (
  house_id uuid primary key references houses(id) on delete cascade,

  -- Whether a Co-Admin is mandatory on a Critical decision. A Home with no
  -- Co-Admin drops the slot and raises the member requirement by one; that is
  -- the selector's job, not this column's.
  critical_requires_coadmin boolean not null default true,

  -- How much of the counting pool a Critical decision needs. 'proportion' is a
  -- percentage and rounds up; 'count' is a flat number of people.
  critical_member_rule  text not null default 'proportion'
    check (critical_member_rule in ('count', 'proportion')),
  critical_member_value integer not null default 50,

  -- change_governance is the one type that defaults to unanimity: the Home is
  -- changing the rules by which it changes rules.
  governance_requires_all boolean not null default true,

  absence_approver_roles member_role[] not null
    default array['admin', 'co_admin']::member_role[],
  join_approver_roles    member_role[] not null
    default array['admin', 'co_admin']::member_role[],

  expense_approvals_required integer not null default 1
    check (expense_approvals_required >= 1),

  decision_deadline_days integer not null default 7
    check (decision_deadline_days between 1 and 30),
  absence_deadline_hours integer not null default 48
    check (absence_deadline_hours between 1 and 336),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A percentage above 100 is meaningless; a count of zero would let a
  -- Critical decision pass with no counting participant at all.
  constraint critical_member_value_in_range check (
    case critical_member_rule
      when 'proportion' then critical_member_value between 1 and 100
      else critical_member_value >= 1
    end
  )
);

create trigger trg_governance_policy_touch before update on governance_policy
  for each row execute function touch_updated_at();

-- Every Home has a policy, including the ones that existed before governance
-- did. Reading it must never be a left join against a null.
insert into governance_policy (house_id)
  select id from houses
  on conflict (house_id) do nothing;

-- `create_house` has been restated in six migrations already. A trigger is the
-- version that cannot be forgotten by the seventh.
create or replace function seed_governance_policy() returns trigger as $$
begin
  insert into governance_policy (house_id) values (new.id)
    on conflict (house_id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_house_seeds_governance_policy after insert on houses
  for each row execute function seed_governance_policy();

alter table governance_policy enable row level security;

-- Every member reads the rules they live under. Only a decision changes them —
-- `change_governance` is Critical — so there is no write policy at all, not
-- even for a lead.
create policy read_governance_policy on governance_policy
  for select using (is_house_member(house_id));

-- ---------------------------------------------------------------------------
-- decisions
-- ---------------------------------------------------------------------------
create table decisions (
  id       uuid primary key default gen_random_uuid(),
  house_id uuid not null references houses(id) on delete cascade,

  type  decision_type  not null,
  level decision_level not null,

  requested_by uuid not null references house_members(id),

  -- The entity this decision is about: 'period', 'expense', 'chore_assignment',
  -- 'house_member', 'rule', 'reserve'. Free text rather than an enum because
  -- phases 12 to 15 each add a kind, and an enum value cannot be added in the
  -- same transaction that uses it (migration 048 is the record of that).
  subject_type text,
  subject_id   uuid,

  -- The member a decision is *about*, when it is about one: the member being
  -- removed, the payer of an expense, the doer of a chore. Separate from
  -- `subject_id` because self-exclusion is enforced by a trigger below, and a
  -- trigger cannot chase a polymorphic id to find out whether it names a
  -- person.
  --
  -- Single-valued today. Shared chore assignment (CE-11) has more than one
  -- assignee to exclude and arrives later in this phase; it will need a set.
  subject_member_id uuid references house_members(id) on delete cascade,

  -- What would change, exactly. Read by the effect dispatcher and by nothing
  -- else; the UI renders from the typed columns.
  payload jsonb not null default '{}'::jsonb,

  -- Why. Required for a Critical decision: the Home is being asked for
  -- something consequential and "no reason given" is not a proposal.
  reason text,

  required_approvals integer not null default 0 check (required_approvals >= 0),
  required_acks      integer not null default 0 check (required_acks >= 0),

  -- Null for `expense_approval`, which sits until answered: an unapproved
  -- expense already blocks the close, so lapsing it converts one blockage into
  -- another (spec 3.4).
  deadline timestamptz,

  status decision_status not null default 'waiting',

  -- What actually changed, written at apply time from apply-time numbers.
  result jsonb,

  -- A one-person Home is the documented exception (spec 3.3): a Critical
  -- decision approves on the spot, because there is nobody to ask. It is
  -- recorded as such rather than presented as a quorum that was met.
  auto_approved boolean not null default false,

  -- A lapsed decision may be re-proposed, and the new one points at it.
  supersedes_id uuid references decisions(id) on delete set null,

  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  applied_at  timestamptz,

  constraint critical_has_reason check (
    level <> 'critical' or (reason is not null and btrim(reason) <> '')
  ),

  -- The state machine, as constraints rather than as hope. `=` between two
  -- booleans is the biconditional: waiting if and only if unresolved.
  constraint resolved_at_matches_status check (
    (status = 'waiting') = (resolved_at is null)
  ),
  constraint applied_at_matches_status check (
    (status = 'applied') = (applied_at is not null)
  ),
  -- "Nothing changes while a decision is waiting" (spec 3.1) has a paper
  -- trail: a result exists only where an effect ran.
  constraint result_only_when_applied check (
    result is null or status = 'applied'
  ),
  constraint supersedes_is_not_self check (
    supersedes_id is null or supersedes_id <> id
  ),
  -- An auto-approved decision was never waiting for anybody.
  constraint auto_approved_is_resolved check (
    not auto_approved or status <> 'waiting'
  )
);

create index idx_decisions_house_status on decisions(house_id, status);
create index idx_decisions_subject      on decisions(house_id, type, subject_id);
create index idx_decisions_deadline     on decisions(deadline)
  where status = 'waiting' and deadline is not null;

-- One live decision per subject. Two simultaneous closes of the same period,
-- or two removals of the same member, are not a disagreement to resolve at
-- apply time — they are a proposal that should never have been accepted.
create unique index uq_decision_live
  on decisions (house_id, type, subject_id)
  where status = 'waiting' and subject_id is not null;

alter table decisions enable row level security;

-- The Home sees its own queue, every decision, at every status. Transparency
-- is the point of the record: a decision nobody can see is an admin action
-- with extra steps.
create policy read_decisions on decisions
  for select using (is_house_member(house_id));

-- No insert, update or delete policy. Proposing, cancelling and applying all
-- run through security-definer functions, so that a client cannot write a
-- decision whose participants it chose itself.

-- ---------------------------------------------------------------------------
-- decision_participants
-- ---------------------------------------------------------------------------
create table decision_participants (
  id          uuid primary key default gen_random_uuid(),
  decision_id uuid not null references decisions(id) on delete cascade,
  member_id   uuid not null references house_members(id) on delete cascade,
  capacity    response_capacity not null,

  -- A mandatory participant gates the decision whatever the counts say: it
  -- cannot approve until they have responded (spec 3.2).
  is_mandatory boolean not null default false,

  created_at timestamptz not null default now(),

  -- Per capacity, not per member. A person may legitimately be listed as both
  -- an approver and an acknowledger; the resolver counts responders, so being
  -- listed twice does not let them count twice.
  unique (decision_id, member_id, capacity)
);

create index idx_decision_participants_member on decision_participants(member_id);

alter table decision_participants enable row level security;

create policy read_decision_participants on decision_participants
  for select using (
    exists (
      select 1 from decisions d
       where d.id = decision_participants.decision_id
         and is_house_member(d.house_id)
    )
  );

-- ---------------------------------------------------------------------------
-- The subject of a decision is never a participant in it
-- ---------------------------------------------------------------------------
-- Spec 3.3, and one of the phase's acceptance criteria. The selector refuses
-- it too; this is the half that holds when the caller is a script with the
-- service-role key.
--
-- It fires on both tables because either side can create the violation: a
-- participant added to an existing decision, or a subject set on a decision
-- that already has participants.
create or replace function assert_subject_not_participant() returns trigger as $$
declare
  v_subject uuid;
  v_clash   boolean;
begin
  if tg_table_name = 'decision_participants' then
    select subject_member_id into v_subject from decisions where id = new.decision_id;
    if v_subject is not null and v_subject = new.member_id then
      raise exception 'SUBJECT_IS_PARTICIPANT: member % is the subject of decision %',
        new.member_id, new.decision_id
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.subject_member_id is null then
    return new;
  end if;

  select exists (
    select 1 from decision_participants
     where decision_id = new.id and member_id = new.subject_member_id
  ) into v_clash;

  if v_clash then
    raise exception 'SUBJECT_IS_PARTICIPANT: member % is a participant in decision %',
      new.subject_member_id, new.id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_participant_is_not_subject
  before insert or update on decision_participants
  for each row execute function assert_subject_not_participant();

create trigger trg_subject_is_not_participant
  before insert or update of subject_member_id on decisions
  for each row execute function assert_subject_not_participant();

-- ---------------------------------------------------------------------------
-- decision_responses
-- ---------------------------------------------------------------------------
create table decision_responses (
  id          uuid primary key default gen_random_uuid(),
  decision_id uuid not null references decisions(id) on delete cascade,
  member_id   uuid not null references house_members(id) on delete cascade,
  capacity    response_capacity not null,
  response    response_kind not null,

  -- A rejection needs a reason, and a reason needs to be one. Ten characters
  -- is the specification's floor and this is where it is enforced; "no" and
  -- "nope" are not answers a Home can act on.
  reason text,

  responded_at timestamptz not null default now(),

  -- One response per member per capacity. There is no update policy either, so
  -- this is also the whole implementation of "a response cannot be revised".
  unique (decision_id, member_id, capacity),

  -- An acknowledger accepts that something is happening; they were never asked
  -- whether it should. Letting them reject would be a veto quietly granted
  -- (spec section 2).
  constraint response_matches_capacity check (
    case capacity
      when 'approver'     then response in ('approve', 'reject')
      when 'acknowledger' then response = 'acknowledge'
    end
  ),

  constraint reject_has_reason check (
    response <> 'reject' or (reason is not null and length(btrim(reason)) >= 10)
  )
);

create index idx_decision_responses_decision on decision_responses(decision_id);

alter table decision_responses enable row level security;

create policy read_decision_responses on decision_responses
  for select using (
    exists (
      select 1 from decisions d
       where d.id = decision_responses.decision_id
         and is_house_member(d.house_id)
    )
  );

-- The one write a client makes directly in this whole subsystem, and every
-- clause of the check is one of the phase's acceptance criteria:
--
--   * the decision is still waiting — a resolved decision takes no more input
--   * the member row is the caller's own — nobody responds on another's behalf
--   * a matching participant row exists — nobody responds to a decision they
--     were not asked about, in a capacity they were not asked in
--
-- There is deliberately no update and no delete policy: a response is a
-- statement of record, not a draft.
create policy respond_to_own_decision on decision_responses
  for insert with check (
    exists (
      select 1
        from decision_participants p
        join decisions d      on d.id = p.decision_id
        join house_members hm on hm.id = p.member_id
       where p.decision_id = decision_responses.decision_id
         and p.member_id   = decision_responses.member_id
         and p.capacity    = decision_responses.capacity
         and d.status      = 'waiting'
         and hm.user_id    = auth.uid()
         and hm.status     = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- resolve_decision — the resolver, restated in SQL
-- ---------------------------------------------------------------------------
-- `lib/domain/governance/resolve.ts` is the same function over plain values,
-- and it is the one the UI uses to show progress and to plan an Approve All
-- batch. This one is the authority on the stored status, because the status
-- must be right even when the response arrives from something that is not this
-- application (D-06).
--
-- The thing to hold on to, in both copies: **it counts responders, not
-- responses.** A member listed in two capacities who answers in both has
-- spoken once. Counting rows would let one person clear a threshold of two,
-- which is the property this whole version exists to protect.
create or replace function resolve_decision(p_decision_id uuid)
returns decision_status as $$
declare
  v_decision   decisions%rowtype;
  v_rejected   boolean;
  v_approvers  integer;
  v_ackers     integer;
  v_responders integer;
  v_pending_mandatory integer;
  v_status     decision_status;
begin
  select * into v_decision from decisions where id = p_decision_id for update;
  if not found then
    raise exception 'DECISION_NOT_FOUND: %', p_decision_id using errcode = 'no_data_found';
  end if;

  -- Only a waiting decision moves. Re-resolving a resolved one is a no-op
  -- rather than an error, because the hourly expiry job sweeps in bulk.
  if v_decision.status <> 'waiting' then
    return v_decision.status;
  end if;

  -- A response only counts in a capacity its author was asked in. The insert
  -- policy above says the same thing; this join says it again for the
  -- service-role caller that skipped the policy.
  with valid as (
    select r.member_id, r.capacity, r.response
      from decision_responses r
      join decision_participants p
        on p.decision_id = r.decision_id
       and p.member_id   = r.member_id
       and p.capacity    = r.capacity
     where r.decision_id = p_decision_id
  )
  select
    bool_or(response = 'reject' and capacity = 'approver'),
    count(distinct member_id)
      filter (where capacity = 'approver' and response = 'approve'),
    -- An approver who said yes has plainly also accepted that it is happening,
    -- so an approval counts as an acknowledgement. The reverse is not true.
    count(distinct member_id)
      filter (where response in ('acknowledge', 'approve')),
    count(distinct member_id)
    into v_rejected, v_approvers, v_ackers, v_responders
    from valid;

  -- One rejection ends it, checked before the counts: a decision holding both
  -- a rejection and enough approvals is rejected. The veto is the point of the
  -- capacity.
  if coalesce(v_rejected, false) then
    update decisions
       set status = 'rejected', resolved_at = now()
     where id = p_decision_id;
    return 'rejected';
  end if;

  select count(*)
    into v_pending_mandatory
    from decision_participants p
   where p.decision_id = p_decision_id
     and p.is_mandatory
     and not exists (
       select 1 from decision_responses r
        where r.decision_id = p.decision_id
          and r.member_id   = p.member_id
     );

  if v_approvers >= v_decision.required_approvals
     and v_ackers >= v_decision.required_acks
     and v_pending_mandatory = 0
     -- The floor of the whole version, restated here so that a decision built
     -- by something other than the selector cannot slip past it: a Critical
     -- decision needs two distinct people to have spoken.
     and (v_decision.level <> 'critical' or v_responders >= 2)
  then
    v_status := 'approved';
  elsif v_decision.deadline is not null and now() > v_decision.deadline then
    v_status := 'lapsed';
  else
    return 'waiting';
  end if;

  update decisions set status = v_status, resolved_at = now() where id = p_decision_id;
  return v_status;
end;
$$ language plpgsql security definer set search_path = public;

-- Postgres grants EXECUTE to PUBLIC on a new function, which anon and
-- authenticated inherit. Migration 037 is the record of learning that the hard
-- way, and every security-definer function since has carried this line.
revoke execute on function resolve_decision(uuid) from public, anon, authenticated;

-- The hourly expiry job is the one caller that is not a trigger: it sweeps
-- every waiting decision past its deadline with nobody logged in. It runs as
-- the service role, which the revoke above also stripped, so the grant has to
-- be explicit.
grant execute on function resolve_decision(uuid) to service_role;

-- A response resolves its decision in the same transaction that wrote it.
-- Nothing is applied here — approval and application are separate states, and
-- the gap between them is where the effect dispatcher will run.
create or replace function resolve_on_response() returns trigger as $$
begin
  perform resolve_decision(new.decision_id);
  return null;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_resolve_on_response
  after insert on decision_responses
  for each row execute function resolve_on_response();
