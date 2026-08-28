-- 067 — Table privileges for the rules tables
--
-- Source: docs/13-SETUP-RUNBOOK.md, and an hour of a rules screen answering
-- `42501 permission denied for table home_rules` against a correct RLS policy.
--
-- ---------------------------------------------------------------------------
-- Why this file exists at all
-- ---------------------------------------------------------------------------
-- Row-level security decides which rows a caller may see. Table privileges
-- decide whether they may ask. Every table before this one got its privileges
-- implicitly, from the default privileges the Supabase CLI installs when it
-- creates a database from scratch — so nothing in `supabase/migrations` ever
-- had to say `grant`, and a table added by `supabase migration up` against an
-- already-running stack silently gets none of them.
--
-- That is a difference between two ways of applying the same migrations, which
-- is precisely the kind of difference that turns into "it works locally". The
-- grants are stated here so that the tables are usable whichever path applied
-- them, and so that a future reader can see that `authenticated` reaching these
-- tables at all is a decision rather than an inheritance.
--
-- The privileges granted are the ones the policies in 066 already constrain:
--
--   * `authenticated` may select, insert, update and delete — and RLS then
--     admits a select only from a member of the Home, an insert or update only
--     from a lead, and neither into a row that is already in force.
--   * `service_role` gets the same, because `apply_decision` runs as the
--     service role and `effect_change_rule` writes both tables.
--   * `anon` gets nothing. There is no unauthenticated view of a Home's rules.
grant select, insert, update, delete on home_rules         to authenticated, service_role;
grant select, insert, update, delete on home_rule_versions to authenticated, service_role;

revoke all on home_rules         from anon;
revoke all on home_rule_versions from anon;
