-- 069 — A rule that is disabled with a date already past
--
-- Source: `tests/integration/rules.test.ts`, which found it.
--
-- `effect_change_rule` in 066 stamps `starts_on` with the day the Home agreed
-- to the version, when the version does not carry one. RL-10 needs that: the
-- effort and settlement engines read `starts_on`, and a null there reads as
-- "always", including over months that are already closed.
--
-- It collides with `sane_dates` in exactly one case. A version that carries an
-- `ends_on` in the past and no `starts_on` — a rule the Home is stopping, with
-- the date it stopped being observed rather than the date of the conversation —
-- would be stamped with today, and today is after the end date. The check
-- constraint refuses it, the effect raises, and the transaction rolls back:
-- the decision stays `approved` and the rule is never disabled, which is the
-- worst of the three possible outcomes because it is the silent one.
--
-- The fix is to stamp the earlier of the two. A rule whose end date has already
-- passed starts and ends on that date, which is a truthful reading of "this was
-- in force until then and is not now" and is what the history should show.
--
-- Whole body restated per D-19; the only change is the `starts_on` expression.
create or replace function effect_change_rule(p_decision decisions)
returns jsonb as $$
declare
  v_version  home_rule_versions%rowtype;
  v_rule     home_rules%rowtype;
  v_previous home_rule_versions%rowtype;
  v_action   text := coalesce(p_decision.payload ->> 'action', 'edit');
  v_status   rule_status;
  v_today    date;
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

  select (now() at time zone h.timezone)::date into v_today
    from houses h where h.id = p_decision.house_id;

  update home_rule_versions
     set activated_at = now(),
         decision_id  = p_decision.id,
         starts_on    = coalesce(
                          starts_on,
                          case
                            when ends_on is not null and ends_on < v_today then ends_on
                            else v_today
                          end
                        )
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
