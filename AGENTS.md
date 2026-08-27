<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# HouseOS — shared AI working guide

`AGENTS.md` is the shared instruction source for coding assistants in this
repository. `CLAUDE.md` intentionally points here; do not duplicate this guide
into tool-specific files unless a tool cannot read `AGENTS.md`.

## Start here

Before making a change, read the relevant parts of:

1. `README.md` for setup, architecture, and domain rules.
2. `DECISIONS.md` for non-obvious product and technical decisions. Preserve a
   decision unless the task explicitly changes it.
3. `PROGRESS.md` for the delivered phases, current verification state, and
   known gaps. Update it when a meaningful feature or verification state
   changes.
4. The relevant specification in `docs/` when changing a defined subsystem.

## Project shape

HouseOS is a Next.js 16 / React 19 / TypeScript household-management app backed
by Supabase/Postgres. The main boundaries are deliberate:

- `app/`: pages and API route handlers only. Handlers validate, authorise, call
  domain or data code, and return a response; keep business logic out of this
  directory.
- `components/`: UI primitives, shell, and feature components.
- `lib/domain/`: framework- and database-free business logic.
- `lib/data/`: repositories and application SQL. SQL belongs here or in
  `supabase/migrations/`, nowhere else.
- `lib/infra/`: Supabase clients and external-service adapters.
- `lib/validation/`: shared Zod schemas.
- `lib/types/supabase.ts`: generated. Regenerate with `npm run gen:types`; do
  not hand-edit it. Put handwritten types in `lib/types/database.ts`.
- `supabase/migrations/`: ordered schema changes. `supabase/functions/`: Deno
  Edge Functions called by database schedules.
- `tests/`: unit/property, integration, and Playwright coverage.

## Non-negotiable domain and data rules

- Store and calculate money as integer paise. Convert to rupees only at the UI
  boundary.
- Enforce household isolation with Postgres RLS. Every new house-scoped table
  needs an appropriate policy and an isolation test.
- Put critical invariants in the database as well as application code. A
  service-role key bypasses RLS, not database constraints or triggers.
- Evaluate dates in the house timezone; persist timestamps in UTC.
- Do not expose account-email lookup in browser code. Username resolution is
  server-side only.
- Changes used by scheduled jobs may need matching implementations in
  `lib/domain/` and `supabase/functions/`; this intentional duplication is
  explained in decision D-06.
- Preserve the settled rules on expense splits, chore fairness, guests,
  dependents, notifications, and household shapes. Check the matching entry in
  `DECISIONS.md` before changing those areas.

## Environment and security

- Never read, print, commit, or paste values from `.env.local`. Use
  `.env.example` only to learn required variable names.
- Keep `SUPABASE_SERVICE_ROLE_KEY`, web VAPID private keys, native push provider
  credentials, LLM API keys, and
  encryption keys server-side. They must never reach a client bundle, API
  response, test fixture, or log.
- Treat migrations, database resets, remote tests, deploys, and generated type
  updates as state-changing operations. Confirm the target environment before
  running them. Integration tests create and remove real users: use a local or
  scratch Supabase project, never production.
- Do not alter generated files manually; rerun their owning generator instead.

## Working and verification

- Prefer the smallest change that preserves the architecture and existing
  decisions. Avoid unrelated refactors.
- Add or update focused tests whenever business logic, database rules, or API
  behaviour changes. Include property tests for arithmetic/invariant-heavy
  logic.
- Run the checks proportionate to the change:

  ```bash
  npm run typecheck
  npm run lint
  npm run test
  npm run build
  ```

  Use `npm run test:functions` for Edge Function/Web Push changes and
  `npm run test:e2e` for browser journeys (with the required app running).
- Report what changed, which checks ran, and any checks intentionally not run.
- Do not claim a migration, Edge Function, secret, or production deployment is
  complete unless it was actually applied to the intended environment. A test
  suite that gated itself out on an unapplied migration has not passed.
- Integration tests and `npm run gen:types` target the local `supabase start`
  stack. Writing to the hosted project — `npm run db:push`, a remote test run,
  a function deploy — is a separately requested action, never a step inside a
  verification run.
- Commit each finished slice on `main`, one conventional commit per slice, so
  the history matches `PROGRESS.md`.
- From phase 11 onward, a phase also adds one Playwright journey through its
  main path: the route handlers and screens have no other automated coverage.
- These four are settled in D-59, along with the order phase 11's remaining
  slices are built in.

## Current delivery focus

Specification 2.0 was adopted on 2026-08-26. Product phase 1 (web/PWA) is in
progress: engineering phases 1–8 are complete and phase 9 (intelligence/LLM) is
built but not yet applied to an environment — migrations 045 and 046 are unpushed
and the LLM master key is unset. Phases 10–15 are the version-2.0 additions —
membership and Homes, governance, rules, food, Today/Calendar/navigation, and
insights. Phase 10 is built and phase 11 is in progress, both against unpushed
migrations (047–054); phases 12–15 are not started. **The next piece of work is
not a feature:** stand up local Supabase, apply 045–054, run the integration
suites that currently skip themselves, regenerate the types, and prune
`lib/types/schema-pending.ts` (D-59). `PROGRESS.md` is the
authority on what is built and what has actually been applied to a database. Product phase 2 is native Android/iOS
(engineering phase 17) and is not started.

Before touching AI code, read `docs/10-LLM-SPEC.md` (now at version 3.0, six call
sites behind an AI Router with per-Home capability switches): credentials are
house-owned and encrypted, never deployment-wide environment keys. Before
starting any 2.0 phase, read `docs/14-GOVERNANCE-SPEC.md` — the property the
version exists to protect is that no single member's responses can complete a
Critical decision. Before starting mobile work, read the phase-17 section in
`docs/07-ROADMAP.md` and do not assume browser Web Push/VAPID can be reused as
native push transport.
