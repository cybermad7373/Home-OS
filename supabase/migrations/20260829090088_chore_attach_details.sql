-- Phase 14 — CE-12 / S-12: the photo and the note are attached after the tap,
-- never before it. mark_chore_done already never gates on either; this is the
-- follow-up call the detail sheet's "Add photo or note" control makes, open
-- for as long as the instance has not moved past done_pending.
alter table chore_assignments
  add column note text check (char_length(note) <= 500);

create or replace function attach_chore_details(
  p_assignment_id uuid,
  p_photo_url text default null,
  p_note text default null
)
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

  select * into v_assignee from house_members where id = v_assignment.assignee_member_id;

  -- The assignee, or — where the assignee is a dependent with no account of
  -- their own — the guardian who marked it done for them (migration 039).
  if v_assignment.assignee_member_id is distinct from v_me.id
     and not (
       v_assignee.member_kind = 'dependent'
       and v_assignee.guardian_member_id = v_me.id
     )
  then
    raise exception 'NOT_ASSIGNEE' using errcode = 'insufficient_privilege';
  end if;

  if v_assignment.status not in ('assigned', 'done_pending') then
    raise exception 'WRONG_STATE' using errcode = 'check_violation';
  end if;

  update chore_assignments a
     set photo_url = coalesce(p_photo_url, a.photo_url),
         note      = coalesce(p_note, a.note)
   where a.id = p_assignment_id;

  return v_assignment.status;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function attach_chore_details(uuid, text, text) from public;
grant execute on function attach_chore_details(uuid, text, text) to authenticated;
