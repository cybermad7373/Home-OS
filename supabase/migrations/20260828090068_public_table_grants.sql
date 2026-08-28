-- 068 — The table privileges every earlier migration assumed it had
--
-- Source: the Supabase platform bootstrap, docs/13-SETUP-RUNBOOK.md, and a
-- local database on which 43 of 43 tables answered
-- `42501 permission denied` to a correctly authenticated member.
--
-- ---------------------------------------------------------------------------
-- What went wrong, and why no migration caught it
-- ---------------------------------------------------------------------------
-- Two things decide whether a caller may read a row. Row-level security decides
-- *which rows*; table privileges decide *whether they may ask at all*. This
-- repository's migrations only ever wrote the first kind, because the second
-- kind arrived for free: `supabase db reset` and the hosted platform both
-- install default privileges on `public` before any migration runs, so every
-- `create table` inherited `select, insert, update, delete` for `anon`,
-- `authenticated` and `service_role`.
--
-- `supabase migration up` against a stack that is already running does not
-- install them. A database brought up that way has every policy this repository
-- has ever written and no privileges for them to constrain, and the symptom is
-- not a policy refusal — it is `42501` on every table, for every caller,
-- including the ones RLS would have admitted.
--
-- So the privileges are stated here rather than inherited. Three consequences,
-- all of them wanted:
--
--   * a database built by either path ends up the same;
--   * `alter default privileges` means the next table added by either path also
--     ends up the same, which is the part that stops this recurring;
--   * the grants are in version control, where a reader can disagree with them.
--
-- ---------------------------------------------------------------------------
-- Why `anon` is on this list
-- ---------------------------------------------------------------------------
-- It looks wrong and it is not. Every table in `public` has row-level security
-- enabled — checked, not assumed — and every policy on every one of them is
-- keyed on `auth.uid()` through `is_house_member`, `is_house_lead` or an
-- equivalent. An anonymous caller satisfies none of them and reads zero rows.
-- Granting `anon` the privilege is what the platform does and what the hosted
-- project already has; withholding it here would make the local stack differ
-- from production in the direction that hides bugs rather than surfaces them.
--
-- ---------------------------------------------------------------------------
-- What is deliberately NOT granted
-- ---------------------------------------------------------------------------
-- **Routines.** `grant all on all routines in schema public` would undo, in one
-- line, every `revoke execute` this repository has written on purpose:
-- `apply_decision` is granted to `service_role` alone, `apply_decision_effect`
-- and every `effect_*` function to nobody, and the service functions in
-- migration 037 were revoked from `public` in a migration of their own. Those
-- revocations are load-bearing — `apply_decision` reachable from a browser is
-- the whole governance model gone — so functions are left exactly as each
-- migration left them.
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete
  on all tables in schema public
  to anon, authenticated, service_role;

grant usage, select
  on all sequences in schema public
  to anon, authenticated, service_role;

-- The half that stops this recurring. Applied for `postgres`, which is the role
-- the CLI runs migrations as, so a table created by a future migration carries
-- these privileges whichever way that migration is applied.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;

alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
