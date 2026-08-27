-- 017 — Expense functions
--
-- An expense and its splits must be written in one transaction: the deferred
-- sum trigger checks them together at commit, and a half-written expense would
-- corrupt every balance derived from it. PostgREST cannot span two tables in
-- one transaction, so the write lives here.
--
-- The split arithmetic itself is NOT here. It is a pure TypeScript function in
-- lib/domain/expenses/split.ts, unit tested without a database, and the shares
-- arrive already computed. This function's job is to store them atomically and
-- let the database prove they add up.

-- BR-100 — a period is created lazily, on the first expense dated within it.
create or replace function ensure_period(p_house_id uuid, p_period text)
returns uuid as $$
declare v_id uuid;
begin
  select id into v_id from monthly_periods
   where house_id = p_house_id and period = p_period;

  if v_id is null then
    insert into monthly_periods (house_id, period)
    values (p_house_id, p_period)
    on conflict (house_id, period) do nothing
    returning id into v_id;

    if v_id is null then          -- somebody else opened it in the same instant
      select id into v_id from monthly_periods
       where house_id = p_house_id and period = p_period;
    end if;
  end if;

  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

-- The caller's active membership. Every expense write is scoped by it, so the
-- house is never taken from the request body.
create or replace function current_member(p_house_id uuid default null)
returns house_members as $$
  select * from house_members
   where user_id = auth.uid()
     and status  = 'active'
     and (p_house_id is null or house_id = p_house_id)
   order by joined_date desc
   limit 1;
$$ language sql security definer stable set search_path = public;

/**
 * Creates an expense with its splits.
 *
 * p_splits is [{ member_id, share_paise, guest_share_paise, basis_note }].
 * The shares are trusted to be arithmetically correct only in the sense that
 * the deferred trigger will reject them at commit if they are not.
 */
create or replace function create_expense(
  p_category_id     uuid,
  p_amount_paise    bigint,
  p_expense_date    date,
  p_split_basis     split_basis,
  p_splits          jsonb,
  p_description     text default null,
  p_paid_by_member_id uuid default null,
  p_receipt_url     text default null,
  p_period          text default null,
  p_is_adjustment   boolean default false,
  p_adjustment_for_period text default null,
  p_recurring_id    uuid default null
) returns uuid as $$
declare
  v_me         house_members;
  v_house_id   uuid;
  v_payer_id   uuid;
  v_period     text;
  v_period_id  uuid;
  v_threshold  bigint;
  v_status     expense_status;
  v_expense_id uuid;
begin
  v_me := current_member();
  if v_me.id is null then
    raise exception 'NOT_HOUSE_MEMBER' using errcode = 'insufficient_privilege';
  end if;

  v_house_id := v_me.house_id;
  v_payer_id := coalesce(p_paid_by_member_id, v_me.id);

  -- BR-083 — the payer must be a member of this house.
  if not exists (select 1 from house_members
                  where id = v_payer_id and house_id = v_house_id) then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  if not exists (select 1 from expense_categories
                  where id = p_category_id and house_id = v_house_id) then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  -- An adjustment posts into the current open month; everything else posts into
  -- the month its date falls in.
  v_period    := coalesce(p_period, to_char(p_expense_date, 'YYYY-MM'));
  v_period_id := ensure_period(v_house_id, v_period);

  if (select status from monthly_periods where id = v_period_id) = 'closed' then
    raise exception 'PERIOD_CLOSED' using errcode = 'check_violation';
  end if;

  -- BR-084 — above the threshold it waits for somebody else to approve it.
  select expense_approval_threshold_paise into v_threshold
    from house_settings where house_id = v_house_id;

  v_status := case
    when p_amount_paise > coalesce(v_threshold, 0) then 'pending_approval'::expense_status
    else 'approved'::expense_status
  end;

  insert into expenses (
    house_id, period_id, paid_by_member_id, category_id, amount_paise,
    description, expense_date, split_basis, status, receipt_url,
    is_adjustment, adjustment_for_period, recurring_id, created_by
  ) values (
    v_house_id, v_period_id, v_payer_id, p_category_id, p_amount_paise,
    nullif(trim(coalesce(p_description, '')), ''), p_expense_date, p_split_basis,
    v_status, nullif(trim(coalesce(p_receipt_url, '')), ''),
    p_is_adjustment, p_adjustment_for_period, p_recurring_id, v_me.id
  )
  returning id into v_expense_id;

  insert into expense_splits (house_id, expense_id, member_id, share_paise,
                              guest_share_paise, basis_note)
  select v_house_id,
         v_expense_id,
         (row ->> 'member_id')::uuid,
         (row ->> 'share_paise')::bigint,
         coalesce((row ->> 'guest_share_paise')::bigint, 0),
         row ->> 'basis_note'
    from jsonb_array_elements(p_splits) as row;

  return v_expense_id;
end;
$$ language plpgsql security definer set search_path = public;

/**
 * Replaces an expense's splits — used when its amount, date or basis changes
 * (BR-089). Delete and insert inside one transaction, so the deferred trigger
 * sees only the final state.
 */
create or replace function replace_expense_splits(p_expense_id uuid, p_splits jsonb)
returns void as $$
declare
  v_expense expenses;
  v_me      house_members;
begin
  select * into v_expense from expenses where id = p_expense_id;
  if v_expense.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  v_me := current_member(v_expense.house_id);
  if v_me.id is null then
    raise exception 'NOT_HOUSE_MEMBER' using errcode = 'insufficient_privilege';
  end if;
  if v_me.role <> 'admin' and v_expense.paid_by_member_id <> v_me.id then
    raise exception 'NOT_YOUR_RECORD' using errcode = 'insufficient_privilege';
  end if;

  delete from expense_splits where expense_id = p_expense_id;

  insert into expense_splits (house_id, expense_id, member_id, share_paise,
                              guest_share_paise, basis_note)
  select v_expense.house_id,
         p_expense_id,
         (row ->> 'member_id')::uuid,
         (row ->> 'share_paise')::bigint,
         coalesce((row ->> 'guest_share_paise')::bigint, 0),
         row ->> 'basis_note'
    from jsonb_array_elements(p_splits) as row;
end;
$$ language plpgsql security definer set search_path = public;

/**
 * BR-086 — one approval is sufficient. BR-085 — never your own.
 *
 * The self-approval ban is a check constraint on the table; this raises the
 * friendlier error before the constraint has to.
 */
create or replace function approve_expense(p_expense_id uuid, p_approve boolean,
                                           p_reason text default null)
returns expense_status as $$
declare
  v_expense expenses;
  v_me      house_members;
begin
  select * into v_expense from expenses where id = p_expense_id;
  if v_expense.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  v_me := current_member(v_expense.house_id);
  if v_me.id is null then
    raise exception 'NOT_HOUSE_MEMBER' using errcode = 'insufficient_privilege';
  end if;
  if v_me.id = v_expense.paid_by_member_id then
    raise exception 'SELF_APPROVAL' using errcode = 'check_violation';
  end if;
  if v_expense.status <> 'pending_approval' then
    raise exception 'ALREADY_RESOLVED' using errcode = 'check_violation';
  end if;

  update expenses
     set status           = case when p_approve then 'approved' else 'rejected' end,
         approved_by      = v_me.id,
         approved_at      = now(),
         rejection_reason = case when p_approve then null else p_reason end
   where id = p_expense_id;

  return case when p_approve then 'approved' else 'rejected' end::expense_status;
end;
$$ language plpgsql security definer set search_path = public;

/** BR-091 — voiding needs a reason and keeps the record. */
create or replace function void_expense(p_expense_id uuid, p_reason text)
returns void as $$
declare
  v_expense expenses;
  v_me      house_members;
begin
  select * into v_expense from expenses where id = p_expense_id;
  if v_expense.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  v_me := current_member(v_expense.house_id);
  if v_me.id is null then
    raise exception 'NOT_HOUSE_MEMBER' using errcode = 'insufficient_privilege';
  end if;
  if v_me.role <> 'admin' and v_expense.paid_by_member_id <> v_me.id then
    raise exception 'NOT_YOUR_RECORD' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'REASON_REQUIRED' using errcode = 'check_violation';
  end if;

  -- The splits go with it: a void expense must not weigh on anybody's balance.
  delete from expense_splits where expense_id = p_expense_id;

  update expenses
     set status = 'void', rejection_reason = p_reason
   where id = p_expense_id;
end;
$$ language plpgsql security definer set search_path = public;

-- Default categories, created with the house so that logging works before any
-- configuration (docs/09-BUSINESS-RULES.md section 5).
create or replace function seed_default_categories(p_house_id uuid) returns void as $$
  insert into expense_categories (house_id, name, icon)
  values
    (p_house_id, 'Groceries',  '🥬'),
    (p_house_id, 'Rent',       '🏠'),
    (p_house_id, 'Utilities',  '⚡'),
    (p_house_id, 'Gas',        '🔥'),
    (p_house_id, 'Internet',   '📶'),
    (p_house_id, 'Maid',       '🧹'),
    (p_house_id, 'Eating out', '🍽'),
    (p_house_id, 'Household',  '🧺'),
    (p_house_id, 'Other',      '📦')
  on conflict (house_id, name) do nothing;
$$ language sql security definer set search_path = public;

-- House creation now seeds them too.
create or replace function create_house(
  p_name     text,
  p_address  text default null,
  p_timezone text default 'Asia/Kolkata',
  p_currency text default 'INR'
) returns table (house_id uuid, invite_code text) as $$
declare
  v_user_id uuid := auth.uid();
  v_house   houses%rowtype;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = 'insufficient_privilege';
  end if;

  insert into houses (name, address, timezone, currency, invite_code, created_by)
  values (trim(p_name), nullif(trim(coalesce(p_address, '')), ''),
          p_timezone, p_currency, generate_invite_code(), v_user_id)
  returning * into v_house;

  insert into house_settings (house_id) values (v_house.id);

  insert into house_members (house_id, user_id, role, status)
  values (v_house.id, v_user_id, 'admin', 'active');

  perform seed_default_categories(v_house.id);

  return query select v_house.id, v_house.invite_code;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function ensure_period(uuid, text)                 to authenticated;
grant execute on function current_member(uuid)                      to authenticated;
grant execute on function create_expense(uuid, bigint, date, split_basis, jsonb,
                                         text, uuid, text, text, boolean, text, uuid)
                                                                    to authenticated;
grant execute on function replace_expense_splits(uuid, jsonb)       to authenticated;
grant execute on function approve_expense(uuid, boolean, text)      to authenticated;
grant execute on function void_expense(uuid, text)                  to authenticated;
grant execute on function create_house(text, text, text, text)      to authenticated;
revoke execute on function seed_default_categories(uuid) from anon, authenticated;
