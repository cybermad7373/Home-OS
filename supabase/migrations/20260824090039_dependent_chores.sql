-- 039 — A dependent's chore can actually be completed
--
-- A dependent has no login. Giving them work and then requiring the assignee's
-- own account to mark it done leaves that work stuck at 'assigned' until it is
-- marked missed — the schedule would quietly count a child's chore against the
-- house every single week.
--
-- Their guardian marks it. That is what happens in the room anyway: the parent
-- who told the child to make the bed is the one who sees it made.

create or replace function mark_chore_done(p_assignment_id uuid, p_photo_url text default null)
returns assignment_status as $$
declare
  v_assignment chore_assignments;
  v_me         house_members;
  v_assignee   house_members;
begin
  select a.* into v_assignment from chore_assignments a where a.id = p_assignment_id;
  if v_assignment.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  v_me := current_member(v_assignment.house_id);
  if v_me.id is null then
    raise exception 'NOT_HOUSE_MEMBER' using errcode = 'insufficient_privilege';
  end if;

  select * into v_assignee from house_members
   where id = v_assignment.assignee_member_id;

  -- The assignee, or — where the assignee is a dependent with no account of
  -- their own — the person responsible for them.
  if v_assignment.assignee_member_id is distinct from v_me.id
     and not (
       v_assignee.member_kind = 'dependent'
       and v_assignee.guardian_member_id = v_me.id
     )
  then
    raise exception 'NOT_ASSIGNEE' using errcode = 'insufficient_privilege';
  end if;

  if v_assignment.status not in ('assigned', 'rejected') then
    raise exception 'WRONG_STATE' using errcode = 'check_violation';
  end if;

  update chore_assignments a
     set status    = 'done_pending',
         done_at   = now(),
         photo_url = coalesce(p_photo_url, a.photo_url)
   where a.id = p_assignment_id;

  return 'done_pending'::assignment_status;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function mark_chore_done(uuid, text) to authenticated;

-- A guardian who marks their dependent's chore done must not then confirm it
-- themselves. `no_self_confirm` on the table only stops the assignee, and the
-- assignee here is a child who will never press anything. Without this, a
-- parent could mark and confirm in two taps and the peer check would mean
-- nothing for any work routed through a dependent.
create or replace function confirm_chore(p_assignment_id uuid)
returns assignment_status as $$
declare
  v_assignment chore_assignments;
  v_me         house_members;
  v_assignee   house_members;
begin
  select a.* into v_assignment from chore_assignments a where a.id = p_assignment_id;
  if v_assignment.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  v_me := current_member(v_assignment.house_id);
  if v_me.id is null then
    raise exception 'NOT_HOUSE_MEMBER' using errcode = 'insufficient_privilege';
  end if;
  if v_assignment.status <> 'done_pending' then
    raise exception 'WRONG_STATE' using errcode = 'check_violation';
  end if;
  if v_assignment.assignee_member_id = v_me.id then
    raise exception 'SELF_CONFIRM' using errcode = 'check_violation';
  end if;

  select * into v_assignee from house_members
   where id = v_assignment.assignee_member_id;

  if v_assignee.member_kind = 'dependent'
     and v_assignee.guardian_member_id = v_me.id then
    raise exception 'SELF_CONFIRM' using errcode = 'check_violation';
  end if;

  update chore_assignments a
     set status       = 'confirmed',
         confirmed_at = now(),
         confirmed_by = v_me.id
   where a.id = p_assignment_id;

  return 'confirmed'::assignment_status;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function confirm_chore(uuid) to authenticated;
