-- 030 — Fix three UPDATEs that could never have worked
--
-- `set status = case when x then 'a' else 'b' end` does not compile against an
-- enum column. A bare string literal has type `unknown` and Postgres coerces it
-- happily; a CASE over two literals resolves to `text`, and there is no
-- implicit cast from text to an enum. The result is
--
--   42804: column "status" is of type swap_status but expression is of type text
--
-- raised at run time, on the first real use, in three separate functions:
--
--   respond_to_swap      — accepting a swap
--   mark_settlement_paid — the payer asserting they have paid
--   approve_expense      — approving or rejecting an expense
--
-- The last is the one that matters most: approving an expense is a core flow,
-- and it was broken from the moment it shipped. It went unnoticed because the
-- tests around it only proved the refusals — self-approval, wrong state — and
-- never a successful approval. Refusal paths return before the UPDATE, so they
-- passed regardless. Tests that only check that the wrong thing fails do not
-- prove the right thing works.
--
-- Every function is now explicit about the cast, and each has a test that runs
-- the successful path.

create or replace function respond_to_swap(p_swap_id uuid, p_accept boolean)
returns swap_status as $$
declare
  v_swap swap_requests;
  v_me   house_members;
  v_next swap_status;
begin
  select s.* into v_swap from swap_requests s where s.id = p_swap_id;
  if v_swap.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  v_me := current_member(v_swap.house_id);
  if v_me.id is null or v_me.id <> v_swap.to_member_id then
    raise exception 'NOT_YOUR_RECORD' using errcode = 'insufficient_privilege';
  end if;
  if v_swap.status <> 'pending' then
    raise exception 'WRONG_STATE' using errcode = 'check_violation';
  end if;

  -- Resolved into a typed variable first, so the UPDATE assigns an enum rather
  -- than the text a CASE would produce.
  v_next := (case when p_accept then 'accepted' else 'declined' end)::swap_status;

  update swap_requests s
     set status = v_next, responded_at = now()
   where s.id = p_swap_id;

  if p_accept then
    update chore_assignments a
       set assignee_member_id = v_me.id, source = 'swap'
     where a.id = v_swap.assignment_id
       and a.status = 'assigned';
  end if;

  return v_next;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mark_settlement_paid(p_settlement_id uuid, p_paid boolean)
returns settlement_status as $$
declare
  v_settlement settlements;
  v_me         house_members;
  v_next       settlement_status;
begin
  select s.* into v_settlement from settlements s where s.id = p_settlement_id;
  if v_settlement.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  v_me := current_member(v_settlement.house_id);
  if v_me.id is null then
    raise exception 'NOT_HOUSE_MEMBER' using errcode = 'insufficient_privilege';
  end if;
  -- BR-109 — only the payer asserts payment.
  if v_me.id <> v_settlement.from_member_id then
    raise exception 'NOT_THE_PAYER' using errcode = 'insufficient_privilege';
  end if;
  -- BR-111 — a confirmed settlement is final.
  if v_settlement.status = 'confirmed' then
    raise exception 'ALREADY_CONFIRMED' using errcode = 'check_violation';
  end if;

  v_next := (case when p_paid then 'marked_paid' else 'pending' end)::settlement_status;

  update settlements s
     set status         = v_next,
         marked_paid_at = case when p_paid then now() else null end
   where s.id = p_settlement_id;

  return v_next;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function approve_expense(p_expense_id uuid, p_approve boolean,
                                           p_reason text default null)
returns expense_status as $$
declare
  v_expense expenses;
  v_me      house_members;
  v_next    expense_status;
begin
  select e.* into v_expense from expenses e where e.id = p_expense_id;
  if v_expense.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  v_me := current_member(v_expense.house_id);
  if v_me.id is null then
    raise exception 'NOT_HOUSE_MEMBER' using errcode = 'insufficient_privilege';
  end if;
  -- BR-085 — never your own. The check constraint says so too.
  if v_me.id = v_expense.paid_by_member_id then
    raise exception 'SELF_APPROVAL' using errcode = 'check_violation';
  end if;
  if v_expense.status <> 'pending_approval' then
    raise exception 'ALREADY_RESOLVED' using errcode = 'check_violation';
  end if;

  v_next := (case when p_approve then 'approved' else 'rejected' end)::expense_status;

  update expenses e
     set status           = v_next,
         approved_by      = v_me.id,
         approved_at      = now(),
         rejection_reason = case when p_approve then null else p_reason end
   where e.id = p_expense_id;

  return v_next;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function respond_to_swap(uuid, boolean)         to authenticated;
grant execute on function mark_settlement_paid(uuid, boolean)    to authenticated;
grant execute on function approve_expense(uuid, boolean, text)   to authenticated;
