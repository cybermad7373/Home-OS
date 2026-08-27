-- 023 — Closing, settling and reopening a month
--
-- The arithmetic is not here. Balances and the payment list are computed by
-- pure TypeScript in lib/domain/settlement/netting.ts, property-tested without
-- a database, and arrive already worked out. These functions store the result
-- atomically and enforce the rules about who may do what, and when.

/**
 * Everything the close needs to know before it is allowed to run:
 * how many approvals are outstanding, and whether the month has ended.
 */
create or replace function period_close_readiness(p_period_id uuid)
returns table (pending_approvals integer, month_ended boolean, status period_status) as $$
declare
  v_period monthly_periods;
  v_tz     text;
  v_today  date;
begin
  select * into v_period from monthly_periods where id = p_period_id;
  if v_period.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  select timezone into v_tz from houses where id = v_period.house_id;
  v_today := (now() at time zone coalesce(v_tz, 'UTC'))::date;

  return query
  select
    (select count(*)::integer from expenses
      where period_id = p_period_id and status = 'pending_approval'),
    -- BR-103: the month's last day must have passed.
    v_today > (to_date(v_period.period || '-01', 'YYYY-MM-DD')
               + interval '1 month' - interval '1 day')::date,
    v_period.status;
end;
$$ language plpgsql security definer set search_path = public;

/**
 * Closes a period: stores the computed balances, stores the payment list, and
 * moves the period to `closing`.
 *
 * p_balances is [{ member_id, total_paid_paise, fair_share_paise,
 *                  expense_net_paise, penalty_owed_paise,
 *                  penalty_credit_paise, final_net_paise }]
 * p_settlements is [{ from_member_id, to_member_id, amount_paise, upi_link }]
 *
 * BR-107 is asserted here as well as in the caller: if the stored final nets do
 * not sum to zero, the whole close is rolled back. A settlement that does not
 * net to zero is worse than none, because it looks authoritative.
 */
create or replace function close_period(
  p_period_id   uuid,
  p_balances    jsonb,
  p_settlements jsonb
) returns period_status as $$
declare
  v_period    monthly_periods;
  v_me        house_members;
  v_pending   integer;
  v_month_end boolean;
  v_sum       bigint;
  v_total     bigint;
begin
  select * into v_period from monthly_periods where id = p_period_id;
  if v_period.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  v_me := current_member(v_period.house_id);
  if v_me.id is null or v_me.role <> 'admin' then
    raise exception 'ADMIN_REQUIRED' using errcode = 'insufficient_privilege';
  end if;

  if v_period.status = 'closed' then
    raise exception 'PERIOD_CLOSED' using errcode = 'check_violation';
  end if;

  -- BR-102 — nothing may be pending. An unapproved expense that lands after the
  -- close would have nowhere to go.
  select count(*) into v_pending from expenses
   where period_id = p_period_id and status = 'pending_approval';
  if v_pending > 0 then
    raise exception 'APPROVALS_PENDING' using errcode = 'check_violation';
  end if;

  select month_ended into v_month_end from period_close_readiness(p_period_id);
  if not v_month_end then
    raise exception 'MONTH_NOT_ENDED' using errcode = 'check_violation';
  end if;

  -- BR-107 — the invariant, checked against what is about to be stored.
  select coalesce(sum((row ->> 'final_net_paise')::bigint), 0) into v_sum
    from jsonb_array_elements(p_balances) as row;
  if v_sum <> 0 then
    raise exception 'NETS_NONZERO: %', v_sum using errcode = 'check_violation';
  end if;

  delete from member_period_balances where period_id = p_period_id;
  delete from settlements where period_id = p_period_id and status = 'pending';

  insert into member_period_balances (
    house_id, period_id, member_id, total_paid_paise, fair_share_paise,
    expense_net_paise, penalty_owed_paise, penalty_credit_paise, final_net_paise
  )
  select v_period.house_id, p_period_id,
         (row ->> 'member_id')::uuid,
         (row ->> 'total_paid_paise')::bigint,
         (row ->> 'fair_share_paise')::bigint,
         (row ->> 'expense_net_paise')::bigint,
         coalesce((row ->> 'penalty_owed_paise')::bigint, 0),
         coalesce((row ->> 'penalty_credit_paise')::bigint, 0),
         (row ->> 'final_net_paise')::bigint
    from jsonb_array_elements(p_balances) as row;

  insert into settlements (house_id, period_id, from_member_id, to_member_id,
                           amount_paise, upi_link)
  select v_period.house_id, p_period_id,
         (row ->> 'from_member_id')::uuid,
         (row ->> 'to_member_id')::uuid,
         (row ->> 'amount_paise')::bigint,
         row ->> 'upi_link'
    from jsonb_array_elements(p_settlements) as row;

  select coalesce(sum(amount_paise), 0) into v_total
    from expenses where period_id = p_period_id and status = 'approved';

  update monthly_periods
     set status              = 'closing',
         total_expense_paise = v_total,
         closed_by           = v_me.id,
         closed_at           = now()
   where id = p_period_id;

  return 'closing'::period_status;
end;
$$ language plpgsql security definer set search_path = public;

/**
 * BR-109, BR-110 — the payer asserts payment and may take the assertion back
 * until the receiver confirms. The app never decides this for itself; it has no
 * way to know whether money moved.
 */
create or replace function mark_settlement_paid(p_settlement_id uuid, p_paid boolean)
returns settlement_status as $$
declare
  v_settlement settlements;
  v_me         house_members;
begin
  select * into v_settlement from settlements where id = p_settlement_id;
  if v_settlement.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  v_me := current_member(v_settlement.house_id);
  if v_me.id is null then
    raise exception 'NOT_HOUSE_MEMBER' using errcode = 'insufficient_privilege';
  end if;
  if v_me.id <> v_settlement.from_member_id then
    raise exception 'NOT_THE_PAYER' using errcode = 'insufficient_privilege';
  end if;
  -- BR-111 — a confirmed settlement is final.
  if v_settlement.status = 'confirmed' then
    raise exception 'ALREADY_CONFIRMED' using errcode = 'check_violation';
  end if;

  update settlements
     set status         = case when p_paid then 'marked_paid' else 'pending' end,
         marked_paid_at = case when p_paid then now() else null end
   where id = p_settlement_id;

  return case when p_paid then 'marked_paid' else 'pending' end::settlement_status;
end;
$$ language plpgsql security definer set search_path = public;

/**
 * BR-105 — the receiver confirms, and when the last settlement in the period is
 * confirmed the period moves from `closing` to `closed` and locks.
 */
create or replace function confirm_settlement(p_settlement_id uuid)
returns table (status settlement_status, period_locked boolean) as $$
declare
  v_settlement settlements;
  v_me         house_members;
  v_remaining  integer;
  v_locked     boolean := false;
begin
  select * into v_settlement from settlements where id = p_settlement_id;
  if v_settlement.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  v_me := current_member(v_settlement.house_id);
  if v_me.id is null then
    raise exception 'NOT_HOUSE_MEMBER' using errcode = 'insufficient_privilege';
  end if;
  if v_me.id <> v_settlement.to_member_id then
    raise exception 'NOT_THE_PAYEE' using errcode = 'insufficient_privilege';
  end if;

  update settlements
     set status = 'confirmed', confirmed_at = now()
   where id = p_settlement_id;

  select count(*) into v_remaining from settlements
   where period_id = v_settlement.period_id and status <> 'confirmed';

  if v_remaining = 0 then
    update monthly_periods
       set status = 'closed', locked_at = now()
     where id = v_settlement.period_id;
    v_locked := true;
  end if;

  return query select 'confirmed'::settlement_status, v_locked;
end;
$$ language plpgsql security definer set search_path = public;

/**
 * BR-112, BR-113 — reopening.
 *
 * Reopening a settled month reopens the argument that closing it ended, so it
 * is an explicit admin act, it is counted, and it does not throw away what was
 * already paid: the caller computes *delta* settlements — the difference from
 * what each member has already settled — rather than a fresh full set.
 */
create or replace function reopen_period(p_period_id uuid, p_reason text)
returns period_status as $$
declare
  v_period monthly_periods;
  v_me     house_members;
begin
  select * into v_period from monthly_periods where id = p_period_id;
  if v_period.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  v_me := current_member(v_period.house_id);
  if v_me.id is null or v_me.role <> 'admin' then
    raise exception 'ADMIN_REQUIRED' using errcode = 'insufficient_privilege';
  end if;
  if v_period.status = 'open' then
    raise exception 'PERIOD_ALREADY_OPEN' using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'REASON_REQUIRED' using errcode = 'check_violation';
  end if;

  update monthly_periods
     set status       = 'reopened',
         reopen_count = reopen_count + 1,
         locked_at    = null
   where id = p_period_id;

  return 'reopened'::period_status;
end;
$$ language plpgsql security definer set search_path = public;

/**
 * BR-114, BR-115 — a late expense against a closed month, carried forward.
 *
 * It lands in the current open period tagged as an adjustment, but its splits
 * are computed against the household as it stood on the original date. Somebody
 * who moved out in July still owes their share of a July expense found in
 * August. The caller supplies those splits, computed by the same pure function
 * as every other split.
 */
create or replace function carry_forward_expense(
  p_category_id  uuid,
  p_amount_paise bigint,
  p_expense_date date,
  p_split_basis  split_basis,
  p_splits       jsonb,
  p_description  text default null,
  p_paid_by_member_id uuid default null,
  p_receipt_url  text default null
) returns uuid as $$
declare
  v_me     house_members;
  v_period text;
begin
  v_me := current_member();
  if v_me.id is null then
    raise exception 'NOT_HOUSE_MEMBER' using errcode = 'insufficient_privilege';
  end if;

  -- The current month, in the house's timezone, is where it posts.
  select to_char((now() at time zone h.timezone)::date, 'YYYY-MM') into v_period
    from houses h where h.id = v_me.house_id;

  return create_expense(
    p_category_id, p_amount_paise, p_expense_date, p_split_basis, p_splits,
    p_description, p_paid_by_member_id, p_receipt_url,
    v_period, true, to_char(p_expense_date, 'YYYY-MM'), null
  );
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function period_close_readiness(uuid)                to authenticated;
grant execute on function close_period(uuid, jsonb, jsonb)            to authenticated;
grant execute on function mark_settlement_paid(uuid, boolean)         to authenticated;
grant execute on function confirm_settlement(uuid)                    to authenticated;
grant execute on function reopen_period(uuid, text)                   to authenticated;
grant execute on function carry_forward_expense(uuid, bigint, date, split_basis, jsonb,
                                                text, uuid, text)     to authenticated;
