-- ---------------------------------------------------------------------------
-- A meal's total is the sum of its four cost components, whoever writes it.
--
-- It was computed in one place: the body of `create_meal`. That was correct for
-- as long as recording a meal was the only way a meal ever changed — which it
-- was, because the food phase shipped with no way to open one again.
--
-- S-45 adds that way. Correcting a mistyped amount is an ordinary UPDATE of
-- `base_cost_paise`, and with the total computed only on insert, such an update
-- left `total_cost_paise` at its old value. A meal edited from ₹150 to ₹200 kept
-- reporting ₹150 to Meal History, to the per-person figure, and to the food
-- library's rolling median of what a dish costs.
--
-- So the invariant moves into the database, where AGENTS.md says an invariant
-- belongs: a service-role key bypasses RLS, and it does not bypass a trigger.
-- `create_meal` still computes the same figure and is now simply agreeing with
-- the trigger rather than being the only thing that knows.
-- ---------------------------------------------------------------------------

create or replace function meals_derive_total()
returns trigger as $$
begin
  new.total_cost_paise :=
      coalesce(new.base_cost_paise, 0)
    + coalesce(new.prep_cost_paise, 0)
    + coalesce(new.delivery_cost_paise, 0)
    + coalesce(new.other_cost_paise, 0);
  return new;
end;
$$ language plpgsql;

comment on function meals_derive_total() is
  'A meal total is the sum of its parts. Enforced here so no writer — a route, '
  'a job, or a service-role key — can state a total that disagrees with them.';

drop trigger if exists meals_total_is_derived on meals;

-- BEFORE, so the computed value is what gets stored rather than something a
-- later trigger has to correct; on INSERT as well as UPDATE, so the one place
-- that used to own this arithmetic is no longer the only one that has it right.
create trigger meals_total_is_derived
  before insert or update on meals
  for each row execute function meals_derive_total();

-- Any row written before this trigger existed whose total drifted from its
-- components. On a database where nothing has ever been edited this updates
-- nothing, which is the expected outcome.
update meals
   set total_cost_paise = coalesce(base_cost_paise, 0)
                        + coalesce(prep_cost_paise, 0)
                        + coalesce(delivery_cost_paise, 0)
                        + coalesce(other_cost_paise, 0)
 where total_cost_paise <> coalesce(base_cost_paise, 0)
                         + coalesce(prep_cost_paise, 0)
                         + coalesce(delivery_cost_paise, 0)
                         + coalesce(other_cost_paise, 0);
