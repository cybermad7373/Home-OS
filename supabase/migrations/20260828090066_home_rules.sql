-- 066 — Rules: what the Home wrote down, and the only way it goes live
--
-- Source: docs/14-GOVERNANCE-SPEC.md section 6, docs/04-DATABASE.md section
-- 4.8, docs/01-BRD.md RL-01 to RL-10, docs/07-ROADMAP.md phase 12.
--
-- Three properties this file exists to hold, all of them in the database
-- because all of them have to survive a service-role key:
--
--   * A rule version with `activated_at` set and no `decision_id` is refused
--     (SEC-16, RL-04). There is no path from "the Admin typed it" to "the Home
--     is bound by it" that does not pass through a decision.
--   * Rules are never overwritten (RL-06). Editing appends a version; the old
--     one keeps its dates, its values, its reason and the decision that
--     activated it. Disabling is a version transition, not a delete.
--   * The original text is kept verbatim, per version, forever (RL-09). It is
--     what the Home actually agreed to; the structured fields are an
--     interpretation of it.
--
-- ---------------------------------------------------------------------------
-- Why `apply_decision_effect` becomes a dynamic dispatcher (deviates from D-62)
-- ---------------------------------------------------------------------------
-- Migration 057 turned the effect dispatcher into a `case` of one-liners so
-- that a new decision type is "a new function plus one line". That was the
-- right shape when one track was adding types one at a time. Phase 11's
-- remaining slices and phase 12 are being written in parallel, and a `case`
-- list is a shared mutable object: whichever migration is restated last
-- silently drops the branches added by the ones before it, and the failure
-- surfaces as a decision the Home approved that quietly cannot be applied.
--
-- So the `case` is replaced by a lookup: `effect_<type>` is called if a
-- function of that name exists, and `EFFECT_NOT_IMPLEMENTED` is raised if it
-- does not — which is exactly what the `else` branch said before, for exactly
-- the same set of types. The dispatch is not user input: `p_decision.type` is
-- an enum, so the name can only ever be one of fourteen fixed strings, and
-- `%I` quotes it regardless.
--
-- What this buys: a new decision type is now a new function and *no* line, no
-- restatement, and no ordering hazard between two people writing migrations in
-- the same week. What it costs: the list of implemented effects is no longer
-- readable in one place. A query over `pg_proc` for names beginning `effect_`
-- is that list, and the integration suite asserts one exists per type that
-- claims to be implemented.

-- ---------------------------------------------------------------------------
-- home_rules
-- ---------------------------------------------------------------------------
-- The rule's identity: a title, a status and a pointer at whichever version is
-- currently in force. Everything that can differ between versions lives on the
-- version, including the title, which is duplicated here only so that the list
-- and the unique constraint have something to read without a join.
create table home_rules (
  id                 uuid primary key default gen_random_uuid(),
  house_id           uuid not null references houses(id) on delete cascade,
  title              text not null,
  status             rule_status not null default 'draft',
  -- Null until the first version activates. The foreign key is added after the
  -- versions table exists, which is the order docs/04-DATABASE.md states.
  current_version_id uuid,
  sort_order         integer not null default 0,
  created_by         uuid not null references house_members(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- Two rules with the same title in one Home are one rule somebody edited
  -- twice. The list has per-rule Edit and Disable (RL-05) and a duplicate title
  -- makes those two controls ambiguous to the person reading them.
  constraint home_rules_title_unique unique (house_id, title),

  -- A rule that has never activated has no current version, and a rule that
  -- has activated cannot lose one. `draft` and `proposed` are the two states
  -- before the first activation; everything after keeps a pointer.
  constraint rule_current_version_matches_status check (
    (status in ('draft', 'proposed')) or current_version_id is not null
  )
);

-- ---------------------------------------------------------------------------
-- home_rule_versions
-- ---------------------------------------------------------------------------
create table home_rule_versions (
  id            uuid primary key default gen_random_uuid(),
  house_id      uuid not null references houses(id) on delete cascade,
  rule_id       uuid not null references home_rules(id) on delete cascade,
  version_no    integer not null,

  -- RL-09 — exactly what the Admin typed, kept forever. Not nullable and not
  -- trimmed to the structured fields: a Home reading its own rules in December
  -- is reading this column, not the jsonb.
  original_text text not null,
  parsed_by     rule_parse_source not null default 'manual',

  title         text not null,
  -- jsonb rather than columns because the structured kinds are a small,
  -- growing vocabulary and version 2.0 executes exactly two of them
  -- automatically. A rule the Home wrote down and agreed to is valuable
  -- whether or not the engine can act on it (docs/04-DATABASE.md section 4.8).
  condition     jsonb not null default '{}'::jsonb,
  action        jsonb not null default '{}'::jsonb,
  applies_to    jsonb not null default '{"kind":"all"}'::jsonb,

  -- RL-10. Both nullable: most rules carry neither, and a rule that carries
  -- one feeds the effort and settlement engines only from `activated_at` on.
  weight_points integer,
  penalty_paise bigint,

  starts_on     date,
  ends_on       date,

  change_reason text,

  -- SEC-16, and the single most important line in this file.
  decision_id   uuid references decisions(id),
  activated_at  timestamptz,
  superseded_at timestamptz,

  created_by    uuid not null references house_members(id),
  created_at    timestamptz not null default now(),

  constraint home_rule_versions_no_unique unique (rule_id, version_no),

  -- RL-04: a rule cannot go live without a decision behind it.
  constraint activation_requires_decision
    check (activated_at is null or decision_id is not null),

  -- A version cannot stop being in force before it started being in force.
  constraint supersede_after_activation
    check (superseded_at is null or activated_at is not null),

  constraint sane_dates
    check (ends_on is null or starts_on is null or ends_on >= starts_on),

  -- Ranges the Home cannot have meant, and the same bounds the parse
  -- validation applies (docs/10-LLM-SPEC.md section 8.3). A points weight of
  -- nine thousand or a penalty of eight lakh is a typo somebody would
  -- otherwise acknowledge.
  constraint weight_in_range check (weight_points is null
    or (weight_points >= 1 and weight_points <= 100)),
  constraint penalty_in_range check (penalty_paise is null
    or (penalty_paise >= 0 and penalty_paise <= 1000000))
);

alter table home_rules add constraint fk_current_version
  foreign key (current_version_id) references home_rule_versions(id);

create index idx_rules_active on home_rules(house_id, sort_order)
  where status = 'active';
create index idx_rules_house on home_rules(house_id, status);
create index idx_rule_versions on home_rule_versions(rule_id, version_no desc);

-- The read the effort and settlement engines make: every version in force in
-- this Home right now that carries a number.
create index idx_rule_versions_live on home_rule_versions(house_id)
  where activated_at is not null and superseded_at is null;

-- ---------------------------------------------------------------------------
-- One version in force per rule
-- ---------------------------------------------------------------------------
-- The `current_version_id` pointer says which version is current; this says the
-- same thing from the version's side, so that a half-applied effect cannot
-- leave two versions both claiming to be live.
create unique index idx_rule_one_live_version on home_rule_versions(rule_id)
  where activated_at is not null and superseded_at is null;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table home_rules         enable row level security;
alter table home_rule_versions enable row level security;

-- Every member reads every rule and every version of it, including drafts and
-- the ones waiting on a decision. A rule only its author can see is not a house
-- rule, and RL-07's history has to be answerable by the people who are bound by
-- it rather than only by the person who wrote it.
create policy read_home_rules on home_rules
  for select using (is_house_member(house_id));

create policy read_home_rule_versions on home_rule_versions
  for select using (is_house_member(house_id));

-- Writing is a lead's, and only ever into the states before activation. A lead
-- may draft a rule and draft the next version of one; nothing here can set
-- `activated_at`, `decision_id` or `superseded_at`, because those three columns
-- only ever move inside `effect_change_rule`.
create policy draft_home_rules on home_rules
  for insert with check (
    is_house_lead(house_id)
    and status = 'draft'
    and current_version_id is null
  );

-- Update is narrow on purpose: the title and the sort order of a rule, and the
-- draft-to-proposed transition the proposal makes. The `with check` clause
-- keeps `active` reachable only from the effect, because a lead updating a rule
-- that is already active must be able to leave it active.
create policy edit_home_rules on home_rules
  for update using (is_house_lead(house_id))
  with check (
    is_house_lead(house_id)
    and status in ('draft', 'proposed', 'active', 'disabled')
  );

create policy draft_home_rule_versions on home_rule_versions
  for insert with check (
    is_house_lead(house_id)
    and activated_at  is null
    and superseded_at is null
    and decision_id   is null
    and exists (
      select 1 from home_rules r
       where r.id = home_rule_versions.rule_id
         and r.house_id = home_rule_versions.house_id
    )
  );

-- A pending version may be corrected before its decision is answered, and
-- deleted if the proposal never got made. Neither is reachable once it is live:
-- both clauses require `activated_at is null`.
create policy edit_pending_versions on home_rule_versions
  for update using (is_house_lead(house_id) and activated_at is null)
  with check (
    is_house_lead(house_id)
    and activated_at  is null
    and superseded_at is null
    and decision_id   is null
  );

create policy delete_pending_versions on home_rule_versions
  for delete using (is_house_lead(house_id) and activated_at is null);

-- No delete policy on `home_rules`, deliberately. A rule the Home is finished
-- with is disabled, which is a version transition and keeps the history RL-06
-- and RL-07 promise. Deleting one would take its versions with it.

-- ---------------------------------------------------------------------------
-- next_rule_version_no
-- ---------------------------------------------------------------------------
-- Read and increment under the rule's own row lock, so two leads drafting an
-- edit at the same moment do not both write version 3 and lose one to the
-- unique constraint at random.
create or replace function next_rule_version_no(p_rule_id uuid)
returns integer as $$
declare
  v_next integer;
begin
  perform 1 from home_rules where id = p_rule_id for update;
  select coalesce(max(version_no), 0) + 1 into v_next
    from home_rule_versions where rule_id = p_rule_id;
  return v_next;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function next_rule_version_no(uuid) from public, anon;
grant  execute on function next_rule_version_no(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- effect_change_rule
-- ---------------------------------------------------------------------------
-- What an approved `change_rule` decision actually does. One code path for
-- create, edit, disable and re-enable, because from the version table's side
-- they are the same event: a pending version becomes the one in force and
-- whichever was in force stops being.
--
-- The decision's `subject_id` is the pending version. `payload.action` says
-- which of the four it was, and it changes exactly one thing — the rule's
-- status afterwards. Everything else is identical, which is what keeps
-- "disabling is a version transition, not a delete" true rather than
-- aspirational.
create or replace function effect_change_rule(p_decision decisions)
returns jsonb as $$
declare
  v_version  home_rule_versions%rowtype;
  v_rule     home_rules%rowtype;
  v_previous home_rule_versions%rowtype;
  v_action   text := coalesce(p_decision.payload ->> 'action', 'edit');
  v_status   rule_status;
begin
  if p_decision.subject_id is null then
    raise exception 'SUBJECT_REQUIRED: change_rule without a version'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_version from home_rule_versions
   where id = p_decision.subject_id for update;

  if v_version.id is null then
    raise exception 'RULE_VERSION_NOT_FOUND: %', p_decision.subject_id
      using errcode = 'no_data_found';
  end if;
  if v_version.house_id <> p_decision.house_id then
    raise exception 'RULE_WRONG_HOUSE' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_rule from home_rules where id = v_version.rule_id for update;

  -- Applying twice is a no-op rather than a second supersession. The route
  -- handler can be retried and a job can sweep a list it read a moment ago;
  -- neither should be able to age out the version this one just activated.
  if v_version.activated_at is not null then
    return jsonb_build_object(
      'rule_id',    v_rule.id,
      'version_id', v_version.id,
      'version_no', v_version.version_no,
      'status',     v_rule.status,
      'already',    true
    );
  end if;

  -- Whatever was in force stops being in force at the same instant the new one
  -- starts. The partial unique index would refuse anything else.
  select * into v_previous from home_rule_versions
   where rule_id = v_rule.id
     and activated_at  is not null
     and superseded_at is null
   for update;

  if v_previous.id is not null then
    update home_rule_versions
       set superseded_at = now()
     where id = v_previous.id;
  end if;

  update home_rule_versions
     set activated_at = now(),
         decision_id  = p_decision.id,
         -- A rule with no explicit start date starts the day the Home agreed to
         -- it, which is the answer RL-10 needs: the effort and settlement
         -- engines read `starts_on`, and a null there would read as "always",
         -- including over months that are already closed.
         starts_on    = coalesce(starts_on, (now() at time zone (
                          select timezone from houses where id = p_decision.house_id
                        ))::date)
   where id = v_version.id
  returning * into v_version;

  v_status := case v_action
                when 'disable' then 'disabled'::rule_status
                else 'active'::rule_status
              end;

  update home_rules
     set current_version_id = v_version.id,
         title              = v_version.title,
         status             = v_status,
         updated_at         = now()
   where id = v_rule.id
  returning * into v_rule;

  return jsonb_build_object(
    'rule_id',            v_rule.id,
    'title',              v_rule.title,
    'status',             v_rule.status,
    'action',             v_action,
    'version_id',         v_version.id,
    'version_no',         v_version.version_no,
    'activated_at',       v_version.activated_at,
    'superseded_version', v_previous.id,
    'weight_points',      v_version.weight_points,
    'penalty_paise',      v_version.penalty_paise,
    'already',            false
  );
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function effect_change_rule(decisions) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The outcomes that are not approval
-- ---------------------------------------------------------------------------
-- A rejected, lapsed or withdrawn rule change leaves the rule exactly as it
-- was — which for a brand-new rule means `draft`, and for an edit means the
-- version already in force stays in force. The pending version row is kept: it
-- is what the Home refused, and RL-07's history is poorer without it.
--
-- A trigger rather than a line in the route handler, for the reason migration
-- 057 gives: a decision lapses on a cron job's timetable with nobody logged in,
-- and a rule left saying `proposed` months after its decision lapsed is a lie
-- the list would faithfully render.
create or replace function mirror_rule_decision() returns trigger as $$
begin
  if new.type <> 'change_rule' or new.subject_id is null then
    return new;
  end if;
  if new.status = old.status or new.status = 'waiting' then
    return new;
  end if;

  if new.status in ('rejected', 'lapsed', 'cancelled') then
    update home_rules
       set status     = 'draft',
           updated_at = now()
     where id = (select rule_id from home_rule_versions where id = new.subject_id)
       and status = 'proposed';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_decision_mirrors_rule
  after update of status on decisions
  for each row execute function mirror_rule_decision();

-- ---------------------------------------------------------------------------
-- apply_decision_effect — a lookup rather than a `case`
-- ---------------------------------------------------------------------------
-- See the header of this file for why. `p_input` still carries the apply-time
-- numbers the database cannot compute; an effect that wants them declares the
-- two-argument signature and gets them, and one that does not declares one
-- argument and is called with the decision alone.
create or replace function apply_decision_effect(
  p_decision decisions,
  p_input    jsonb default '{}'::jsonb
) returns jsonb as $$
declare
  v_name   text := 'effect_' || p_decision.type::text;
  v_result jsonb;
begin
  if to_regprocedure(format('%I(decisions, jsonb)', v_name)) is not null then
    execute format('select %I($1, $2)', v_name)
       into v_result using p_decision, coalesce(p_input, '{}'::jsonb);
    return v_result;
  end if;

  if to_regprocedure(format('%I(decisions)', v_name)) is not null then
    execute format('select %I($1)', v_name) into v_result using p_decision;
    return v_result;
  end if;

  -- A named refusal rather than a silent no-op, and rather than an `applied`
  -- status over nothing having happened. A decision the Home answered and the
  -- code cannot carry out stays `approved` and stays visible.
  raise exception 'EFFECT_NOT_IMPLEMENTED: %', p_decision.type
    using errcode = 'feature_not_supported';
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function apply_decision_effect(decisions, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Per-Home capability switches (AI-02)
-- ---------------------------------------------------------------------------
-- docs/10-LLM-SPEC.md section 3.6a. A Home with a key still decides which of
-- the six call sites may use it, and a capability that is off behaves exactly
-- as if no key were configured — for that feature alone, with no banner, no
-- upsell and no error.
--
-- jsonb rather than six boolean columns because the set grows with the call
-- sites and the alternative is a migration per feature. The default is all on:
-- a Home that pasted a key meant to enable AI, and the switches are for taking
-- one back rather than for turning six on.
alter table house_llm_credentials
  add column capabilities jsonb not null default '{
    "schedule_proposals": true,
    "weekly_summary":     true,
    "natural_language":   true,
    "rule_parsing":       true,
    "food_ideas":         true,
    "food_normalise":     true
  }'::jsonb;

-- Only the six keys, and only booleans. A typo that silently disables a call
-- site is the failure mode worth spending a constraint on.
--
-- Through a function because a `check` may not contain a subquery and
-- `jsonb_each` is one. It is `immutable` in the sense the planner needs — the
-- same jsonb always gives the same answer — and the capability list is a
-- constant in it, so adding a seventh call site is a `create or replace` here
-- and a re-validation of the constraint.
create or replace function llm_capabilities_well_formed(p_capabilities jsonb)
returns boolean as $$
  select jsonb_typeof(p_capabilities) = 'object'
     and not exists (
       select 1 from jsonb_each(p_capabilities) as entry(key, value)
        where entry.key not in ('schedule_proposals', 'weekly_summary',
                                'natural_language', 'rule_parsing',
                                'food_ideas', 'food_normalise')
           or jsonb_typeof(entry.value) <> 'boolean'
     );
$$ language sql immutable set search_path = public;

alter table house_llm_credentials
  add constraint capabilities_well_formed
  check (llm_capabilities_well_formed(capabilities));
