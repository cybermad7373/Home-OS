-- 019 — Scheduled jobs, the first of them
-- Source: docs/02-TRD.md section 7, docs/13-SETUP-RUNBOOK.md section 3.2.
--
-- Everything schedulable runs in the database's own scheduler rather than a
-- hosting tier's cron, whose free-tier frequency is too coarse (architecture
-- principle 3). The remaining jobs are added by the phases that own them.
--
-- Times are UTC. 00:30 UTC is 06:00 in Asia/Kolkata, the house timezone.
-- A house in another timezone needs these expressions recalculated: this is the
-- one place the single-timezone assumption is baked into infrastructure rather
-- than code.

create extension if not exists pg_cron;
create extension if not exists pg_net;

/**
 * Calls an edge function with the service-role key.
 *
 * The URL and key come from database settings rather than being written into
 * the migration, so this file carries no secret. Set them once per project:
 *
 *   alter database postgres set app.supabase_url  = 'https://<ref>.supabase.co';
 *   alter database postgres set app.service_key   = '<service-role key>';
 */
create or replace function call_edge(fn text, body jsonb default '{}') returns void as $$
  select net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/' || fn,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || current_setting('app.service_key')),
    body    := body
  );
$$ language sql security definer;

revoke execute on function call_edge(text, jsonb) from anon, authenticated;

-- Unschedule first so that re-running this migration on a database that already
-- has the job does not fail on the duplicate name.
select cron.unschedule('post-recurring')
 where exists (select 1 from cron.job where jobname = 'post-recurring');

select cron.schedule(
  'post-recurring',
  '30 0 * * *',                                   -- 06:00 Asia/Kolkata
  $$select call_edge('post-recurring-expenses')$$
);

-- The free tier pauses a project after 7 days of inactivity, which would take
-- the app offline. A weekly trivial query prevents it (docs/02-TRD.md 2.2).
select cron.unschedule('heartbeat')
 where exists (select 1 from cron.job where jobname = 'heartbeat');

select cron.schedule('heartbeat', '0 3 * * 1', $$select 1$$);
