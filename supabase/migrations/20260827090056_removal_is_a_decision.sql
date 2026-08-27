-- ---------------------------------------------------------------------------
-- 056 — removal is a decision, and only a decision
-- ---------------------------------------------------------------------------
-- Migration 050 shipped `remove_member(uuid)` as the wrapper a person reached,
-- with its own Admin check, and said in its own comment that phase 11 would
-- drop it once the route became a proposer. This is that migration.
--
-- What is left afterwards is one door. `begin_member_removal` is granted to no
-- role at all, so its only callers are `apply_decision_effect` — reached when
-- the Home has answered a `remove_member` decision — and the daily
-- `complete_pending_removals` job. There is no statement an authenticated
-- client can send that removes a member on one person's say-so, which is
-- BR-165 held by the database rather than by the handler that used to ask.
--
-- The two-state removal itself does not change (D-45): whether it finishes
-- today or waits on money is still `begin_member_removal`'s decision, taken at
-- apply time.

drop function if exists remove_member(uuid);

-- ---------------------------------------------------------------------------
-- The second door: `update house_members set status = 'inactive'`
-- ---------------------------------------------------------------------------
-- Dropping the function alone would not have been enough. The privilege
-- trigger from 050 lets an Admin write `status` and `left_date` directly, and
-- the RLS policy from 048 lets a lead update member rows, so an Admin holding
-- nothing but a PostgREST client could still deactivate somebody without
-- asking anybody. That is exactly the thing BR-165 forbids, and it is worth
-- more in the database than in the handler that no longer offers it.
--
-- Whole body restated per D-19. One rule is added: an **adult** member's
-- `status` and `left_date` may only be written by something holding the
-- authorisation flag — a decision effect, or the removal job that finishes
-- what a decision started.
--
-- Dependents are deliberately left on the Admin path. A dependent has no
-- account, no voice and no vote; "remove the child who moved out" is an
-- administrative correction, not a decision the Home takes together (spec
-- 3.3, and `DELETE /api/members/dependents/:id` which does exactly this).
create or replace function assert_member_field_privilege() returns trigger as $$
begin
  if coalesce(current_setting('app.member_write_authorised', true), 'off') <> 'on' then
    if (new.role      is distinct from old.role
        or new.status    is distinct from old.status
        or new.left_date is distinct from old.left_date)
       and not is_house_admin(old.house_id) then
      raise exception 'ADMIN_REQUIRED' using errcode = 'insufficient_privilege';
    end if;

    -- New in 056. Being an Admin is no longer enough to end an adult's
    -- membership: `remove_member` is a Critical decision and its effect is the
    -- only authorised writer.
    if old.member_kind = 'adult'
       and (new.status    is distinct from old.status
            or new.left_date is distinct from old.left_date) then
      raise exception 'DECISION_REQUIRED' using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- The last-Admin guard holds on every path, authorised or not. A Home with
  -- no Admin cannot change its own settings, and no decision should be able to
  -- produce that state either.
  if old.role = 'admin' and old.status = 'active'
     and not (new.role = 'admin' and new.status = 'active')
     and not exists (
       select 1 from house_members other
        where other.house_id = old.house_id
          and other.id      <> old.id
          and other.role     = 'admin'
          and other.status   = 'active'
     ) then
    raise exception 'LAST_ADMIN' using errcode = 'check_violation';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;
