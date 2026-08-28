-- 084 — 081 reopened the hole 080 closed.
--
-- 20260828090081_food.sql ends with:
--   alter default privileges in schema public
--     grant execute on functions to anon, authenticated, service_role;
-- which overwrites 080's guard of the same shape (revoke, not grant). The
-- live default ACL for role `postgres` on functions in `public` is now
-- `{postgres=X,anon=X,authenticated=X,service_role=X}` — every function
-- created from here on defaults to browser-executable again, silently,
-- which is exactly the recurrence 080 said it was closing off. This
-- migration restates 080's revoke so it is the one that wins.
--
-- create_meal and compute_meal_shares (081) and the food_restrictions
-- functions (082) are unaffected: each was granted execute explicitly by
-- name in its own migration, independent of the default.

alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;
