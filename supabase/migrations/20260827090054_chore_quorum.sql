-- 054 — The size-aware chore confirmation quorum
--
-- Source: docs/14-GOVERNANCE-SPEC.md section 4, docs/07-ROADMAP.md phase 11.
--
-- Version 1.0 said "any one peer confirms", and one peer is the whole of the
-- fairness guarantee in a Home of nine. This migration replaces that with the
-- table the specification states: one other person up to three adults, an
-- Admin or Co-Admin plus one other up to six, plus two others beyond that.
--
-- The counts are already a pure function — `quorumFor` in
-- `lib/domain/governance/quorum.ts`, unit-tested over Home sizes without a
-- database. This file is its Postgres restatement, for the same reason D-06
-- gives everywhere else: the rule has to hold when the writer holds the
-- service-role key, and a service-role key bypasses RLS rather than a trigger.
--
-- The one structural rule underneath all of it: **the count is snapshotted
-- when the chore is marked done, never read at confirmation time.** Somebody
-- joining the Home on Tuesday does not raise the bar for Monday's work, and
-- somebody leaving does not make an already-satisfied chore un-confirmable.

-- ---------------------------------------------------------------------------
-- The Home's choice (CE-10)
-- ---------------------------------------------------------------------------
-- A Family Home may reduce the quorum to a single acknowledgement or switch it
-- off entirely. Nobody needs two signatures for a nine-year-old making their
-- bed.
--
-- Changing it is a governance decision like any other rule change, and that
-- decision's effect is not written yet: `change_governance` in 053 moves the
-- nine `governance_policy` columns and does not reach this one. Until it does,
-- every Home runs on the default, which is the behaviour section 4 specifies.
-- The column is read by `chore_quorum_for` today, and written by nothing —
-- deliberately, rather than by a settings endpoint that would route a Home
-- rule around the engine phase 11 exists to put in front of it.
create type confirmation_policy as enum ('size_aware', 'single', 'off');

alter table house_settings
  add column confirmation_policy confirmation_policy not null default 'size_aware';

-- ---------------------------------------------------------------------------
-- The snapshot, on the assignment
-- ---------------------------------------------------------------------------
alter table chore_assignments
  add column confirmations_required integer not null default 1
    check (confirmations_required >= 0),
  add column confirmations_received integer not null default 0
    check (confirmations_received >= 0),
  add column requires_lead_confirmer boolean not null default false;

comment on column chore_assignments.confirmations_required is
  'Snapshotted by mark_chore_done from chore_quorum_for(). Never recomputed.';

-- ---------------------------------------------------------------------------
-- chore_confirmations — one row per person per assignment
-- ---------------------------------------------------------------------------
-- A row rather than a counter, because "who confirmed this" is a question the
-- Home is entitled to ask, and because the lead requirement cannot be checked
-- against a number.
create table chore_confirmations (
  id            uuid primary key default gen_random_uuid(),
  house_id      uuid not null references houses(id) on delete cascade,
  assignment_id uuid not null references chore_assignments(id) on delete cascade,
  member_id     uuid not null references house_members(id) on delete cascade,
  -- Snapshotted too: a member promoted to Co-Admin after confirming did not
  -- confirm as one.
  is_lead       boolean not null default false,
  created_at    timestamptz not null default now(),
  -- Confirming twice is confirming once. The quorum counts people.
  unique (assignment_id, member_id)
);

create index idx_chore_confirmations_assignment on chore_confirmations(assignment_id);
create index idx_chore_confirmations_member     on chore_confirmations(member_id);

-- ---------------------------------------------------------------------------
-- chore_quorum_for — the table from section 4, in PL/pgSQL
-- ---------------------------------------------------------------------------
-- Mirrors `quorumFor` value for value. Both count **active adults**: a
-- dependent is a head in the Home and not a voice in it, and a Requested or
-- Inactive person is neither.
create or replace function chore_quorum_for(
  p_house_id uuid,
  p_assignee_member_id uuid
) returns table (required integer, lead_required boolean, auto_confirm boolean) as $$
declare
  v_policy      confirmation_policy;
  v_adults      integer;
  v_others      integer;
  v_leads_avail boolean;
begin
  select hs.confirmation_policy into v_policy
    from house_settings hs where hs.house_id = p_house_id;
  v_policy := coalesce(v_policy, 'size_aware');

  if v_policy = 'off' then
    return query select 0, false, true;
    return;
  end if;

  select count(*)::integer,
         count(*) filter (
           where hm.id is distinct from p_assignee_member_id
         )::integer,
         bool_or(hm.id is distinct from p_assignee_member_id
                 and hm.role in ('admin', 'co_admin'))
    into v_adults, v_others, v_leads_avail
    from house_members hm
   where hm.house_id    = p_house_id
     and hm.status      = 'active'
     and hm.member_kind = 'adult';

  v_leads_avail := coalesce(v_leads_avail, false);

  -- Nobody else to ask. Confirm on the spot rather than leaving the chore in
  -- done_pending until the auto-confirm window rescues it.
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
    -- A Home whose only lead is the person who did the chore cannot produce a
    -- lead's signature. Asking for one anyway would make every one of their
    -- chores wait out the auto-confirm window, which is a slow way of turning
    -- the feature off.
    return query select least(2, v_others), v_leads_avail, false;
  else
    return query select least(3, v_others), v_leads_avail, false;
  end if;
end;
$$ language plpgsql stable security definer set search_path = public;

grant execute on function chore_quorum_for(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Who may confirm — a trigger, so that the service-role key obeys it too
-- ---------------------------------------------------------------------------
-- `no_self_confirm` on chore_assignments only ever caught the assignee, and
-- only on the column that records the last confirmer. With a quorum there are
-- several confirmers and none of them is that column, so the rule moves here.
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

  -- Confirming something that is not waiting on confirmation is meaningless,
  -- and confirming an already-confirmed chore must not post its points twice.
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

  -- Named for the constraint docs/04-DATABASE.md section 4.3 writes this rule
  -- as. A check constraint cannot contain a subquery, so the rule is a trigger
  -- wearing the constraint's name and message.
  if new.member_id = v_assignment.assignee_member_id then
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

create trigger trg_chore_confirmation_is_peer
  before insert on chore_confirmations
  for each row execute function chore_confirmation_is_peer();

-- A confirmation is not revisable. There is no update path and no delete path
-- for a client; `reject_chore` clears the set through a definer function when
-- the chore goes back for its retry.
create or replace function chore_confirmations_are_final() returns trigger as $$
begin
  raise exception 'CONFIRMATION_IS_FINAL' using errcode = 'check_violation';
end;
$$ language plpgsql;

create trigger trg_chore_confirmations_no_update
  before update on chore_confirmations
  for each row execute function chore_confirmations_are_final();

-- ---------------------------------------------------------------------------
-- The completion trigger
-- ---------------------------------------------------------------------------
-- The count on the assignment and the transition into `confirmed` both happen
-- here, so that a confirmation written by anything at all — this app, a job, a
-- future decision effect — completes the chore identically. Points still post
-- through `trg_post_points`, which fires on the transition and nothing else.
create or replace function apply_chore_confirmation() returns trigger as $$
declare
  v_assignment chore_assignments;
  v_distinct   integer;
  v_has_lead   boolean;
  v_met        boolean;
begin
  select a.* into v_assignment
    from chore_assignments a where a.id = new.assignment_id for update;

  select count(*)::integer, bool_or(c.is_lead)
    into v_distinct, v_has_lead
    from chore_confirmations c
   where c.assignment_id = new.assignment_id;

  v_met := v_distinct >= v_assignment.confirmations_required
           and (not v_assignment.requires_lead_confirmer or coalesce(v_has_lead, false));

  update chore_assignments a
     set confirmations_received = v_distinct,
         status       = case when v_met then 'confirmed' else a.status end,
         -- The last person to sign is recorded as the confirmer, which is what
         -- the existing screens read. The full set is in chore_confirmations.
         confirmed_by = case when v_met then new.member_id else a.confirmed_by end,
         confirmed_at = case when v_met then now() else a.confirmed_at end
   where a.id = new.assignment_id;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_apply_chore_confirmation
  after insert on chore_confirmations
  for each row execute function apply_chore_confirmation();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Readable by the Home, writable only through `confirm_chore`. A client that
-- could insert directly could insert on somebody else's behalf, and the
-- signature is the whole value of the record.
alter table chore_confirmations enable row level security;

create policy read_chore_confirmations on chore_confirmations
  for select using (is_house_member(house_id));

-- ---------------------------------------------------------------------------
-- mark_chore_done — restated a third time, to snapshot the quorum
-- ---------------------------------------------------------------------------
-- Restated in full rather than wrapped: 039 added the guardian path, and a
-- wrapper around it could not both keep that and add the snapshot without
-- reading like two functions pretending to be one.
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

  -- The assignee, or — where the assignee is a dependent with no account of
  -- their own — the person responsible for them (039).
  if v_assignment.assignee_member_id is distinct from v_me.id
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
    from chore_quorum_for(v_assignment.house_id, v_assignment.assignee_member_id) q;

  -- One active adult, or a Home that switched confirmation off. There is
  -- nobody to ask, so the chore confirms now rather than sitting in
  -- done_pending until the auto-confirm window notices the same thing.
  v_status := case when v_quorum.auto_confirm then 'confirmed' else 'done_pending' end;

  update chore_assignments a
     set status    = v_status,
         done_at   = now(),
         photo_url = coalesce(p_photo_url, a.photo_url),
         confirmations_required     = v_quorum.required,
         confirmations_received     = 0,
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
-- confirm_chore — one signature, not the whole decision
-- ---------------------------------------------------------------------------
-- It writes a row and lets the trigger decide whether that row completed the
-- chore. Every refusal it raises is also raised by the trigger; these exist so
-- that a person gets the friendlier error before a constraint has to give them
-- the blunt one.
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
  if v_me.id = v_assignment.assignee_member_id then
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
-- reject_chore — one rejection ends it
-- ---------------------------------------------------------------------------
-- Restated to clear the signatures. A chore going back for its retry starts
-- its quorum again from zero: the confirmations that were given were given for
-- work that has since been declared not done.
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
  if v_me.id = v_assignment.assignee_member_id then
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
