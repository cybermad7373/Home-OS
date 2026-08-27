-- 045 — House-owned LLM credentials, and the run log
--
-- Source: docs/10-LLM-SPEC.md v2.0 sections 2 and 3, docs/04-DATABASE.md
-- section 4.9, decisions D-35 and D-36.
--
-- The key belongs to the house, not to whoever deployed the app. One
-- deployment serves several houses, free tiers are per account, and a house
-- that stops paying should stop calling — none of which an operator
-- environment variable expresses.
--
-- The rule that shapes this file: no role reads the ciphertext. The table has
-- row-level security enabled and no `select` policy at all, so `authenticated`
-- gets zero rows from it under any query. Writes go through a `security
-- definer` function that checks house admin. Reads for the purpose of making a
-- call happen with the service role, in a route handler or an Edge Function,
-- and nowhere else.

create type llm_credential_status as enum ('unverified', 'active', 'failing', 'disabled');

create table house_llm_credentials (
  house_id         uuid primary key references houses(id) on delete cascade,
  provider         text not null,
  model            text not null,
  base_url         text,                       -- only for provider = 'custom'
  key_ciphertext   bytea not null,             -- AES-256-GCM
  key_iv           bytea not null,             -- 12 random bytes, per write
  key_tag          bytea not null,             -- the 16-byte auth tag
  key_last4        text not null,              -- for display; never the whole key
  key_version      integer not null default 1, -- which master key sealed it
  status           llm_credential_status not null default 'unverified',
  last_verified_at timestamptz,
  last_error       text,
  created_by       uuid not null references users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- Section 3.7: adding a provider is one registry row and one line here.
  constraint house_llm_credentials_provider_known check (
    provider in ('gemini', 'groq', 'openrouter', 'huggingface', 'cerebras',
                 'mistral', 'openai', 'anthropic', 'custom')
  ),
  -- A custom endpoint is the only one whose base URL is not in the registry,
  -- and it is useless without one.
  constraint house_llm_credentials_custom_base_url check (
    provider <> 'custom' or base_url is not null
  )
);

alter table house_llm_credentials enable row level security;

-- Deliberately no policy of any kind. Every read is service-role; every write
-- is `set_house_llm_credential`. A policy added here later would be a defect,
-- not a feature.

-- What the UI reads instead. It contains nothing secret, and it is filtered to
-- the caller's own house inside the view body rather than by a policy, because
-- a view over an RLS table with no policy returns nothing under
-- `security_invoker`.
create view house_llm_config
  with (security_invoker = false) as
  select house_id, provider, model, base_url, key_last4, status,
         last_verified_at, updated_at, last_error
    from house_llm_credentials
   where is_house_member(house_id);

revoke all on house_llm_config from public, anon;
grant select on house_llm_config to authenticated;

-- docs/04-DATABASE.md section 4.9. Every call writes one, including failures.
-- `input_payload` is what the redaction test in section 10 of the LLM spec
-- inspects, and the key is never among the columns.
create table llm_runs (
  id                uuid primary key default gen_random_uuid(),
  house_id          uuid not null references houses(id) on delete cascade,
  purpose           llm_purpose not null,
  provider          text not null,
  model             text not null,
  input_payload     jsonb not null,
  output_payload    jsonb,
  accepted          boolean not null default false,
  validation_errors jsonb,
  prompt_tokens     integer,
  completion_tokens integer,
  latency_ms        integer,
  error             text,
  created_at        timestamptz not null default now()
);

create index llm_runs_house_created_idx on llm_runs (house_id, created_at desc);

alter table llm_runs enable row level security;

-- Section 9: the admin schedule view reports acceptance rate and the frequent
-- failure codes, so an admin reads them. Nobody writes from a browser.
create policy admin_reads_llm_runs on llm_runs
  for select using (is_house_admin(house_id));

-- ---------------------------------------------------------------------------
-- Writes
-- ---------------------------------------------------------------------------

-- The sealing happens in the application, over Web Crypto, so that the Next.js
-- server and the Deno Edge Functions share one implementation (spec 3.3). What
-- the database enforces is who may store one.
create or replace function set_house_llm_credential(
  p_house_id       uuid,
  p_provider       text,
  p_model          text,
  p_base_url       text,
  p_key_ciphertext bytea,
  p_key_iv         bytea,
  p_key_tag        bytea,
  p_key_last4      text,
  p_key_version    integer,
  p_status         llm_credential_status,
  p_verified_at    timestamptz default null
) returns void as $fn$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if not exists (
    select 1 from house_members
     where house_id = p_house_id
       and user_id  = v_user
       and status   = 'active'
       and role     = 'admin'
  ) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  insert into house_llm_credentials (
    house_id, provider, model, base_url,
    key_ciphertext, key_iv, key_tag, key_last4, key_version,
    status, last_verified_at, last_error, created_by
  ) values (
    p_house_id, p_provider, p_model, p_base_url,
    p_key_ciphertext, p_key_iv, p_key_tag, p_key_last4, p_key_version,
    p_status, p_verified_at, null, v_user
  )
  on conflict (house_id) do update
     set provider         = excluded.provider,
         model            = excluded.model,
         base_url         = excluded.base_url,
         key_ciphertext   = excluded.key_ciphertext,
         key_iv           = excluded.key_iv,
         key_tag          = excluded.key_tag,
         key_last4        = excluded.key_last4,
         key_version      = excluded.key_version,
         status           = excluded.status,
         last_verified_at = excluded.last_verified_at,
         -- Replacement clears the old rejection. A new key has not failed yet.
         last_error       = null,
         updated_at       = now();
end;
$fn$ language plpgsql security definer set search_path = public;

create or replace function delete_house_llm_credential(p_house_id uuid)
returns void as $fn$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if not exists (
    select 1 from house_members
     where house_id = p_house_id
       and user_id  = v_user
       and status   = 'active'
       and role     = 'admin'
  ) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  delete from house_llm_credentials where house_id = p_house_id;
end;
$fn$ language plpgsql security definer set search_path = public;

-- Both functions check admin internally and are meant to be called by a
-- signed-in admin, so `authenticated` keeps its grant. What is revoked is the
-- anonymous role: an unauthenticated caller has no business reaching them even
-- to be refused.
revoke execute on function set_house_llm_credential(
  uuid, text, text, text, bytea, bytea, bytea, text, integer,
  llm_credential_status, timestamptz
) from anon;

revoke execute on function delete_house_llm_credential(uuid) from anon;

-- ---------------------------------------------------------------------------
-- N-31 — the one notification this phase adds
-- ---------------------------------------------------------------------------
--
-- Section 3.6: an admin is told once, in app, when the house's key moves to
-- `disabled`, and never more than once per replacement. It is addressed to
-- admins only because a rejected credential is an administrative fact rather
-- than house news, and it deduplicates on the tag like everything else.

insert into notification_types
  (type, category, priority, quiet_hours_exempt, label, title_template, body_template, deep_link_template)
values
  ('N-31', 'house_activity', 5, false, 'The house AI key was rejected',
   'The AI key was rejected',
   '{provider} refused it. AI features are off until it''s replaced.',
   '/admin/settings/ai');
