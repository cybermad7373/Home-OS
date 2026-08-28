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

## Threat Model

What HouseOS is defending against, in the order the risks actually matter for a
shared household. The unusual property of this product is that **the adversary is
usually a member** — someone with a legitimate account, legitimate access to the
Home, and a motive that is financial rather than technical. Most of the
architecture is aimed there, not at an outsider.

### Assets

| Asset | Why it is worth attacking |
|---|---|
| A Home's balances, splits and settlements | It is money. A changed figure is a real transfer between real people. |
| The governance record — decisions, responses, quorum | Rewriting it converts one person's wish into the Home's decision |
| Membership and roles | Admin is the entry point to everything above |
| Another Home's data | Every Home in the deployment shares one database |
| Personal data — presence, absence reasons, restrictions, receipts, location | Health and whereabouts of identified individuals |
| Credentials — service-role key, VAPID private key, a Home's LLM key | Each is a bypass of a different control |

### Adversaries and what stops them

| # | Adversary | What they try | Primary control | Backstop |
|---|---|---|---|---|
| T-1 | **A member acting in their own financial interest** | Approve their own expense; close a month early; edit a settled figure; award themselves points | No self-approval, and Critical decisions need a Co-Admin and members (D-40 to D-42) | Database triggers on closed periods; `Σ variance + reserve = 0` |
| T-2 | **A single Admin acting alone** | Use administrative power to force an outcome the Home did not agree to | The property this version exists for: **no single member's responses can complete a Critical decision** (D-40) | Quorum computed in the database, not in the route handler |
| T-3 | **A removed or departing member** | Retain access; take a parting action; leave with money owed unrecorded | RLS requires `status = 'active'`; removal is itself a Critical decision (BR-165) | Pending settlement blocks completion of removal (BR-166) |
| T-4 | **A `requested` person who has not been accepted** | Read the Home while waiting | RLS treats them as a non-member of every table (BR-003, E-69) | Test asserting zero rows from every table |
| T-5 | **A member of another Home** | Read or write across the `house_id` boundary | RLS on every house-scoped table | An isolation test per table, required for each new table |
| T-6 | **Someone holding an invite link** | Join without being accepted; replay a rotated link; enumerate Homes | A link authorises **requesting**, never joining (BR-174); tokens ≥128 bits, hashed at rest, expiring (BR-008, BR-171, BR-172) | Identical refusal for revoked, expired and never-existed (E-91) |
| T-7 | **An unauthenticated outsider** | Reach data or an endpoint directly | Supabase auth on every route; RLS assumes no application layer | Anon role holds no grant on house-scoped tables |
| T-8 | **A member curious about another member** | Read restrictions, absence reasons, location, receipts | Per-person RLS narrower than per-Home (BR-226) | Redaction contract on every outbound payload |
| T-9 | **An LLM provider, or the model itself** | Receive identifying data; return content that is acted on | The redaction contract (section 4 of `docs/10-LLM-SPEC.md`): no names, no ids, no addresses | AI is never authoritative — every response passes a deterministic validator, and every call site has a deterministic equivalent |
| T-10 | **Anyone who obtains a backup or a database dump** | Read Home LLM keys; replay invite links | Keys encrypted at rest with a versioned key held outside the database; invite tokens stored hashed | Key rotation without re-entry |
| T-11 | **Anyone who obtains the service-role key** | Bypass RLS wholesale | Key is server-side only and never in a client bundle, response, fixture or log | **It bypasses RLS, not constraints or triggers** — the money invariants still hold |
| T-12 | **A compromised dependency or build** | Exfiltrate secrets from the bundle | No secret is readable from the client; `NEXT_PUBLIC_` names are audited | The anon key is public by design and useless without a session |

### Explicitly out of scope

Stated so that the absence of a control is a decision rather than an oversight:

- **A member lying about the world.** Nothing verifies that a chore was actually
  done, that a receipt is genuine, or that somebody was really away. The product
  answers this socially — a peer confirms, a quorum acknowledges, a photo is
  attached — and the record shows who vouched for what. It is not a fraud-detection
  system and does not present itself as one.
- **A compromised member device or session.** If somebody has your unlocked phone,
  they are you.
- **The hosting provider.** Supabase and Vercel are trusted with data at rest and in
  transit.
- **Denial of service.** Rate limits exist to keep a Home inside its own quotas
  (SEC-10, BR-290), not to withstand an attack.
- **Traffic analysis and metadata.** That a Home is active at 3am is not protected.

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