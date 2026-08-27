-- 021 — Config for scheduled jobs, without a superuser
--
-- The runbook's `call_edge` reads its URL and service key from database
-- settings applied with `alter database ... set`. That needs superuser, which
-- the postgres role on hosted Supabase does not have, so the statement fails
-- and the function raises "unrecognized configuration parameter" at run time.
--
-- The values live in a table instead. It has RLS enabled and no policies at
-- all, which means anon and authenticated read exactly nothing from it; only
-- security-definer functions and the service role can see inside.

create table if not exists app_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table app_config enable row level security;
-- Deliberately no policies. RLS with no policy denies every ordinary caller.

revoke all on app_config from anon, authenticated;

create or replace function app_config_value(p_key text) returns text as $$
  select value from app_config where key = p_key;
$$ language sql security definer stable set search_path = public;

revoke execute on function app_config_value(text) from anon, authenticated;

create or replace function call_edge(fn text, body jsonb default '{}') returns void as $$
  select net.http_post(
    url     := app_config_value('supabase_url') || '/functions/v1/' || fn,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || app_config_value('service_key')),
    body    := body
  );
$$ language sql security definer;

revoke execute on function call_edge(text, jsonb) from anon, authenticated;

-- The two rows are inserted per environment, never committed:
--
--   insert into app_config (key, value) values
--     ('supabase_url', 'https://<ref>.supabase.co'),
--     ('service_key',  '<service-role key>')
--   on conflict (key) do update set value = excluded.value, updated_at = now();
