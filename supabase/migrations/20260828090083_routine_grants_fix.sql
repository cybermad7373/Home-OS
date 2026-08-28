-- 083 — Two grants 080 missed, both live product bugs, not just test failures.
--
-- 1. `shares_active_house_with(uuid)` is the helper inside the RLS policy on
--    `users` (20260823090011_rls_policies.sql). 080's blanket
--    `revoke execute on all routines in schema public from public, anon,
--    authenticated` stripped it, and it was never in 080's grant-back list
--    with the other five policy helpers (current_member, has_membership,
--    is_house_admin, is_house_lead, is_house_member). A policy helper must be
--    executable by the role the policy runs as: every authenticated read of
--    any profile — including your own housemates' — now answers
--    `42501 permission denied for function shares_active_house_with`.
--
-- 2. `enqueue_notification` came out of 080 executable by no role at all,
--    including service_role. Keeping it out of a browser's hands was the
--    point (it stays revoked from anon/authenticated), but the notification
--    triggers that call it run as their own security-definer owner and don't
--    need the grant — it's the test fixtures and any future service-side
--    caller using the service-role key directly that do.

grant execute on function shares_active_house_with(uuid) to anon, authenticated, service_role;

grant execute on function enqueue_notification(uuid, uuid, text, jsonb, text, jsonb, timestamp with time zone, text, boolean) to service_role;
