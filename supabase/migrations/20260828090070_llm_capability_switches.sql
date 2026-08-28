-- 070 — The capability switches, reachable from the settings panel
--
-- Source: docs/10-LLM-SPEC.md section 3.6a, AI-02.
--
-- Migration 066 added the column. This makes it readable and writable by the
-- one screen that should touch it, and by nothing else.
--
-- Two halves, and they are asymmetric on purpose:
--
--   * every member may **read** which call sites are on. A capability switch is
--     not a secret — it is the answer to "why did the food card not suggest
--     anything", and a member who cannot see it is left guessing about their
--     own Home.
--   * only an **Admin** may write. It is a spending decision about a key the
--     Home's Admin pasted, and it is Important rather than Critical: turning
--     off a suggestion nobody has to take does not need the Home's
--     acknowledgement, which is why this is a function and not a decision type.

-- ---------------------------------------------------------------------------
-- house_llm_config, restated with the new column
-- ---------------------------------------------------------------------------
-- Whole body restated per D-19. The only change is `capabilities` in the select
-- list; `security_invoker = false` and the `is_house_member` filter inside the
-- body are unchanged, and both still matter for the reason 045 gives — a view
-- over an RLS table with no policy returns nothing under `security_invoker`.
drop view if exists house_llm_config;

create view house_llm_config
  with (security_invoker = false) as
  select house_id, provider, model, base_url, key_last4, status,
         last_verified_at, updated_at, last_error, capabilities
    from house_llm_credentials
   where is_house_member(house_id);

revoke all on house_llm_config from public, anon;
grant select on house_llm_config to authenticated;

-- ---------------------------------------------------------------------------
-- set_llm_capabilities
-- ---------------------------------------------------------------------------
-- `house_llm_credentials` has no policy of any kind and never will (045), so a
-- security-definer function is the only way any column on it moves. This is the
-- second such function, beside `set_house_llm_credential`, and it is separate
-- from it because switching a call site off must never require re-pasting a
-- key.
--
-- The incoming object is merged rather than replacing what is stored: a panel
-- that sends five switches because it was written before the sixth call site
-- existed should turn five switches, not silently disable the one it has never
-- heard of. `||` on jsonb is a right-biased merge, which is exactly that.
create or replace function set_llm_capabilities(
  p_house_id     uuid,
  p_capabilities jsonb
) returns jsonb as $$
declare
  v_capabilities jsonb;
begin
  if not is_house_admin(p_house_id) then
    raise exception 'ADMIN_REQUIRED' using errcode = 'insufficient_privilege';
  end if;

  if p_capabilities is null or jsonb_typeof(p_capabilities) <> 'object' then
    raise exception 'CAPABILITIES_INVALID' using errcode = 'invalid_parameter_value';
  end if;

  -- The check constraint from 066 refuses an unknown key or a non-boolean, so
  -- a typo is a failed request rather than a call site quietly switched off.
  update house_llm_credentials
     set capabilities = capabilities || p_capabilities,
         updated_at   = now()
   where house_id = p_house_id
  returning capabilities into v_capabilities;

  if v_capabilities is null then
    -- No key configured. There is nothing to switch, and saying so is better
    -- than writing a row of switches for a credential that does not exist.
    raise exception 'AI_DISABLED' using errcode = 'no_data_found';
  end if;

  return v_capabilities;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function set_llm_capabilities(uuid, jsonb) from public, anon;
grant  execute on function set_llm_capabilities(uuid, jsonb) to authenticated;
