-- 012 — Views for the read paths (phase 1 subset)
-- Source: docs/04-DATABASE.md section 8.
--
-- `security_invoker` makes the view obey the caller's RLS policies rather than
-- the owner's. Without it a view is a hole straight through house isolation.

create view v_current_occupancy
with (security_invoker = true) as
select ra.house_id, ra.room_id, r.name as room_name, r.capacity,
       r.monthly_rent_paise, ra.member_id, u.display_name
  from room_assignments ra
  join rooms r         on r.id = ra.room_id
  join house_members m on m.id = ra.member_id
  join users u         on u.id = m.user_id
 where ra.to_date is null and m.status = 'active';
