-- 034 — Household shape: the enums
--
-- Kept in their own migration because `alter type ... add value` cannot be used
-- in the same transaction that creates it. Migration 035 does the real work and
-- needs 'payer' to already exist.
--
-- Until now the app modelled exactly one household: a set of equal peers who
-- each pay a share of everything and each owe a points target enforced with
-- money. That is a shared flat. It is not a family, where the money comes out
-- of one pot and a ten-year-old cannot owe rupees for an unmade bed.

-- What kind of household this is. It selects the defaults for everything below
-- and the vocabulary the interface uses; it is not itself enforced anywhere.
create type household_type as enum ('shared', 'family');

-- Whether a resident is a peer or somebody's dependent. A dependent may have no
-- login at all — a small child, an elderly parent — and still be a real head in
-- the house that food is bought for and work is created by.
create type member_kind as enum ('adult', 'dependent');

-- 'split' — every expense divides across the house and the month nets into
--           payments. The flatmate model.
-- 'pot'   — an expense is attributed to whoever paid it and creates no debt.
--           The family model: the point of recording it is the budget, not a
--           claim against anybody.
create type money_mode as enum ('split', 'pot');

-- 'points' — the full effort ledger: targets, carry, a leaderboard.
-- 'rota'   — the same generated schedule, with the scoring hidden. The work is
--            still fairly distributed; the household is simply not asked to
--            look at each other's scores.
create type effort_mode as enum ('points', 'rota');

-- The split basis that makes pot mode work without a second code path: one
-- share, the whole amount, on the member who paid. Netting then produces
-- nothing to settle, which is exactly right.
alter type split_basis add value if not exists 'payer';
