-- 20260903000000_grant_llm_capabilities_check.sql
--
-- `house_llm_credentials` carries
--
--   check (llm_capabilities_well_formed(capabilities))
--
-- and that function was never granted to anybody. Migration 066 created it and
-- relied on the default `execute` grant to `public`; migration 080 swept that
-- default away for every routine in the schema, and this one was not on its
-- list of things to grant back.
--
-- A `check` expression is evaluated as the calling role, not as the table
-- owner, so the result was that *no* role could write the table:
--
--   insert into house_llm_credentials …
--   ERROR:  permission denied for function llm_capabilities_well_formed
--
-- which means a house admin pasting their provider key got an error rather than
-- a saved key, and the per-house credential path in docs/10-LLM-SPEC.md — the
-- ordinary path, the one the whole encrypted-credential design exists for —
-- could not be used at all. The environment fallback still worked, which is why
-- this went unnoticed: AI features degraded to the deterministic branch exactly
-- as they are designed to when a house has no key.
--
-- The function reads no table and takes no argument but the jsonb it is given,
-- so granting it is not a privilege escalation. It is a pure validator.

grant execute on function llm_capabilities_well_formed(jsonb)
  to anon, authenticated, service_role;
