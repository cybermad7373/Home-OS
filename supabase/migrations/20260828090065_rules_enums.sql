-- 065 — Rule enums, and the three new LLM purposes
--
-- Source: docs/04-DATABASE.md section 3.1 and 4.8, docs/10-LLM-SPEC.md
-- sections 1 and 8, docs/07-ROADMAP.md phase 12.
--
-- Enum edits and nothing else, for the reason migration 047 gives at length:
-- `alter type ... add value` may not be used in the same transaction that adds
-- it, and the Supabase CLI wraps each migration file in one transaction. The
-- tables that use these types are in 066.
--
-- ---------------------------------------------------------------------------
-- Why the number is 065 and not 058
-- ---------------------------------------------------------------------------
-- Phase 11's remaining slices (shared assignment, governed close, the reserve)
-- are being written in parallel with phase 12 and will take 058 to 060. The
-- rules module claims a band above them so that neither track has to guess the
-- other's numbering, and so that the dispatcher restatement in 066 lands after
-- theirs rather than in the middle of it.

-- ---------------------------------------------------------------------------
-- Rules
-- ---------------------------------------------------------------------------
-- `superseded` is a rule-level status and not only a version-level one: a rule
-- replaced wholesale by another rule is a thing a Home does, and the list has
-- to be able to stop showing it without deleting it.
create type rule_status as enum (
  'draft', 'proposed', 'active', 'disabled', 'superseded'
);

-- RL-09. Which of the two produced the structured fields, kept per version
-- rather than per rule, because a rule first parsed by a model and later edited
-- by hand has one of each.
create type rule_parse_source as enum ('manual', 'ai');

-- ---------------------------------------------------------------------------
-- The three call sites version 3.0 of the LLM spec adds
-- ---------------------------------------------------------------------------
-- Only `rule_parse` has a caller in this phase. The other two are added here
-- because they are the same kind of change to the same type, and a second
-- enum-only migration in two weeks' time is a second deployment step for no
-- reason.
alter type llm_purpose add value if not exists 'rule_parse';
alter type llm_purpose add value if not exists 'food_ideas';
alter type llm_purpose add value if not exists 'food_normalise';
