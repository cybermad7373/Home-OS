-- 092 — A retention limit, on the things that are noise rather than record
--
-- The privacy page said: "There is no automatic retention limit. A household's
-- records are kept until somebody removes them." Half of that stays true on
-- purpose, and the half that goes is the half nobody would defend keeping.
--
-- ## What is never aged out, and why
--
-- The ledger and the work record. An expense, a split, a settlement, a chore, a
-- decision, a rule: these are what the product *is*, several people rely on
-- them being the same tomorrow as today, and a household that opens last
-- March's month to check a figure must find it there. Deleting them on a timer
-- would be a data-loss feature wearing a privacy hat. `docs/09-BUSINESS-RULES.md`
-- and the close/settlement rules assume history is complete; nothing here
-- touches it.
--
-- ## What is aged out
--
-- Notifications and dead invitations — the two things this app accumulates that
-- are addressed to a person rather than recorded about a household, and that
-- nobody has ever gone back to read.
--
--   * A **read** notification, after 180 days. It has done its whole job.
--   * An **unread** one, after 365 days. If it has not been opened in a year it
--     is not going to be, and it is still a sentence about somebody's money
--     sitting in a table.
--   * An **invitation** that expired or was revoked, 90 days after it died.
--     A live invitation is never touched, whatever its age.
--   * A **join request** that was declined or withdrawn, after 365 days. It
--     carries a message somebody typed and an answer nobody needs again.
--     An accepted one stays: it is how a membership began.
--
-- ## Why constants rather than a setting
--
-- A retention period a household can change is a retention period nobody can
-- describe on a privacy page, and the page is where this has to be true. These
-- numbers are written there in words.
-- ---------------------------------------------------------------------------

create or replace function purge_expired_records()
returns table (
  notifications_deleted   integer,
  invitations_deleted     integer,
  join_requests_deleted   integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notifications integer := 0;
  v_invitations   integer := 0;
  v_requests      integer := 0;
  v_batch         integer;
begin
  delete from notifications
   where read_at is not null
     and created_at < now() - interval '180 days';
  get diagnostics v_notifications = row_count;

  delete from notifications
   where read_at is null
     and created_at < now() - interval '365 days';
  get diagnostics v_batch = row_count;
  v_notifications := v_notifications + v_batch;

  -- Dead, and dead for a quarter. `expires_at` in the past or a revocation is
  -- what "dead" means; a live invitation of any age is left alone.
  delete from invitations
   where (
           (expires_at is not null and expires_at < now() - interval '90 days')
           or (revoked_at is not null and revoked_at < now() - interval '90 days')
         );
  get diagnostics v_invitations = row_count;

  delete from join_requests
   where status in ('declined', 'withdrawn')
     and created_at < now() - interval '365 days';
  get diagnostics v_requests = row_count;

  return query select v_notifications, v_invitations, v_requests;
end;
$$;

comment on function purge_expired_records() is
  'Deletes read notifications after 180 days, unread after 365, dead invitations '
  '90 days after they died, and refused join requests after 365 days. Touches no '
  'expense, split, settlement, chore, decision or rule — those are the record.';

revoke all on function purge_expired_records() from public, anon, authenticated;
grant execute on function purge_expired_records() to service_role;

select cron.unschedule('purge-expired')
 where exists (select 1 from cron.job where jobname = 'purge-expired');

-- Weekly, at an hour nothing else uses. There is no urgency in a retention
-- sweep and a nightly one would only make the logs longer.
select cron.schedule(
  'purge-expired',
  '43 3 * * 0',
  $$select purge_expired_records()$$
);
