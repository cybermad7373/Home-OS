-- 080 — Routine privileges: state them instead of inheriting them
--
-- Source: the same platform behaviour documented in 068, plus the test failures
-- that revealed the gap.
--   * `supabase db reset` installs default `execute` on every routine for
--     `public`, `anon`, `authenticated`, `service_role`.
--   * `supabase migration up` against a running stack does not.
--   * A database built by `migration up` therefore has every RLS policy and no
--     privilege to constrain them — but it also has every routine executable by
--     every authenticated caller, including the ones that must stay private
--     (`apply_decision`, `apply_decision_effect`, every `effect_*`, the
--     migration-037 service functions, and `enqueue_notification`).
--   * A database built by `db reset` has the opposite problem: the private
--     routines are still executable by `authenticated` because the platform
--     default grant is broader than what 068 revoked (068 only touched tables).
-- Two test suites fail for the two opposite reasons:
--   - budget-alerts: `permission denied for function check_budget_thresholds`
--     (should be callable by the cron job, not by a browser)
--   - notifications: `enqueue_notification` callable from a browser client
--     (must not be)
-- This migration fixes both by stating the grants explicitly, with the same
-- `alter default privileges` guard that 068 uses for tables.
-- ---------------------------------------------------------------------------
-- What a browser client (anon/authenticated) is meant to call — built by
-- grepping `.rpc(` across `lib/` and `app/`:
--   create_house, rotate_invitation, lookup_invitation, request_join,
--   accept_join_request, decline_join_request, withdraw_join_request,
--   create_expense, approve_expense, void_expense,
--   close_period, mark_settlement_paid, confirm_settlement, reopen_period,
--   add_dependent, claim_username, delete_room, assign_room,
--   create_decision, cancel_decision,
--   next_rule_version_no,
--   set_house_llm_credential, set_llm_capabilities, delete_house_llm_credential,
--   enqueue_house_notification,
--   mark_notification_read, mark_all_notifications_read, set_notification_prefs,
--   save_push_subscription, delete_push_subscription,
--   request_swap, respond_to_swap,
--   claim_chore, mark_chore_done, reject_chore, release_chore, confirm_chore,
--   snooze_notification,
--   publish_schedule (does admin check internally)
-- ---------------------------------------------------------------------------
-- Internal helper functions that security-definer RPCs depend on (must stay callable):
--   is_house_member, is_house_admin, is_house_lead, current_member,
--   has_membership, member_display_name, member_is_financially_clear,
--   assert_admin_remains, assert_member_field_privilege, assert_period_open,
--   assert_room_capacity, assert_split_sum, assert_subject_not_participant
-- ---------------------------------------------------------------------------
-- What MUST NOT be callable from a browser (revoked from public, anon, authenticated):
--   apply_decision                  -> service_role only
--   apply_decision_effect           -> nobody
--   effect_* (all)                  -> nobody
--   publish_schedule_for_house      -> service_role only (cron job)
--   notify_schedule_published       -> service_role only (cron job)
--   check_budget_thresholds         -> service_role only (pg_cron job)
--   complete_pending_removals       -> service_role only (pg_cron job)
--   expire_decisions                -> service_role only (pg_cron job)
--   enqueue_notification            -> nobody (security-definer, called by triggers only)
--   All migration-037 service functions (revoked in 037) -> nobody
-- ---------------------------------------------------------------------------

-- Baseline: revoke execute on ALL routines from public, anon, authenticated
revoke execute on all routines in schema public from public, anon, authenticated;

-- Grant back internal helper functions that security-definer RPCs depend on
grant execute on function is_house_member(uuid) to anon, authenticated, service_role;
grant execute on function is_house_admin(uuid) to anon, authenticated, service_role;
grant execute on function is_house_lead(uuid) to anon, authenticated, service_role;
grant execute on function current_member(uuid) to anon, authenticated, service_role;
grant execute on function has_membership(uuid) to anon, authenticated, service_role;
grant execute on function member_display_name(uuid) to anon, authenticated, service_role;
grant execute on function member_is_financially_clear(uuid) to anon, authenticated, service_role;
grant execute on function assert_admin_remains() to anon, authenticated, service_role;
grant execute on function assert_member_field_privilege() to anon, authenticated, service_role;
grant execute on function assert_period_open() to anon, authenticated, service_role;
grant execute on function assert_room_capacity() to anon, authenticated, service_role;
grant execute on function assert_split_sum() to anon, authenticated, service_role;
grant execute on function assert_subject_not_participant() to anon, authenticated, service_role;

-- Grant back ONLY what a browser client is meant to call
grant execute on function create_house(text, text, text, text, home_type, text, text, text, text) to anon, authenticated, service_role;
grant execute on function rotate_invitation(uuid) to anon, authenticated, service_role;
grant execute on function lookup_invitation(text) to anon, authenticated, service_role;
grant execute on function request_join(text, text) to anon, authenticated, service_role;
grant execute on function accept_join_request(uuid, uuid) to anon, authenticated, service_role;
grant execute on function decline_join_request(uuid, text) to anon, authenticated, service_role;
grant execute on function withdraw_join_request(uuid) to anon, authenticated, service_role;
grant execute on function create_expense(uuid, bigint, date, split_basis, jsonb, text, uuid, text, text, boolean, text, uuid) to anon, authenticated, service_role;
grant execute on function approve_expense(uuid, boolean, text) to anon, authenticated, service_role;
grant execute on function void_expense(uuid, text) to anon, authenticated, service_role;
grant execute on function close_period(uuid, jsonb, jsonb, jsonb) to anon, authenticated, service_role;
grant execute on function mark_settlement_paid(uuid, boolean) to anon, authenticated, service_role;
grant execute on function confirm_settlement(uuid) to anon, authenticated, service_role;
grant execute on function reopen_period(uuid, text) to anon, authenticated, service_role;
grant execute on function add_dependent(uuid, text, uuid, boolean, boolean, residency_type) to anon, authenticated, service_role;
grant execute on function claim_username(text) to anon, authenticated, service_role;
grant execute on function delete_room(uuid) to anon, authenticated, service_role;
grant execute on function assign_room(uuid, uuid, date) to anon, authenticated, service_role;
grant execute on function create_decision(uuid, decision_type, decision_level, jsonb, integer, integer, text, uuid, uuid, jsonb, text, timestamp with time zone, uuid) to anon, authenticated, service_role;
grant execute on function cancel_decision(uuid) to anon, authenticated, service_role;
grant execute on function next_rule_version_no(uuid) to anon, authenticated, service_role;
grant execute on function set_house_llm_credential(uuid, text, text, text, bytea, bytea, bytea, text, integer, llm_credential_status, timestamp with time zone) to anon, authenticated, service_role;
grant execute on function set_llm_capabilities(uuid, jsonb) to anon, authenticated, service_role;
grant execute on function delete_house_llm_credential(uuid) to anon, authenticated, service_role;
grant execute on function enqueue_house_notification(uuid, text, jsonb, uuid, text, jsonb, timestamp with time zone, boolean) to anon, authenticated, service_role;
grant execute on function mark_notification_read(uuid) to anon, authenticated, service_role;
grant execute on function mark_all_notifications_read(uuid) to anon, authenticated, service_role;
grant execute on function set_notification_prefs(boolean, boolean, boolean, boolean, boolean, boolean, time, time, boolean, boolean, boolean) to anon, authenticated, service_role;
grant execute on function save_push_subscription(text, text, text, text, text) to anon, authenticated, service_role;
grant execute on function delete_push_subscription(text) to anon, authenticated, service_role;
grant execute on function request_swap(uuid, uuid, text) to anon, authenticated, service_role;
grant execute on function respond_to_swap(uuid, boolean) to anon, authenticated, service_role;
grant execute on function claim_chore(uuid) to anon, authenticated, service_role;
grant execute on function mark_chore_done(uuid, text) to anon, authenticated, service_role;
grant execute on function reject_chore(uuid, text) to anon, authenticated, service_role;
grant execute on function release_chore(uuid) to anon, authenticated, service_role;
grant execute on function confirm_chore(uuid) to anon, authenticated, service_role;
grant execute on function snooze_notification(uuid) to anon, authenticated, service_role;
grant execute on function publish_schedule(date, jsonb, assignment_source, boolean, text, integer) to anon, authenticated, service_role;

-- Load-bearing revocations (re-asserting what 068 and 037 established)
-- apply_decision: service_role only (takes p_input jsonb)
revoke execute on function apply_decision(uuid, jsonb) from public, anon, authenticated;
grant execute on function apply_decision(uuid, jsonb) to service_role;

-- apply_decision_effect: nobody (takes p_input jsonb)
revoke execute on function apply_decision_effect(decisions, jsonb) from public, anon, authenticated, service_role;

-- All effect_* functions: nobody (they are invoked only by apply_decision)
-- We revoke from all roles; the dispatcher runs as service_role and calls them
-- with security definer, so the revoke does not block the dispatcher.
do $$
declare
  r record;
begin
  for r in
    select proname, pg_get_function_identity_arguments(oid) as args
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname like 'effect\_%' escape '\'
  loop
    execute format('revoke execute on function %I(%s) from public, anon, authenticated, service_role',
      r.proname, r.args);
  end loop;
end $$;

-- Migration-037 service functions: revoked from public (037 did this), but
-- db reset re-grants them to authenticated. Re-assert the revocation.
revoke execute on function publish_schedule_for_house(uuid, date, jsonb, assignment_source, boolean, text, integer) from public, anon, authenticated;
revoke execute on function seed_default_chore_templates(uuid) from public, anon, authenticated;

-- Cron/service functions: service_role only
revoke execute on function publish_schedule_for_house(uuid, date, jsonb, assignment_source, boolean, text, integer) from public, anon, authenticated;
grant execute on function publish_schedule_for_house(uuid, date, jsonb, assignment_source, boolean, text, integer) to service_role;

revoke execute on function notify_schedule_published(uuid) from public, anon, authenticated;
grant execute on function notify_schedule_published(uuid) to service_role;

revoke execute on function check_budget_thresholds() from public, anon, authenticated;
grant execute on function check_budget_thresholds() to service_role;

revoke execute on function complete_pending_removals() from public, anon, authenticated;
grant execute on function complete_pending_removals() to service_role;

revoke execute on function expire_decisions() from public, anon, authenticated;
grant execute on function expire_decisions() to service_role;

-- enqueue_notification: nobody (trigger-only, security definer)
revoke execute on function enqueue_notification(uuid, uuid, text, jsonb, text, jsonb, timestamp with time zone, text, boolean) from public, anon, authenticated, service_role;

-- The half that stops this recurring: default privileges for future functions
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

-- Tables and sequences keep the grants from 068 (no change needed here)