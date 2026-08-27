-- 043 — N-18 tells you your own share
--
-- The approval request said "Your share: ₹—".
--
-- `create_expense` writes the expense row and then the split rows, in one
-- transaction. An ordinary `after insert` trigger on `expenses` fires between
-- the two, so at the moment it ran there was no split to read — the recipient's
-- own share, which is the only figure in that notification they actually need,
-- did not exist yet.
--
-- The fix is to fire at commit instead. A deferred constraint trigger runs
-- after every statement in the transaction has completed, by which time the
-- splits are there. Nothing else about the notification changes.

drop trigger if exists trg_notify_expense_insert on expenses;

create or replace function notify_expense_created() returns trigger as $$
declare
  v_category text;
  v_amount   text;
  v_member   record;
  v_share    bigint;
begin
  if new.status <> 'pending_approval' then
    return null;
  end if;

  select name into v_category from expense_categories where id = new.category_id;
  v_amount := to_char(new.amount_paise / 100.0, 'FM999999990.00');

  for v_member in
    select id from house_members
     where house_id = new.house_id
       and status   = 'active'
       and user_id is not null
       and id <> new.paid_by_member_id
  loop
    -- A member's own share plus whatever a guest or dependent of theirs costs.
    -- Nobody in the house — a housemate with no split row on this expense —
    -- gets a zero, which is the truth rather than a dash.
    select coalesce(share_paise, 0) + coalesce(guest_share_paise, 0)
      into v_share
      from expense_splits
     where expense_id = new.id and member_id = v_member.id;

    perform enqueue_notification(
      new.house_id, v_member.id, 'N-18',
      jsonb_build_object(
        'name', member_display_name(new.paid_by_member_id),
        'amount', v_amount,
        'category', coalesce(v_category, 'Uncategorised'),
        'share', to_char(coalesce(v_share, 0) / 100.0, 'FM999999990.00')),
      'expense-' || new.id::text,
      jsonb_build_object('expense_id', new.id, 'action', 'approve'));
  end loop;

  return null;
end;
$$ language plpgsql security definer set search_path = public;

create constraint trigger trg_notify_expense_created
  after insert on expenses
  deferrable initially deferred
  for each row execute function notify_expense_created();

revoke execute on function notify_expense_created() from public, anon, authenticated;
