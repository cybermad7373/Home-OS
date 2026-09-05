-- 090 — A signed-in member cannot hammer a write endpoint
--
-- docs/18-GO-LIVE.md section 6: "There is no application-level rate limiting."
-- Supabase rate-limits auth upstream, and `/api/auth/signup` already handles
-- `EMAIL_RATE_LIMITED`; every other route requires a session. What was not
-- protected was a signed-in member — or a script holding their cookie — posting
-- expenses in a loop.
--
-- **Why this is in the database and not in the server.** The go-live document
-- argued that an in-memory limiter is worse than none, because on a deploy of
-- more than one instance it limits a fraction of traffic and lies about the
-- rest. That argument stands. It also rules out putting the counter anywhere
-- that is per process. Postgres is the one thing every instance already shares,
-- and `insert … on conflict do update … returning` is a single atomic
-- round trip, so two instances racing on the same member increment the same row
-- rather than each seeing a count of one.
--
-- This does not replace a limiter at the host or the CDN, which is where a
-- flood should be stopped before it costs anything. It is the floor under one:
-- a limit that exists wherever this is deployed, including a deployment that
-- has no CDN in front of it at all.
--
-- **A fixed window, deliberately.** Sixty requests at the end of one minute and
-- sixty at the start of the next is 120 in two seconds, which a sliding window
-- would refuse. The defence being built here is against a loop, not against a
-- burst, and a loop trips a fixed window within one window. A sliding log costs
-- a row per request and a scan per check; this costs one row per member per
-- window.
-- ---------------------------------------------------------------------------

create table if not exists rate_limit_hits (
  bucket       text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (bucket, window_start)
);

comment on table rate_limit_hits is
  'One row per caller per scope per window. Written only by consume_rate_limit; '
  'no policy grants anybody a read, because nothing reads it through PostgREST.';

-- RLS on with no policy at all: the table is unreachable to `anon` and
-- `authenticated` by every path except the security-definer function below,
-- which is the only thing that should ever touch it. A member must not be able
-- to read the shape of anybody's traffic, or to delete their own counter.
alter table rate_limit_hits enable row level security;

revoke all on table rate_limit_hits from public, anon, authenticated;

-- The sweep below runs as the cron job's role.
grant select, delete on table rate_limit_hits to service_role;

-- ---------------------------------------------------------------------------
-- consume_rate_limit: count this request, and say whether it is allowed.
--
-- The identity comes from `auth.uid()` inside the function and never from an
-- argument, so a caller cannot pick a bucket that nobody else is filling. The
-- scope is an argument because the proxy classifies the request — today there
-- is one class, "write" — and a caller who forged a scope would only move their
-- own counter, not escape one.
--
-- An unauthenticated caller is allowed through: the only routes they can reach
-- are sign-in and sign-up, which Supabase limits upstream, and the alternative
-- is a shared bucket that one bad actor closes for everybody trying to sign in.
-- ---------------------------------------------------------------------------
create or replace function consume_rate_limit(
  p_scope           text,
  p_limit           integer,
  p_window_seconds  integer
)
returns table (allowed boolean, hits integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_window timestamptz;
  v_hits   integer;
begin
  if v_uid is null then
    return query select true, 0, 0;
    return;
  end if;

  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'VALIDATION_FAILED';
  end if;

  -- The floor of now over the window length: every caller in the same window
  -- lands on the same row, and the row's key is what makes the counter shared.
  v_window := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into rate_limit_hits as r (bucket, window_start, hits)
  values (v_uid::text || ':' || p_scope, v_window, 1)
  on conflict (bucket, window_start)
    do update set hits = r.hits + 1
  returning r.hits into v_hits;

  return query
  select
    v_hits <= p_limit,
    v_hits,
    -- What to put in Retry-After: whole seconds until this window ends, and at
    -- least one, because "retry after 0 seconds" is an invitation to spin.
    greatest(
      1,
      ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - clock_timestamp())))::integer
    );
end;
$$;

comment on function consume_rate_limit(text, integer, integer) is
  'Counts one request for the calling user in a fixed window and reports whether '
  'it is within the limit. Identity comes from auth.uid(), never from an argument.';

revoke all on function consume_rate_limit(text, integer, integer) from public;
grant execute on function consume_rate_limit(text, integer, integer)
  to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- The sweep. Without it the table grows by one row per member per active
-- window forever — small, and unbounded, which is the part that matters.
-- Anything older than a day is a window nobody can still be inside.
-- ---------------------------------------------------------------------------
create or replace function sweep_rate_limit_hits()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from rate_limit_hits where window_start < now() - interval '1 day';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function sweep_rate_limit_hits() from public, anon, authenticated;
grant execute on function sweep_rate_limit_hits() to service_role;

select cron.unschedule('sweep-rate-limit')
 where exists (select 1 from cron.job where jobname = 'sweep-rate-limit');

select cron.schedule(
  'sweep-rate-limit',
  '17 2 * * *',
  $$select sweep_rate_limit_hits()$$
);
