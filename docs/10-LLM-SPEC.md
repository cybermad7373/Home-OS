# 10 — LLM Integration Specification

**Product:** HouseOS
**Version:** 3.0
**Date:** 2026-08-26

Exact prompts, exact schemas, exact validation. **Six call sites and nothing
more.** Every one of them degrades to a deterministic path when no key is
configured, and the whole test suite must pass with no key configured anywhere.

| Version | What changed |
|---|---|
| 1.0 | Three call sites, one key from the environment |
| 2.0 | The key moved to the Home: chosen and pasted by its Admin, stored sealed (D-35), over a provider registry that is data rather than code (D-36) |
| **3.0** | An **AI Router** in front of the adapter; **per-Home capability switches** (AI-02); three new call sites — rule parsing, food ideas and meal-name normalisation; and natural-language entry extended from two intents to four |

The rule the whole document serves, restated because version 3.0 gives the model
three more places to be wrong:

> **AI is never authoritative over Money, Permissions, Rules, Approvals, Chore
> calculation or Settlement** (AI-09). Every output is a proposal a person
> confirms or a validator accepts. There is no path from a model's response to a
> stored fact that does not pass through one of those two gates.

---

## 1. The router and the adapter

Every model call in HouseOS goes through one router and one adapter interface.
The call sites know nothing about providers, wire formats or keys.

```ts
// lib/infra/llm/router.ts
export type Capability =
  | 'schedule_proposals'   // call site 1
  | 'weekly_summary'       // call site 2
  | 'natural_language'     // call site 3
  | 'rule_parsing'         // call site 4
  | 'food_ideas'           // call site 5
  | 'food_normalise';      // call site 6

/**
 * The single entry point. Returns null when this Home cannot or should not
 * make this call — no key, capability off, breaker open, credential disabled.
 * Every call site reads null as "take the deterministic branch", with no error
 * logged and nothing shown to the user.
 */
export async function route(
  houseId: string,
  capability: Capability,
): Promise<LlmProvider | null>;
```

`route` is `resolveLlm` (section 3.5) plus one check: the Home's capability
switch for this call site. That is the whole of the router, and it is a function
rather than a class because there is nothing to hold.

**Why a router at all, when it is four lines.** It is the one place that can
answer "should this Home make this call", and having exactly one such place is
what makes AI-02 enforceable rather than aspirational. A call site that reaches
for `resolveLlm` directly has bypassed the capability switch, and that is a
defect a test looks for.

```ts
// lib/infra/llm/types.ts
export interface LlmRequest {
  purpose: 'schedule' | 'digest' | 'nl_parse'
         | 'rule_parse' | 'food_ideas' | 'food_normalise';
  system: string;
  user: string;
  schema: JsonSchema;          // the response is validated against this
  maxTokens: number;
  temperature: number;
}

export interface LlmResponse<T> {
  ok: boolean;
  data?: T;
  raw?: string;
  error?: string;
  usage?: { promptTokens: number; completionTokens: number };
  latencyMs: number;
}

export interface LlmProvider {
  name: string;                // registry id, e.g. 'groq'
  model: string;
  complete<T>(req: LlmRequest): Promise<LlmResponse<T>>;
}
```

**Adapter guarantees, which every provider implementation must honour:**

| Guarantee | Detail |
|-----------|--------|
| Never throws | Every failure returns `{ ok: false, error }`. A thrown exception from an LLM call is a defect. |
| Timeout | 20 seconds, hard. |
| Retry | Exactly one, on a network error or a 5xx, with 1 second of backoff. Never retried on a validation failure. |
| Structured output | JSON mode where the provider supports it; otherwise the schema is embedded in the prompt and the response is extracted from the first balanced `{…}` block. |
| Validation | The parsed response is validated against the declared JSON schema before returning. A schema failure is `ok: false`. |
| Logging | Every call writes an `llm_runs` row, including failures, with input, output, latency and token counts. |
| Redaction | The payload builder is the only code permitted to construct LLM input. It emits member ids and first names only. |
| Key isolation | A provider instance is constructed with a decrypted key held in a local variable for the duration of one request. The key is never logged, never written to `llm_runs`, and never returned to a browser. |

---

## 2. Providers

### 2.1 Three transports, many providers

The key is supplied by the house, not by the operator, so HouseOS has to talk to
whichever service that house has an account with. Nearly all of them speak one
of three wire formats:

| Transport | Endpoint shape | Used by |
|-----------|----------------|---------|
| `openai-chat` | `POST {baseUrl}/chat/completions`, bearer key, `response_format: { type: 'json_object' }` where supported | Groq, OpenRouter, Together, Cerebras, Mistral, DeepSeek, Hugging Face router, OpenAI, and Ollama or LM Studio on localhost |
| `gemini` | `POST {baseUrl}/models/{model}:generateContent`, key as a header, `responseMimeType: application/json` plus `responseSchema` | Google AI Studio |
| `anthropic` | `POST {baseUrl}/v1/messages`, `x-api-key` and `anthropic-version` headers, schema forced through a single tool definition | Anthropic |

So the code has exactly three transport modules under
`lib/infra/llm/transports/`, and a provider is a *data row* rather than a class.
Adding Fireworks or Nebius later is one entry in a table and no new code. Adding
a genuinely new wire format is one new transport file, and that is the only case
that touches TypeScript.

### 2.2 The registry

```ts
// lib/infra/llm/providers.ts
export interface ProviderDescriptor {
  id: string;                       // stored in the database, never renamed
  label: string;                    // shown in the picker
  transport: 'openai-chat' | 'gemini' | 'anthropic';
  baseUrl: string;
  models: { id: string; label: string; free: boolean }[];
  defaultModel: string;
  jsonMode: 'native' | 'schema' | 'prompt';
  keyHint: { pattern: RegExp; example: string };  // a client-side sanity check only
  consoleUrl: string;               // where the house goes to mint a key
  notes: string;                    // free-tier limits, in one sentence
}

export const PROVIDERS: ProviderDescriptor[] = [ /* … */ ];
export function getProvider(id: string): ProviderDescriptor | undefined;
```

The shipped set, ordered as the picker orders it — free tiers first, because the
product's premise is that a shared house pays nothing to run it:

| id | Label | Transport | Default model | Free tier |
|----|-------|-----------|---------------|-----------|
| `gemini` | Google Gemini | `gemini` | `gemini-flash-latest` | Generous free tier on an AI Studio key |
| `groq` | Groq | `openai-chat` | `llama-3.3-70b-versatile` | Free, rate-limited per minute and per day |
| `openrouter` | OpenRouter | `openai-chat` | `meta-llama/llama-3.3-70b-instruct:free` | The free model pool, suffixed `:free` |
| `huggingface` | Hugging Face | `openai-chat` | `meta-llama/Llama-3.3-70B-Instruct` | Monthly inference credit |
| `cerebras` | Cerebras | `openai-chat` | `llama-3.3-70b` | Free developer tier |
| `mistral` | Mistral | `openai-chat` | `mistral-small-latest` | Free experiment tier |
| `openai` | OpenAI | `openai-chat` | `gpt-4o-mini` | Paid |
| `anthropic` | Anthropic | `anthropic` | `claude-haiku-4-5-20251001` | Paid |
| `custom` | OpenAI-compatible URL | `openai-chat` | supplied by the user | Self-hosted, Ollama, LM Studio |

`custom` exists so a house running its own model never needs a code change: it
supplies a base URL, a model name and, optionally, a key.

**Model lists are a starting point, not a constraint.** The picker offers the
listed models and also accepts a typed model id, because provider catalogues
change faster than this repository does. An unknown model id is the provider's
error to report, and it surfaces through the verification call in section 3.4
before anything is saved.

**Provider ids are permanent.** They are written into `house_llm_credentials`
and into `llm_runs`. Renaming one is a migration, not an edit.

---

## 3. Where the key lives

### 3.1 The decision

The key is per house, entered by the house admin, rather than an operator
environment variable. The reasoning is recorded as D-35: HouseOS is meant to be
run by the house that uses it, one deployment can serve several houses, and
free tiers are per account. The environment variable survives as a fallback for
a single-house self-host and for development.

### 3.2 Schema

```sql
-- migration 045
create table house_llm_credentials (
  house_id         uuid primary key references houses(id) on delete cascade,
  provider         text not null,
  model            text not null,
  base_url         text,                       -- only for provider = 'custom'
  key_ciphertext   bytea not null,             -- AES-256-GCM
  key_iv           bytea not null,             -- 12 random bytes, per write
  key_tag          bytea not null,             -- the 16-byte auth tag
  key_last4        text not null,              -- for display; never the whole key
  key_version      integer not null default 1, -- which master key sealed it
  status           llm_credential_status not null default 'unverified',
  last_verified_at timestamptz,
  last_error       text,
  created_by       uuid not null references users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
```

`llm_credential_status` is `unverified | active | failing | disabled`.

**RLS: no role reads the ciphertext.** The table has row-level security enabled
and no `select` policy at all, so `authenticated` cannot read it under any
query. Writes go through `set_house_llm_credential`, a `security definer`
function that checks the caller is an admin of that house. Reads for the purpose
of making a call happen with the service role, in a route handler or an Edge
Function, and nowhere else.

What the UI reads instead is a view:

```sql
create view house_llm_config as
  select house_id, provider, model, base_url, key_last4, status,
         last_verified_at, last_error
  from house_llm_credentials;
```

It is readable by members of the house, and it contains nothing secret.

### 3.3 Encryption at rest

Ciphertext rather than plaintext, because a house's provider key is the one
credential in this database that costs money when it leaks, and because a
database dump is a far more likely accident than a compromise of the application
host.

- AES-256-GCM through Web Crypto on both sides — the Next.js server and the
  Deno Edge Functions — so there is one implementation and no Node-only
  dependency.
- The master key is `LLM_KEY_ENCRYPTION_KEY`, 32 bytes base64, set as both a
  server environment variable and a Supabase function secret. Generated by
  `npm run gen:llmkey`.
- The additional authenticated data is the house id, so a ciphertext lifted out
  of one row cannot be pasted into another.
- `key_version` is stored so rotation works without downtime: a second master
  key is added as version 2, new writes seal with it, and version 1 rows still
  decrypt until they are re-sealed.
- If `LLM_KEY_ENCRYPTION_KEY` is unset, saving a key fails with a plain message
  and AI features stay off. It never falls back to storing plaintext.

### 3.4 Entry, at house creation

The house wizard gains one optional step, after the household-shape step and
before the room step, titled "AI features (optional)".

1. A provider picker showing the label, the free-tier note and a link to that
   provider's console.
2. A key field, `type="password"`, with the client-side `keyHint.pattern` used
   only to catch an obvious paste error. A model field, pre-filled with the
   provider's default and editable.
3. **Verify** — `POST /api/ai/credentials/verify` sends a fixed nine-token
   prompt through the chosen provider and reports the round trip. This call does
   not store anything.
4. **Save** stores the key sealed, with `status = 'active'` when verification
   passed and `'unverified'` when the admin saved without verifying.
5. **Skip** is a first-class button, and skipping is the expected path. Every
   feature in this document already has a deterministic branch, so a house with
   no key loses nothing but the prose.

The same panel appears at `/house/settings/ai` for later entry, replacement or
removal. Replacement overwrites; there is no key history. Removal deletes the
row, and the house returns to the deterministic paths.

The plaintext key crosses the wire exactly twice — once to verify, once to save
— over HTTPS, in a request body, and it is never echoed back. Afterwards the UI
shows `•••• 4f2a`, from `key_last4`.

### 3.5 Resolution order

```ts
// lib/infra/llm/resolve.ts
export async function resolveLlm(houseId: string): Promise<LlmProvider | null>;
```

1. The house's own row in `house_llm_credentials`, when `status` is `active` or
   `unverified` and the circuit breaker is not open.
2. Otherwise the environment fallback — `LLM_PROVIDER`, `LLM_API_KEY`,
   `LLM_MODEL` — which serves a single-house self-host and the developer's
   machine.
3. Otherwise `null`, which every call site reads as "take the deterministic
   branch", with no error logged.

`isLlmEnabled(houseId)` is `resolveLlm(houseId) !== null`, and it replaces the
environment-only `isLlmEnabled()` this document previously specified. The test
suite must still pass with no key anywhere, which is step 3 exercised end to
end.

### 3.6 Failure handling for a house-supplied key

A key the house owns can be revoked, exhausted or mistyped, which an operator
key mostly cannot. So these states are visible rather than silent:

| Provider response | Stored state | What the house sees |
|-------------------|--------------|---------------------|
| 401 or 403 | `disabled`, `last_error` set | A banner in settings: the key was rejected, AI features are off until it is replaced. No banner anywhere else. |
| 429, or quota exhausted | `failing`, breaker open for 1 hour | Nothing. The deterministic path runs, and the settings page carries the rate-limit note. |
| Timeout or 5xx, three in a row | `failing`, breaker open for 1 hour | Nothing, as above. |
| Success after a failure | `active`, `last_error` cleared | Nothing. |

An admin is notified once, in app, when a key moves to `disabled` — never more
than once per replacement, and never to non-admins. A rejected key is an
administrative fact, not house news.

### 3.6a Capabilities — **new in 3.0**

A Home with a key still decides which of the six call sites may use it (AI-02).

```sql
-- part of migration 0xx, alongside governance
alter table house_llm_credentials
  add column capabilities jsonb not null default '{
    "schedule_proposals": true,
    "weekly_summary":     true,
    "natural_language":   true,
    "rule_parsing":       true,
    "food_ideas":         true,
    "food_normalise":     true
  }'::jsonb;
```

| Rule | Detail |
|------|--------|
| A capability that is off behaves **exactly** as if no key were configured, for that feature alone | The screen shows its deterministic path, with no banner, no upsell and no error |
| Switching one off never affects another | The digest and the food ideas are independent decisions |
| The environment fallback has all six on | A single-house self-host that set `LLM_API_KEY` meant to enable AI |
| `house_settings.llm_scheduling_enabled` remains, and is ANDed with `schedule_proposals` | It predates this and some Homes have set it |

The settings panel renders them as six switches under the key, each with one line
saying what it buys. A Home that wants the food ideas and not a model's opinion
on its rota can have exactly that.

### 3.7 Adding a provider later

The whole checklist, for an OpenAI-compatible service:

1. Add one `ProviderDescriptor` to `PROVIDERS`.
2. Add its id to the `provider` check constraint, in a migration.
3. Add a fixture to `tests/unit/llm-providers.test.ts`, which asserts that every
   descriptor has a well-formed base URL, a default model present in its own
   list, and a transport that exists.

No call site changes, no schema change beyond the constraint, and no UI change —
the picker renders the registry.

---

## 4. Redaction contract

This is enforced by a dedicated test that inspects every `llm_runs.input_payload` produced by the test suite.

**Permitted in an LLM payload:**

- Opaque member identifiers (`m1`, `m2`, …) — mapped locally, never the database UUID
- First names only, truncated at the first space
- Effort points, targets, carry values
- Chore names, categories, durations, slots, dates
- Times of day and derived window boundaries
- Room labels (`R1`, `R2`) — never room names, which can be personal
- Aggregate money totals in rupees, for the digest only
- **Food names, item names and per-person cost figures** — a dish is not personal data
- **The Home's city, state and country** — never the address, never the area field
- **A rule's text as the Admin typed it**, which is the one place a member's free text is sent deliberately, because it *is* the input. The Admin sees exactly what will be sent before they tap.

**Forbidden, unconditionally:**

- Email addresses, phone numbers, UPI identifiers
- Surnames or full names
- Database UUIDs
- Individual expense descriptions or receipt contents
- Home name, street address or the `area` field
- Any free text a member typed, with exactly two exceptions: a chore rejection
  reason, included only in the digest and truncated to 100 characters; and a rule's
  own text at call site 4, where the text is the input and the Admin sees it
  before sending
- Member names inside a rule payload. A rule about a named person is built by the
  Admin picking them from a list after the parse.

```ts
// lib/infra/llm/redact.ts — the only permitted construction path
export function toLlmMember(m: Member, index: number): LlmMember {
  return {
    id: `m${index + 1}`,
    name: m.displayName.split(' ')[0].slice(0, 20),
    // no email, no phone, no vpa, no uuid
  };
}
```

---

## 5. Call site 1 — Schedule proposal

**When:** during weekly generation, only after the deterministic solver has produced a valid schedule, and only when `house_settings.llm_scheduling_enabled` is true.

**Why an LLM at all:** the solver optimises a numeric objective. It cannot reason about "Suresh has been given the bathroom three weeks running and it is starting to look punitive", or "Ravi cooks better on weekends when he has time". The LLM sees the same data plus history and may produce a humanly better arrangement. It is never trusted to produce a *valid* one — that is the validator's job.

### 5.1 System prompt

```
You are a fair-rostering assistant for a shared house. You assign household
chores to housemates for one week.

You will receive:
- members, each with a points target, their free time windows per day, and
  whether they can cook
- chore instances, each with a date, a time slot, a duration and a point value
- the last four weeks of who did what

Your task: assign every instance to exactly one eligible person.

HARD RULES. A schedule that breaks any of these is worthless and will be
discarded in full:
1. Assign a chore only to someone whose free window on that date matches the
   chore's slot and is at least the chore's duration plus 15 minutes.
2. A room-scoped chore goes only to an occupant of that room.
3. A chore requiring cooking goes only to someone who can cook.
4. Never assign to someone marked away on that date.
5. A person's chores on one day must not overlap in time.
6. At most 3 chores, and at most 150 minutes, per person per day.
7. A guest chore goes to that guest or their host, nobody else.
8. Every instance is assigned exactly once. Never drop one, never duplicate one.

GOALS, in order of importance:
1. Each person's total points should land close to their target.
2. Avoid giving anyone the same heavy chore two weeks running.
3. Spread each person's chores across the week rather than clustering them.
4. Vary who does what.

Return only JSON matching the schema. No prose outside the JSON.
```

### 5.2 User payload

```json
{
  "week_start": "2026-08-24",
  "members": [
    {
      "id": "m1",
      "name": "Ravi",
      "target_points": 53,
      "carry_in": 60,
      "can_cook": true,
      "room": "R1",
      "windows": {
        "2026-08-24": [{ "kind": "morning", "start": "06:00", "end": "09:30" },
                       { "kind": "evening", "start": "19:00", "end": "23:00" }],
        "2026-08-25": [{ "kind": "morning", "start": "06:00", "end": "09:30" },
                       { "kind": "evening", "start": "19:00", "end": "23:00" }]
      },
      "away_dates": []
    }
  ],
  "guests": [
    { "id": "g1", "name": "Arun", "host": "m2", "dates": ["2026-08-29", "2026-08-30"] }
  ],
  "instances": [
    {
      "id": "i1", "chore": "Cook dinner", "category": "cooking",
      "date": "2026-08-24", "slot": "evening", "duration_min": 60,
      "points": 30, "requires_cooking": true, "scope": "house",
      "room": null, "is_heavy": false
    }
  ],
  "history": [
    { "member": "m3", "chore": "Clean bathroom", "weeks_ago": 1 },
    { "member": "m3", "chore": "Clean bathroom", "weeks_ago": 2 }
  ],
  "baseline_max_deviation": 8
}
```

`baseline_max_deviation` is the deterministic solver's worst per-member deviation. It is included so the model knows the standard it must match, and it is what the validator checks against.

### 5.3 Response schema

```json
{
  "type": "object",
  "required": ["assignments", "rationale"],
  "additionalProperties": false,
  "properties": {
    "assignments": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["instance_id", "assignee_id"],
        "additionalProperties": false,
        "properties": {
          "instance_id": { "type": "string" },
          "assignee_id": { "type": "string" }
        }
      }
    },
    "rationale": { "type": "string", "maxLength": 600 }
  }
}
```

Parameters: `temperature: 0.3`, `maxTokens: 4000`.

### 5.4 Validation

```ts
function validateProposal(p, ctx): ValidationResult {
  const errors: string[] = [];

  // completeness
  const assigned = new Set(p.assignments.map(a => a.instance_id));
  if (assigned.size !== p.assignments.length) errors.push('DUPLICATE_INSTANCE');
  for (const i of ctx.instances)
    if (!assigned.has(i.id)) errors.push(`MISSING_INSTANCE:${i.id}`);
  for (const a of p.assignments)
    if (!ctx.instanceById[a.instance_id]) errors.push(`UNKNOWN_INSTANCE:${a.instance_id}`);

  // identity
  for (const a of p.assignments)
    if (!ctx.personById[a.assignee_id]) errors.push(`UNKNOWN_PERSON:${a.assignee_id}`);

  // the eight hard constraints, evaluated by the same code the solver uses
  for (const a of p.assignments) {
    const violations = checkHardConstraints(
      ctx.instanceById[a.instance_id],
      ctx.personById[a.assignee_id],
      p.assignments, ctx
    );
    errors.push(...violations.map(v => `${v}:${a.instance_id}`));
  }

  // quality floor
  const dev = maxDeviationFromTarget(p.assignments, ctx);
  if (dev > ctx.baselineMaxDeviation * 1.15)
    errors.push(`WORSE_THAN_BASELINE:${dev}>${ctx.baselineMaxDeviation}`);

  return { valid: errors.length === 0, errors };
}
```

The constraint checker is literally the same function the solver uses. There is no second implementation to drift.

### 5.5 Outcome handling

| Outcome | Action |
|---------|--------|
| Valid | Persist the LLM assignments. `schedule_runs.generator = 'llm'`, `llm_accepted = true`, rationale stored and shown in the weekly digest and the admin schedule view. |
| Invalid | Persist the deterministic assignments. `generator = 'engine'`, `llm_accepted = false`, `validation_errors` stored. No user-facing error. |
| Call failed | Identical to invalid, with the error recorded. |

**No repair pass, ever.** A near-miss proposal is discarded whole. The reasoning is in the architecture document: one schedule that quietly violates someone's availability costs more trust than every schedule the model improves.

---

## 6. Call site 2 — Weekly fairness digest

**When:** Sunday 21:00, after generation. Also on demand from `GET /api/ai/digest`.

**Why:** the leaderboard shows numbers. The digest converts them into the sentence that gets read in the house group chat. That sentence is the product's social mechanism, and it is worth an LLM.

### 6.1 System prompt

```
You write a short weekly summary for a shared house that tracks who does the
chores. Your reader is the whole house, including the people who did the least.

Write 3 to 5 sentences. Be factual and specific — use the actual numbers.

Name who carried the most work and who did the least. Do not soften it, and do
not editorialise about it either. State what happened and what changes next
week. No moralising, no exclamation marks, no praise beyond stating the facts.

If someone improved on last week, say so — even if they are still last.

Then state, in one sentence, what next week's schedule does differently and why.

Return only JSON matching the schema.
```

### 6.2 User payload

```json
{
  "week": "2026-08-17 to 2026-08-23",
  "members": [
    { "id": "m1", "name": "Ravi", "earned": 128, "target": 105,
      "done": 6, "missed": 0, "last_week_earned": 110 },
    { "id": "m4", "name": "Suresh", "earned": 20, "target": 105,
      "done": 1, "missed": 4, "last_week_earned": 5 }
  ],
  "house": {
    "total_points": 840,
    "completion_rate": 0.79,
    "top3_share": 0.61,
    "top3_share_last_week": 0.68
  },
  "next_week": [
    { "id": "m4", "name": "Suresh", "new_target": 157,
      "note": "target raised by carried deficit; given evening kitchen slots, home by 18:30" }
  ]
}
```

### 6.3 Response schema

```json
{
  "type": "object",
  "required": ["summary", "highlights", "next_week_note"],
  "additionalProperties": false,
  "properties": {
    "summary": { "type": "string", "maxLength": 800 },
    "highlights": {
      "type": "object",
      "required": ["carried", "coasted", "improved"],
      "properties": {
        "carried":  { "type": "array", "items": { "type": "string" }, "maxItems": 3 },
        "coasted":  { "type": "array", "items": { "type": "string" }, "maxItems": 3 },
        "improved": { "type": "array", "items": { "type": "string" }, "maxItems": 3 }
      }
    },
    "next_week_note": { "type": "string", "maxLength": 300 }
  }
}
```

Parameters: `temperature: 0.6`, `maxTokens: 800`.

### 6.4 Validation

Lighter than the schedule's, because a digest cannot corrupt state:

1. Every name in `highlights` appears in the input. A hallucinated name rejects the response.
2. `summary` is between 80 and 800 characters.
3. No digit sequence in the summary that is absent from the input payload — a cheap guard against invented statistics.

On rejection, the deterministic digest is used.

### 6.5 Deterministic fallback

Always available, and used verbatim when no key is present:

```
Week of 17–23 August. The house completed 79% of assigned chores.
Ravi (128 pts), Kumar (121 pts) and Vinoth (98 pts) earned 61% of the week's
points between them — down from 68% last week.
Suresh earned 20 of his 105 target and missed 4 chores.
Next week: Suresh's target rises to 157 points to clear his deficit.
```

Built by template. It is less readable than the model's version, and it is never wrong.

---

## 7. Call site 3 — Natural-language entry

**When:** the user types or dictates into the quick-add field. **This call never writes anything.** It returns a proposal that pre-fills a form the user must confirm.

**Extended in 3.0** from two intents to four: an absence and a meal are now
things a person can say, and both were already forms the app has.

### 7.1 System prompt

```
You convert a housemate's short message into a structured record.

There are exactly five possible intents:
- "expense": they spent money on something for the home
- "chore_done": they completed a household chore
- "absence": they will not be at home on some day or days
- "meal": they ate or cooked something
- "unknown": anything else

For an expense, extract the amount in rupees, the best-matching category from
the list provided, the date, and a short description.
For a chore, match to the closest chore in their current assignments.
For an absence, extract the start and end dates, and whether they are asking to
be excused from their chores or simply saying they will be away.
For a meal, extract the name of the dish, whether it was cooked at home, bought
or ordered, any cost mentioned, and who ate it if they say.

Relative dates resolve against the "today" value given. "Yesterday" is one day
before it. "Friday" means the next Friday on or after today.

If you are unsure, say so with a low confidence value. A wrong guess costs the
user more than an admission of uncertainty.

Return only JSON matching the schema.
```

### 7.2 User payload

```json
{
  "text": "paid 840 for vegetables yesterday",
  "today": "2026-08-23",
  "categories": ["Groceries", "Rent", "Utilities", "Gas", "Internet",
                 "Maid", "Eating out", "Household", "Other"],
  "my_open_chores": [
    { "id": "a1", "chore": "Mop common area", "date": "2026-08-23" },
    { "id": "a2", "chore": "Take out rubbish", "date": "2026-08-23" }
  ],
  "known_foods": ["Paruppu Sadham", "Curd Kolambu", "Chicken Biryani"],
  "members": [ { "id": "m1", "name": "Arun" }, { "id": "m2", "name": "Ruth" } ]
}
```

`known_foods` is the Home's library, capped at the fifty most recently eaten, so
"I made paruppu sadham" resolves to the existing entry rather than creating a
fifth spelling of it.

### 7.3 Response schema

```json
{
  "type": "object",
  "required": ["intent", "confidence"],
  "additionalProperties": false,
  "properties": {
    "intent":     { "enum": ["expense", "chore_done", "absence", "meal", "unknown"] },
    "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
    "expense": {
      "type": "object",
      "properties": {
        "amount_rupees": { "type": "number", "minimum": 0.01 },
        "category":      { "type": "string" },
        "date":          { "type": "string", "format": "date" },
        "description":   { "type": "string", "maxLength": 100 }
      }
    },
    "chore_done":   { "type": "object", "properties": { "assignment_id": { "type": "string" } } },
    "absence": {
      "type": "object",
      "properties": {
        "from_date":     { "type": "string", "format": "date" },
        "to_date":       { "type": "string", "format": "date" },
        "excuse_chores": { "type": "boolean" }
      }
    },
    "meal": {
      "type": "object",
      "properties": {
        "name":          { "type": "string", "maxLength": 60 },
        "source":        { "enum": ["home_cooked", "bought", "ordered", "other"] },
        "date":          { "type": "string", "format": "date" },
        "amount_rupees": { "type": "number", "minimum": 0 },
        "participants":  { "type": "array", "items": { "type": "string" }, "maxItems": 30 }
      }
    },
    "clarification": { "type": "string", "maxLength": 160 }
  }
}
```

Parameters: `temperature: 0.1`, `maxTokens: 400`.

### 7.4 Validation and confidence handling

| Check | On failure |
|-------|-----------|
| Category exists in the supplied list | Fall back to "Other" |
| Date within the last 180 days and not in the future | Fall back to today |
| Amount between ₹0.01 and ₹10,00,000 | Reject, ask the user to type it |
| `assignment_id` is in `my_open_chores` | Reject the chore intent |
| Absence dates are within 90 days and `to_date >= from_date` | Reject the absence intent |
| Meal `name` matches a `known_foods` entry after normalisation | Pre-select that library entry; otherwise offer it as new |
| Meal `participants` resolve to member ids in the payload | Drop the ones that do not; never invent a member |
| Meal date not in the future | Fall back to today |

**The absence case has one rule of its own.** An absence proposal pre-fills the
absence form and stops there — it never raises the decision. "I'll be away
Friday" is a sentence, and asking the Home to excuse Friday's chores is a
request. The user taps the request; the model does not.

| Confidence | Behaviour |
|-----------|-----------|
| ≥ 0.85 | Form pre-filled, save button enabled, values highlighted as suggestions |
| 0.70 – 0.85 | Form pre-filled, an amber note reading "Check these before saving" |
| < 0.70 | Empty form, with the `clarification` string shown as help text |
| `intent: unknown` | Empty form, no error, no blame |

**Under no circumstance does this path write a record without an explicit user tap.** This is the rule that makes an occasionally-wrong model harmless here.

---

## 8. Call site 4 — Rule parsing — **new in 3.0**

**When:** an Admin taps "Understand this" on the rule editor. **This call stores
nothing.** It fills in a form the Admin then edits and submits, and the rule
still needs the Home's governance before it is live (RL-03, RL-04).

**Why an LLM at all:** the alternative is thirty checkboxes. A Home's actual
rules are sentences — "nobody leaves unwashed vessels overnight" — and asking
someone to translate that into a condition and an action before they can write it
down is how a rules feature goes unused. The model does the translation; the
person owns the result.

### 8.1 System prompt

```
You convert a house rule, written in plain language by someone who lives there,
into a structured form they will then check and edit.

Extract:
- a short title, at most six words
- a condition: when does this rule apply
- an action: what should happen
- who it applies to
- a points weight or a money penalty, only if the text states one

Use only the condition kinds and action kinds listed. If the rule does not fit
any of them, use kind "other" and put the text in the description. That is a
correct answer, not a failure — most house rules are agreements rather than
automations.

Never invent a penalty. Never invent a deadline. Never broaden who it applies
to. If the text says "everyone", say everyone; if it says "whoever cooked", say
the responsible person.

Return only JSON matching the schema.
```

### 8.2 User payload

```json
{
  "text": "Nobody should leave unwashed vessels overnight. If someone does it, they must clean the kitchen next morning.",
  "condition_kinds": ["chore_missed", "state_at_time", "time_of_day",
                      "guest_present", "spend_exceeds", "other"],
  "action_kinds": ["task", "reschedule", "points_penalty", "money_penalty",
                   "notify", "other"],
  "applies_to_kinds": ["all", "role", "named_members", "room",
                       "assignee", "responsible_person"],
  "chore_templates": ["Cook dinner", "Clean kitchen", "Clean bathroom",
                      "Mop common area", "Take out rubbish"],
  "roles": ["admin", "co_admin", "member"],
  "rooms": ["R1", "R2", "R3"]
}
```

Per SEC-06 and the redaction contract, room **labels** rather than room names,
and no member names at all — a rule about a named person is written by the Admin
picking them from a list after the parse, not by the model reading a name out of
the text.

### 8.3 Response schema

```json
{
  "type": "object",
  "required": ["title", "condition", "action", "applies_to", "confidence"],
  "additionalProperties": false,
  "properties": {
    "title":      { "type": "string", "maxLength": 60 },
    "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
    "condition": {
      "type": "object",
      "required": ["kind"],
      "properties": {
        "kind":        { "type": "string" },
        "template":    { "type": "string" },
        "state":       { "type": "string" },
        "at":          { "type": "string" },
        "after":       { "type": "string" },
        "description": { "type": "string", "maxLength": 200 }
      }
    },
    "action": {
      "type": "object",
      "required": ["kind"],
      "properties": {
        "kind":        { "type": "string" },
        "text":        { "type": "string", "maxLength": 200 },
        "description": { "type": "string", "maxLength": 200 }
      }
    },
    "applies_to": {
      "type": "object",
      "required": ["kind"],
      "properties": { "kind": { "type": "string" }, "value": { "type": "string" } }
    },
    "weight_points": { "type": ["integer", "null"], "minimum": 1, "maximum": 100 },
    "penalty_paise": { "type": ["integer", "null"], "minimum": 0, "maximum": 1000000 }
  }
}
```

Parameters: `temperature: 0.2`, `maxTokens: 600`.

### 8.4 Validation

| Check | On failure |
|-------|-----------|
| `condition.kind` is in the supplied list | Coerce to `other` and keep the text |
| `action.kind` is in the supplied list | Coerce to `other` and keep the text |
| `applies_to.kind` is in the supplied list | Coerce to `all`, and flag the field for the Admin's attention |
| `template` names an actual chore template | Drop the reference; the Admin picks one |
| `weight_points` or `penalty_paise` present | **The source text must contain a number.** A penalty the model invented is stripped, silently, and the field is left empty. |
| Every field | Rendered as an editable form field, never as a saved value |

**The invented-penalty rule is the important one.** Everything else in this call
site is a convenience whose worst outcome is a form somebody has to fix. A
hallucinated "₹50" that an Admin skims past and submits is money, and the Home
would have acknowledged it. So the check is mechanical: no digit in the original
text means no number in the proposal.

### 8.5 Fallback

No key, `rule_parsing` off, or any failure: the endpoint returns
`{ "parsed_by": "manual", "proposal": null }` and the client shows the structured
form with the text the Admin already typed. This is **not** an error state, and
the interface must not present it as one — it is the ordinary way to write a rule
in a Home that has no AI configured (RL-08).

---

## 9. Call site 5 — Food ideas — **new in 3.0**

**When:** the Food and Today screens render their suggestion card, and on an
explicit refresh. **This call writes nothing** — not a meal, not an expense, not
a library entry, not a preference (FD-17).

**Why:** the deterministic recommender can only suggest what the Home has already
eaten. Two ideas it has not is a different and complementary thing, and keeping
the two visibly separate is what makes both trustworthy (FD-14).

### 9.1 System prompt

```
You suggest two meal ideas for a shared home, for their next meal.

You will receive where they live, what they usually eat, what they like and
dislike, what they have eaten recently, and how their food spending is going
this month.

Suggest two dishes they have NOT already got in their list of usual meals.
Prefer things that fit their region, the season, and their budget position.
Avoid anything containing an ingredient on their dislike list.

NEVER suggest anything containing an ingredient on their excluded list. Those
are allergies and restrictions, not preferences. If you cannot suggest two
dishes without them, return an empty list.

Give a realistic estimated cost per person in rupees, as a number.

Do NOT name a restaurant, a shop, a brand or a delivery service. Do NOT claim
anything is available nearby, open now, or on offer. You do not know that. Use
the location only to choose dishes and price ranges that make sense there.

Return only JSON matching the schema.
```

### 9.2 User payload

```json
{
  "location": { "city": "Chennai", "state": "Tamil Nadu", "country": "IN" },
  "meal_type": "dinner",
  "season": "monsoon",
  "popular_meals": ["Paruppu Sadham", "Curd Rice", "Chicken Biryani"],
  "liked_items": ["chicken", "rice", "paneer"],
  "disliked_items": ["bitter gourd"],
  "excluded_items": ["peanut", "prawn"],
  "recent_meals": [ { "name": "Chicken Biryani", "days_ago": 2 } ],
  "budget_state": "tight",
  "outside_food_frequency": "high",
  "typical_per_person_paise": 4500
}
```

No member names, no member ids, no amounts beyond a typical per-person figure,
and the city rather than the address. A food payload is the least sensitive of
the six and the redaction contract still applies to it in full.

`excluded_items` is the **union** of the restricted items of the people being
served (BR-226), flattened and unattributed: the model learns that this meal must
avoid peanut, never which member it belongs to or at what severity. It is health
information about a person, so the one form in which it may leave the system is
the one that cannot be traced back to them.

### 9.3 Response schema

```json
{
  "type": "object",
  "required": ["ideas"],
  "additionalProperties": false,
  "properties": {
    "ideas": {
      "type": "array",
      "minItems": 2,
      "maxItems": 2,
      "items": {
        "type": "object",
        "required": ["name", "description", "estimated_per_person_rupees", "items"],
        "additionalProperties": false,
        "properties": {
          "name":        { "type": "string", "maxLength": 60 },
          "description": { "type": "string", "maxLength": 120 },
          "estimated_per_person_rupees": { "type": "number", "minimum": 1, "maximum": 5000 },
          "items":       { "type": "array", "items": { "type": "string" }, "maxItems": 8 }
        }
      }
    }
  }
}
```

Parameters: `temperature: 0.8`, `maxTokens: 500`. The temperature is high on
purpose: this is the one call site where the point is novelty, and the validator
below is what makes that safe.

### 9.4 Validation — any failure drops the whole AI half

| Check | Why |
|-------|-----|
| Exactly two ideas | One idea means the call added half of what it was for |
| Neither name matches a library entry after normalisation | A duplicate means it suggested what the deterministic half already covers |
| Neither contains an item on `disliked_items` | The Home told us, and ignoring it is worse than showing nothing |
| **Neither contains an item on `excluded_items`** | The prompt asked; this check is the guarantee. Matching is the same canonical containment the recommender uses, so "peanut" catches "peanut oil". A prompt is a request and a filter is a guarantee — the model is never the last line here (BR-225) |
| Each estimated cost is between ₹1 and ₹5,000 | A number outside that is not an estimate |
| **No name or description matches the brand pattern** | See below |
| No description contains "near you", "nearby", "open", "available at", "order from", "delivery" | A claim about the world this system cannot verify |

The brand check is a deliberate blunt instrument: any capitalised multi-word
token sequence that is not a dish word, plus a maintained list of common chains
and delivery services. A false positive costs two suggestions; a false negative
puts a restaurant recommendation the app cannot stand behind in front of a Home
that will act on it (FD-19, BR-215).

### 9.5 Fallback

`{ "ideas": [] }` and `ai_available: false`. The library half renders alone, the
card is visibly complete, and **no error is shown anywhere** — a suggestion card
with two entries instead of four is not a failure state.

---

## 10. Call site 6 — Meal-name normalisation — **new in 3.0**

**When:** a name typed into Add Meal is close to something in the library but not
close enough for the deterministic matcher, which uses normalisation plus a
Levenshtein threshold (section 4.1 of [15-FOOD-SPEC.md](15-FOOD-SPEC.md)).

**Why:** "parupu rice" and "Paruppu Sadham" are the same dish and four edits
apart. A model knows that; an edit distance does not.

**The smallest call site in the product, deliberately.** One string in, one
candidate id or null out.

### 10.1 Payload and schema

```json
// request
{ "typed": "parupu rice",
  "candidates": [ { "id": "f1", "name": "Paruppu Sadham" },
                  { "id": "f2", "name": "Curd Rice" } ] }

// response schema
{ "type": "object",
  "required": ["match", "confidence"],
  "additionalProperties": false,
  "properties": {
    "match":      { "type": ["string", "null"] },
    "confidence": { "type": "number", "minimum": 0, "maximum": 1 } } }
```

Parameters: `temperature: 0`, `maxTokens: 60`. Candidates are capped at twenty,
by recency.

### 10.2 Validation and use

| Check | On failure |
|-------|-----------|
| `match` is one of the supplied candidate ids, or null | Treat as null |
| `confidence` ≥ 0.8 | Treat as null |

A match is **offered in the did-you-mean panel**, exactly as a deterministic
match is, and looks no different to the person reading it. It is never applied
silently, and the model's output never merges two library entries (FD-10,
BR-207). A wrongly merged food is worse than a duplicate: a duplicate can be
merged later, and a merge cannot be unpicked.

With no key or the capability off, the deterministic matcher runs alone, which
is what it does today and does adequately.

---

## 10A. Call site 7 — Shopping list generation — **new in 2.0**

**When:** a member taps "Generate from meals" on the Shopping List screen
(S-53), or when the weekly shopping-list job runs automatically.

**Why:** converting meal plans into a shopping list requires understanding
ingredients, quantities and pantry overlap — tasks where a model adds value
over a simple join.

### 10A.1 Payload and schema

```json
// request
{ "meal_plans": [ { "name": "Paruppu Sadham", "date": "2026-08-28",
                     "items": ["toor dal", "rice", "tomato"] } ],
  "pantry": ["rice", "oil", "salt"] }

// response schema
{ "type": "object",
  "required": ["shopping_items"],
  "properties": {
    "shopping_items": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "quantity", "unit"],
        "properties": {
          "name":     { "type": "string" },
          "quantity": { "type": "number", "minimum": 0 },
          "unit":     { "type": "string" },
          "meal_name": { "type": ["string", "null"] }
        } } } } }
```

Parameters: `temperature: 0`, `maxTokens: 500`.

### 10A.2 Validation and use

| Check | On failure |
|-------|-----------|
| Each item has a name, positive quantity, and unit | Drop the item |
| `meal_name` matches one of the supplied meal names, or is null | Treat as null |

Items already in the pantry are excluded by the model. The output is presented
for review before saving — never applied silently.

---

## 11. Cost and rate control

| Control | Value |
|---------|-------|
| Schedule call | 1 per Home per week, roughly 3,000 input and 1,500 output tokens |
| Digest call | 1 per Home per week, roughly 800 input and 400 output tokens |
| Parse call | Capped at 20 per member per day, roughly 300 input and 150 output tokens |
| Rule parse | Capped at 20 per Home per day, roughly 400 input and 300 output tokens. In practice a Home writes a handful of rules and then stops. |
| Food ideas | Capped at 10 per Home per day, roughly 400 input and 300 output tokens. Cached for the day and refreshed by the daily job, so the ordinary path costs one call per Home per day rather than one per screen view. |
| Meal normalisation | Capped at 30 per Home per day, roughly 150 input and 30 output tokens. Only reached when the deterministic matcher has already failed. |
| Shopping list | Capped at 5 per Home per day, roughly 800 input and 500 output tokens. Generated on demand or by weekly job. |
| Monthly ceiling, one Home | Under 500,000 tokens with all seven call sites on — still inside every listed free tier |
| Circuit breaker | Three consecutive failures disable LLM calls for that house for 1 hour, logged and shown in the admin view |
| Whose quota | The house's own key and therefore the house's own free tier. Nothing here is metered by the operator, and one house exhausting its quota cannot affect another. |
| Rate limits per provider | Free tiers limit requests per minute as well as per day. The six call sites are far below any of them, but the parse cap is enforced per member so that a shared house cannot spend the whole minute budget on one person's typing. |
| Kill switch | Six capability switches stop call sites individually; `house_settings.llm_scheduling_enabled = false` still stops schedule calls; removing the key stops everything for that Home; unsetting `LLM_API_KEY` stops the environment fallback |
| Daily food cache | The suggestion card reads a cached result refreshed by `refresh-food-suggestions` at 16:00. A screen view never triggers a call. This is what keeps the most-viewed AI feature off the per-request path. |

### 11.1 Failure modes

Every call site handles its own failures in its own section. This table is the
consolidated view — what the router does, once, for each way a call can go wrong.
The rule underneath all of it: **a degraded AI half is never a degraded product
half.** The deterministic result renders regardless.

| Failure | Detected by | What happens | What the member sees |
|---|---|---|---|
| Network error, DNS, connection reset | Adapter | One retry after 2s, then fail | The deterministic result alone |
| Timeout | 20s hard deadline per call, enforced by the router, not the provider | No retry — a slow call retried is a slower call | The deterministic result alone |
| HTTP 429 from the provider | Adapter | No retry. Counts as a failure toward the circuit breaker. The Home's key has hit the Home's quota; retrying spends it faster | The deterministic result alone; the admin view shows "provider rate limit" |
| HTTP 401/403 | Adapter | Immediate stop and the key is flagged per section 3.6 | The Admin is told the key needs attention. Other members see nothing |
| HTTP 5xx | Adapter | One retry after 2s, then fail | The deterministic result alone |
| Truncated response — output token limit reached mid-JSON | JSON parse fails, or `finish_reason` is a length stop | Discarded whole. **A partial object is never salvaged**, because the half of a proposal that arrived is not a smaller proposal, it is an unknown one | The deterministic result alone |
| Well-formed JSON, wrong shape | Zod schema | Discarded whole | The deterministic result alone |
| Right shape, fails a content check (section 5.4, 6.4, 7.4, 8.4, 9.4, 10.2) | Validator | Discarded whole. Checks are all-or-nothing per call site by design — a response that failed one check has demonstrated it is not following instructions, so its other fields are not evidence of anything | The deterministic result alone |
| Non-determinism between two calls with the same input | Not detected, and not treated as an error | Nothing. **Temperature is set per call site to what that call site is for** — 0 for meal normalisation and shopping-list generation, 0.1 for natural-language entry, 0.2 for rule parsing, 0.3 for the schedule proposal, 0.6 for the digest, 0.8 for food ideas, where novelty is the point. Where a varying answer would be visible as inconsistency, the result is **cached** rather than the temperature lowered: the food card is refreshed once a day by a job, not per view (section 11), so two members looking at the same screen see the same two ideas. A proposal is a proposal; it must be valid, not reproducible — every one of them is checked by a deterministic validator before anybody sees it | Consistent within a day |
| Three consecutive failures | Router | Circuit opens for that Home for 1 hour | Nothing new; the deterministic half was already all they were seeing |
| Cost drifting above the expected envelope | The per-call token counts logged in section 12, against the caps in section 11 | The daily caps are hard, enforced before the call, and per Home or per member as listed. There is no soft budget that can be overrun | A cap reached returns `RATE_LIMITED` on that call site only |

Two things this table deliberately does **not** do. It does not fall back to a
different provider — the key is the Home's and its choice of provider is theirs,
so a silent switch would spend somebody else's quota. And it does not queue a
failed call for later: every one of the seven call sites is either decorative or
has a deterministic equivalent that already ran, so there is nothing to catch up
on.

---

## 12. Observability

The admin schedule view exposes, from `llm_runs`:

- Acceptance rate over the last 12 generations
- The most frequent validation failure codes
- Average latency and token usage
- The last rejected proposal with its specific violated constraints

If acceptance rate falls below 50 percent over eight weeks, the prompt needs revision or the model needs changing. That threshold is the documented trigger for revisiting this document.

---

## 13. Testing

| Test | Assertion |
|------|-----------|
| No key configured | Every feature works; three endpoints return their deterministic path; zero errors logged |
| Registry integrity | Every `ProviderDescriptor` has a well-formed base URL, a `defaultModel` present in its own `models`, and a transport that exists |
| Round trip per transport | For each of the three transports, a mocked provider response is parsed, schema-validated and returned; a mocked 500 retries exactly once |
| Seal and open | A key encrypted for house A fails to decrypt with house B as additional authenticated data |
| Key version | A row sealed at version 1 still decrypts after version 2 becomes the write key |
| No plaintext path | With `LLM_KEY_ENCRYPTION_KEY` unset, saving a key fails and nothing is written |
| Key never leaves | No response body from any route, and no `llm_runs` row, contains the stored key or any substring of it beyond `key_last4` |
| RLS on credentials | An authenticated member selecting from `house_llm_credentials` gets zero rows; the same member reading `house_llm_config` gets the row without ciphertext |
| Admin only | A non-admin member calling `set_house_llm_credential` is refused by the database |
| Rejected key | A 401 from the provider sets `status = 'disabled'`, notifies the admin once, and leaves every feature on its deterministic path |
| Two houses, two providers | House A on Gemini and house B on Groq generate in the same run without either key touching the other's call |
| Redaction | Across the full test suite, no `llm_runs.input_payload` contains an `@`, a 10-digit number, or a UUID |
| Invalid proposal — missing instance | Rejected, deterministic schedule persisted |
| Invalid proposal — availability violation | Rejected, with `HC-1` in `validation_errors` |
| Invalid proposal — all work to one member | Rejected by the deviation check |
| Valid proposal | Persisted, `generator = 'llm'`, rationale stored |
| Malformed JSON | Handled, logged, no throw |
| Timeout | Handled at 20 s, deterministic path used |
| Digest hallucinates a name | Rejected, template digest used |
| Parse below 0.70 | Form is empty, clarification shown |
| Parse returns an unknown category | Falls back to "Other", still saveable |
| Circuit breaker | Three failures disable calls for an hour |
| **Router — capability off** | With `food_ideas` off and a valid key, `route()` returns null, no request is made, no `llm_runs` row is written, and the suggestion card renders its library half |
| **Router — no bypass** | No call site imports `resolveLlm` directly. Asserted by a source scan, because a bypass is invisible at runtime |
| **Parse — absence intent** | "I'll be away Friday" pre-fills the absence form and **raises no decision** |
| **Parse — meal intent** | "I made paruppu sadham today" resolves to the existing library entry rather than proposing a new one |
| **Parse — invented member** | A participant the model returns who is not in the payload is dropped, not created |
| **Rule parse — no key** | Returns `parsed_by: 'manual'`, the form renders, and the rule module is fully usable |
| **Rule parse — invented penalty** | Text containing no digit produces a proposal with `weight_points` and `penalty_paise` both null, whatever the model returned |
| **Rule parse — unknown kind** | Coerced to `other` with the text preserved; never rejected, because most house rules are agreements rather than automations |
| **Rule parse — never writes** | Across the suite, no `home_rules` row exists that was not submitted by a person |
| **Food ideas — one idea** | The whole AI half is dropped; the library half still renders; no error |
| **Food ideas — library duplicate** | Same |
| **Food ideas — disliked item** | Same |
| **Food ideas — named restaurant** | Same, and specifically asserted against a fixture returning "Order from Anjappar" |
| **Food ideas — availability claim** | A description containing "near you" or "open now" drops the half |
| **Food ideas — never writes** | No `meals`, `foods`, `expenses` or `food_preferences` row in the suite has an AI origin |
| **Normalisation — offered, not applied** | A match at 0.95 confidence appears in the did-you-mean panel and creates nothing until a person taps it |
| **Normalisation — never merges** | No `foods.merged_into_id` in the suite was set by a model |
| **Six purposes** | Every `llm_runs` row's `purpose` is one of the six, and each of the six appears at least once across the suite |
| **Redaction, extended** | The rule-parse and food-ideas payloads are covered by the same scan: no `@`, no 10-digit number, no UUID, no member name, no Home name, no street address |
