-- 020 — Fix assert_period_open silently cancelling deletes
--
-- The trigger is BEFORE INSERT OR UPDATE OR DELETE and returned `new`. On a
-- DELETE, `new` is NULL, and a BEFORE-row trigger that returns NULL cancels the
-- operation. So deleting an expense reported success and deleted nothing —
-- worse than an error, because the caller is told it worked.
--
-- It went unnoticed because the app never deletes an expense: BR-091 voids
-- them, which is an UPDATE. It surfaced when tearing down test data, and it
-- would have surfaced in production the first time a house was removed.
--
-- The status check itself was right and is unchanged.

create or replace function assert_period_open() returns trigger as $$
declare v_status period_status;
begin
  select status into v_status from monthly_periods
   where id = case when tg_op = 'DELETE' then old.period_id else new.period_id end;

  if v_status = 'closed' then
    raise exception 'PERIOD_CLOSED' using errcode = 'check_violation';
  end if;

  -- A BEFORE-row trigger must return OLD on delete; returning NULL would
  -- silently swallow the row it was asked to remove.
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$ language plpgsql;

-- Removing a house should take its ledger with it. The period reference was the
-- one link in that chain without a cascade, so `delete from houses` failed on a
-- foreign key rather than cleaning up. Every other rule about not deleting
-- history still stands — this only decides what happens when the house itself
-- goes, which is the one case where nothing is left to preserve.
alter table expenses drop constraint expenses_period_id_fkey;
alter table expenses add constraint expenses_period_id_fkey
  foreign key (period_id) references monthly_periods(id) on delete cascade;
