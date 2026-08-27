-- 029 — The chore jobs
-- Source: docs/02-TRD.md section 7.
--
-- Times are UTC; the comments give the Asia/Kolkata equivalent. All three are
-- idempotent, so a missed run is safe to let the next one catch up (NFR-07).

-- Sunday 19:35 IST — close the week that is ending, before the next is built.
select cron.unschedule('close-effort-week')
 where exists (select 1 from cron.job where jobname = 'close-effort-week');

select cron.schedule(
  'close-effort-week',
  '5 14 * * 0',
  $$select call_edge('close-effort-week')$$
);

-- Sunday 20:05 IST — generate and publish the coming week. It runs after the
-- close above, because next week's targets depend on this week's carry.
select cron.unschedule('generate-weekly')
 where exists (select 1 from cron.job where jobname = 'generate-weekly');

select cron.schedule(
  'generate-weekly',
  '35 14 * * 0',
  $$select call_edge('generate-weekly-schedule')$$
);

-- Every 30 minutes — confirm anything the house has left hanging past its
-- window. This is what stops non-participation becoming a veto on other
-- people's points.
select cron.unschedule('auto-confirm')
 where exists (select 1 from cron.job where jobname = 'auto-confirm');

select cron.schedule(
  'auto-confirm',
  '*/30 * * * *',
  $$select call_edge('auto-confirm-chores')$$
);

-- 23:55 IST — anything past its deadline is missed.
select cron.unschedule('mark-missed')
 where exists (select 1 from cron.job where jobname = 'mark-missed');

select cron.schedule(
  'mark-missed',
  '25 18 * * *',
  $$select call_edge('mark-missed-chores')$$
);
