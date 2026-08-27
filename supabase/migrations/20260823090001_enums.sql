-- 001 — Enum types
-- Source: docs/04-DATABASE.md section 3.
-- All domain enums are created up front so later migrations can reference them
-- in any order. Creating them all now (not only the phase-1 ones) costs nothing
-- and keeps this file a faithful copy of the specification.

create type member_role       as enum ('admin', 'member');
create type member_status     as enum ('pending', 'active', 'inactive');
create type residency_type    as enum ('full_time', 'weekday_only', 'weekend_only');

create type chore_category    as enum ('room_cleaning', 'cooking', 'kitchen_cleaning',
                                       'bathroom_cleaning', 'common_cleaning', 'mopping', 'other');
create type chore_slot        as enum ('morning', 'evening', 'any');
create type chore_scope       as enum ('house', 'room');
create type chore_frequency   as enum ('daily', 'weekly', 'times_per_week');
create type assignment_status as enum ('assigned', 'open', 'done_pending',
                                       'confirmed', 'rejected', 'missed', 'cancelled');
create type assignment_source as enum ('engine', 'llm', 'admin', 'marketplace', 'swap');
create type swap_status       as enum ('pending', 'accepted', 'declined', 'expired');

create type split_basis       as enum ('equal', 'room_rent', 'custom');
create type expense_status    as enum ('pending_approval', 'approved', 'rejected', 'void');
create type period_status     as enum ('open', 'closing', 'closed', 'reopened');
create type settlement_status as enum ('pending', 'marked_paid', 'confirmed');

create type exception_type    as enum ('away', 'home_all_day', 'custom_hours');
create type notify_channel    as enum ('push', 'telegram', 'in_app');
create type llm_purpose       as enum ('schedule', 'digest', 'nl_parse');
