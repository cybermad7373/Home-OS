# Contributing to HouseOS

Thank you for considering contributing to HouseOS! This document outlines the process and standards for contributions.

## Getting Started

### Prerequisites

- Node.js 20+
- npm — the repository is locked with `package-lock.json`; do not introduce a
  second lockfile
- Supabase CLI (`npx supabase`, pinned as a dev dependency)
- Deno — only for `npm run test:functions` and `deno check` on the Edge Functions
- Docker Desktop (for the local Supabase stack)

### Development Setup

```bash
# Clone and install
git clone <repo-url>
cd houseos
npm install

# Configure environment
cp .env.example .env.local
# Fill in Supabase credentials

# Start local stack (optional)
supabase start
npm run db:reset

# Run development server
npm run dev
```

### Running Checks

Before submitting any change, run the full verification suite:

```bash
npm run typecheck   # TypeScript compilation
npm run lint        # ESLint
npm run test        # Unit + integration tests
npm run build       # Next.js production build
```

For Edge Function changes:
```bash
npm run test:functions
```

For browser journey changes (requires running app):
```bash
npm run test:e2e
```

## Contribution Workflow

1. **Check existing issues/PRs** — avoid duplicating work
2. **Open an issue** for significant changes (features, refactors, architectural decisions)
3. **Create a branch** from the default branch (`master`) with a descriptive name
4. **Make focused changes** — one logical change per PR
5. **Add/update tests** for any behavior change
6. **Run all checks** locally before pushing
7. **Open a PR** with a clear description of what and why

## Before You Change Anything

`AGENTS.md` is the shared working guide for humans and coding assistants alike;
`CLAUDE.md` points at it. Read, in this order:

1. `README.md` — setup, architecture, domain rules
2. `docs/00-INDEX.md` — the map of the sixteen specifications
3. `DECISIONS.md` — the non-obvious choices. Preserve a decision unless your
   change explicitly revises it, and add an entry when you make a new one.
4. `PROGRESS.md` — what is built, what is verified, what is next
5. The specification in `docs/` for the subsystem you are touching

Specification 2.0 was adopted on 2026-08-26. Engineering phases 1–8 are built,
phase 9 is built but unapplied, and phases 10–15 are specified and not started —
so a change in those areas is new work against a written spec, not a
modification of shipped behaviour.

## Code Standards

### Architecture Boundaries

| Directory | Purpose | Rules |
|-----------|---------|-------|
| `app/` | Route handlers, API endpoints | Validate, authorize, delegate — **no business logic** |
| `components/` | UI components | Pure presentation; data from props or context |
| `lib/domain/` | Business logic | **No framework, no database** — pure TypeScript |
| `lib/data/` | Repositories, SQL | All SQL lives here or in `supabase/migrations/` |
| `lib/infra/` | External adapters | Supabase clients, LLM adapters, push providers |
| `lib/validation/` | Zod schemas | Shared by client and server |

### Key Principles

- **Money as integer paise** — rupees only at UI boundary
- **RLS for isolation** — every house-scoped table needs a policy + test
- **Database constraints** — critical invariants in Postgres, not just app code
- **Home timezone for dates** — timestamps stored in UTC
- **Proposal → decision → application** — never suggestion to fact in one move
- **Duplication for scheduled jobs** — domain logic exists in TS and Deno (see D-06)

### TypeScript

- Strict mode enabled
- No `any` without justification
- Generated types in `lib/types/supabase.ts` — do not hand-edit
- Hand-written types in `lib/types/database.ts`

### Testing

- **Unit tests**: `tests/unit/` — property tests for arithmetic/invariant logic
- **Integration tests**: `tests/integration/` — real Supabase, RLS isolation
- **E2E tests**: `tests/e2e/` — Playwright browser journeys
- **Edge Function tests**: `supabase/functions/_shared/` — Deno tests

Add tests for:
- New business logic in `lib/domain/`
- New API endpoints
- New database rules (constraints, triggers, policies)
- Bug fixes

### Commits

- Conventional commits preferred: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
- One logical change per commit
- Clear, imperative subject line
- Body explains *why* when not obvious

### Pull Requests

- Reference related issue(s)
- Include test results (or note which checks run)
- Note any checks intentionally skipped and why
- Update `PROGRESS.md` if feature delivery state changes
- Update `DECISIONS.md` if a non-obvious technical decision is made

## Security

- **Never commit secrets** — `.env.local` is gitignored
- **Service-role key, VAPID private, LLM keys** — server-side only
- Report vulnerabilities per [SECURITY.md](SECURITY.md)

## Design Decisions

Non-obvious product and technical decisions are recorded in [`DECISIONS.md`](DECISIONS.md). Before changing areas covered there (expense splits, chore fairness, guests, dependents, notifications, household shapes, governance), check the relevant decision entry.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).