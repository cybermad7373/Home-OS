-- 037 — Actually revoke the service-role functions
--
-- Postgres grants EXECUTE on a new function to PUBLIC. Revoking it from `anon`
-- and `authenticated` — which is what migrations 031 and 032 did — removes a
-- grant those roles never needed, and leaves the PUBLIC grant they inherit
-- fully intact. The function stayed callable by every signed-in user.
--
-- `publish_schedule_for_house` takes the house id as an argument and, by
-- design, performs no admin check, because its caller is a cron job with no
-- JWT (D-13). Reachable from a browser session, that combination lets any
-- authenticated user of any house overwrite any other house's week.
--
-- The integration test named for D-13 caught it: the call it expected to be
-- refused succeeded.
--
-- Revoking from PUBLIC is the fix, and it has to be stated for every service
-- function, on every overload signature that exists.

revoke execute on function publish_schedule_for_house(
  uuid, date, jsonb, assignment_source, boolean, text, integer
) from public, anon, authenticated;

revoke execute on function seed_default_categories(uuid, household_type)
  from public, anon, authenticated;

revoke execute on function seed_default_chore_templates(uuid)
  from public, anon, authenticated;

-- `call_edge` holds the service key in its body. It was never meant to be
-- callable by a session either.
do $$
begin
  if exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'call_edge'
  ) then
    execute 'revoke execute on function call_edge(text, jsonb) from public, anon, authenticated';
  end if;
end $$;
