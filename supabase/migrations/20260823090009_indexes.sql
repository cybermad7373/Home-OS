-- 009 — Indexes (phase 1 subset)
-- Source: docs/04-DATABASE.md section 5. Indexes for tables introduced in later
-- phases are added by the migration that creates those tables.

create index idx_members_house        on house_members(house_id, status);
create index idx_rooms_house          on rooms(house_id) where deleted_at is null;
create index idx_room_assign_current  on room_assignments(house_id, member_id, from_date desc);
create index idx_room_assign_room     on room_assignments(room_id, from_date, to_date);
