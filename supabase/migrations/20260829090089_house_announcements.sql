-- 089 — House announcements (BR-260, BR-261; docs/08-UI-UX-SPEC.md S-50)
--
-- The Today screen's fifth block. A broadcast from a lead to the Home, with a
-- severity and an expiry, shown above the calendar link and below Food.
--
-- Two invariants live here rather than only in the route handler, because a
-- service-role key bypasses RLS and does not bypass a constraint:
--
--   * only a lead may write one (BR-260) — the insert policy names
--     `is_house_lead`, and the author must be the caller's own member row, so a
--     lead cannot post one under somebody else's name;
--   * an announcement always has an end (BR-261) — `expires_at` is not
--     nullable, and it must be later than the moment it was written. An
--     announcement with no expiry is a notice board, and a notice board is what
--     this is deliberately not.
--
-- The second constraint holds on update as well as on insert, so an expiry
-- cannot be back-dated. That is wanted: the two ways an announcement ends are
-- reaching its expiry and being taken down, and rewriting history so that it
-- "was never shown" is neither.

create table house_announcements (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references houses(id) on delete cascade,
  author_member_id uuid not null references house_members(id),
  title text not null,
  body text not null,
  -- Kept as text with a check rather than an enum, matching the schema in
  -- docs/04-DATABASE.md section 4: three values that the interface maps to a
  -- tone, with no behaviour keyed on them in SQL.
  severity text not null default 'info',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint announcement_severity_known
    check (severity in ('info', 'important', 'urgent')),
  constraint announcement_title_not_blank check (length(trim(title)) > 0),
  constraint announcement_title_length check (char_length(title) <= 120),
  constraint announcement_body_length check (char_length(body) <= 1000),
  constraint announcement_expires_in_the_future check (expires_at > created_at)
);

-- The only read the product ever makes: this Home's announcements that have not
-- expired, newest first.
create index house_announcements_live_idx
  on house_announcements (house_id, expires_at desc);

alter table house_announcements enable row level security;

-- Everybody in the Home reads them. That is the point of a broadcast.
create policy "announcements_read" on house_announcements
  for select to authenticated
  using (is_house_member(house_id));

-- BR-260 — Admins and Co-Admins only, and only as themselves.
create policy "announcements_insert" on house_announcements
  for insert to authenticated
  with check (
    is_house_lead(house_id)
    and author_member_id = (current_member(house_id)).id
  );

create policy "announcements_update" on house_announcements
  for update to authenticated
  using (is_house_lead(house_id))
  with check (is_house_lead(house_id));

-- Taking one down early is the same privilege as putting it up. Expiry is the
-- ordinary way one ends; this is for the one posted by mistake.
create policy "announcements_delete" on house_announcements
  for delete to authenticated
  using (is_house_lead(house_id));
