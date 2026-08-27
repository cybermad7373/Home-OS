# Security Policy

## Supported Versions

We release patches for security vulnerabilities. The following versions are currently supported:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in HouseOS, please report it responsibly:

**Do not** create a public GitHub issue for security vulnerabilities.

Instead, please email the details to: **security@houseos.local** (or create a private security advisory on GitHub)

### What to Include

Please include the following information in your report:

- A description of the vulnerability
- Steps to reproduce the issue
- Potential impact
- Any suggested fixes or mitigations (if you have them)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 7 days
- **Fix Development**: Depends on severity; critical issues prioritized
- **Disclosure**: Coordinated disclosure after a fix is available

## Security Architecture

HouseOS implements several security measures by design:

### Data Isolation
- **Row Level Security (RLS)**: Every house-scoped table enforces `house_id` isolation at the database level
- **No cross-house data access**: Members of one house cannot access data from another house
- **RLS policies tested**: Integration tests verify isolation (`tests/integration/rls-isolation.test.ts`)

### Authentication & Authorization
- **Username resolution server-side only**: Email lookup never runs in browser code
- **Service-role key isolation**: Administrative keys never reach client bundles
- **No self-approval**: Users cannot approve their own expenses or decisions

### Secrets Management
- **Environment variables only**: All secrets in `.env.local` (never committed)
- **Encrypted LLM keys**: House-owned AI credentials encrypted at rest with per-house keys
- **VAPID keys**: Web Push credentials managed separately per environment
- **Key rotation**: LLM encryption keys support versioned rotation

### Database Security
- **Critical invariants in constraints**: Split sums, settlement netting, role hierarchies enforced by Postgres
- **Triggers for immutable operations**: Closed months cannot be modified even by service-role
- **Check constraints**: Prevent invalid states (e.g., last admin demotion, room over-capacity)

### Application Security
- **Input validation**: All API inputs validated with Zod schemas (`lib/validation/`)
- **No business logic in route handlers**: Handlers validate, authorize, delegate to domain
- **Money as integer paise**: No floating-point arithmetic for financial calculations

## Security-Related Configuration

### Required Environment Variables

The application (`.env.local` / Vercel) reads:

```bash
# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=            # Server-side only

# Web Push (required for notifications)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=         # Public by design — it ships in the bundle
VAPID_PRIVATE_KEY=                    # Server-side only
VAPID_SUBJECT=mailto:you@example.com

# LLM encryption (optional, for AI features)
LLM_KEY_ENCRYPTION_KEY=               # Server-side only
LLM_KEY_ENCRYPTION_KEY_VERSION=1      # Bump to rotate; old versions stay readable
```

The Edge Functions read their own secrets, set with `supabase secrets set`, and
the names differ. There the public VAPID key is `VAPID_PUBLIC_KEY` with **no**
`NEXT_PUBLIC_` prefix, because nothing in a Deno function is bundled for a
browser. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the
platform and must never be set by hand. See `docs/13-SETUP-RUNBOOK.md` §7.

The scheduled jobs additionally need two rows in the `app_config` table — the
project URL and the service-role key — because `pg_cron` cannot read either from
the environment. That table has RLS enabled and **no policies**, which denies
every ordinary caller; only security-definer functions and the service role can
read it. Its rows are inserted per environment and are never committed.

### Supabase Dashboard Settings

- Email sign-up enabled
- Email confirmation: **off for development, on for production**
- Google OAuth configured with correct redirect URI
- Site URL set to application URL

## Known Security Considerations

1. **Local development**: Uses Supabase local stack (Docker) — isolate from production
2. **Integration tests**: Create real users — use scratch Supabase project, never production
3. **Service-role key**: Bypasses RLS but **not** database constraints/triggers
4. **Edge Functions**: Called by `pg_cron`; deploy with `npx supabase functions deploy`
5. **AI features**: Never authoritative over money, permissions, rules, or settlements

## Responsible Disclosure

We follow coordinated vulnerability disclosure. If you report a vulnerability:

1. We'll acknowledge within 48 hours
2. We'll work on a fix and keep you informed
3. We'll credit you in the fix (unless you prefer anonymity)
4. We'll disclose publicly after users have time to update

Thank you for helping keep HouseOS secure.