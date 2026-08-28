# Implementation decisions

The ten design decisions the product rests on are in
[`docs/00-INDEX.md`](docs/00-INDEX.md) and are not restated here. This file
records the decisions taken *while building*, where the design left a choice
open or where reality pushed back on it.

Each entry states what was decided, what else was considered, and why. Entries
are append-only. A decision that turns out to be wrong gets a new entry
superseding it, not an edit.

---

## D-01 — Money is stored as integer paise, everywhere

**Phase 2.** Rupees exist only at the presentation boundary. Every column,
every function argument, every domain type is an integer count of paise.

Floating point was never a candidate. The real choice was between `numeric` and
`bigint`; `bigint` won because a currency with two decimal places has no use for
arbitrary precision, and an integer makes the exact-sum property test
meaningful rather than approximately meaningful.

---

## D-02 — Splits are computed once, at creation, and stored

**Phase 2.** `expense_splits` rows are written when the expense is written, and
never recomputed on read (BR-088).

The alternative — deriving splits from the expense and the membership at read
time — is tempting because it needs no rows. It is wrong because membership
changes. What the house saw when the expense was logged is what the house is
held to, and a derived split silently rewrites history every time somebody
moves out.

---

## D-03 — The rounding remainder goes out one paisa at a time, in member-id order

**Phase 2.** ₹1,240 across 8 members is exact; most amounts are not. The
remainder paise are distributed one each to the first *n* members by id.

Alternatives considered: give the whole remainder to the payer (arbitrary and
mildly punitive), or round each share and accept a total that differs from the
amount (breaks the invariant the whole ledger depends on). Ordering by member id
makes it deterministic, which matters more than making it fair — a remainder of
at most a few paise is not a fairness question, but a non-reproducible split is
a bug report.

A deferred constraint trigger refuses the write at commit if the splits ever
fail to sum to the amount.

---

## D-04 — A vacant room's rent is a house cost

**Phase 2.** When a room has no occupant, its share of the rent is split equally
across the whole house rather than absorbed by the other rooms.

Absorbing it into the occupied rooms punishes the people who happen to still
live in a half-empty room for a vacancy they did not cause. The house took the
lease; the house carries the gap.

---

## D-05 — Username resolution never runs in the browser

**Phase 1.** `POST /api/auth/signin` accepts a username or an email, resolves it
to an email server-side behind the service-role key, then signs in.

Anything that answers "which email owns this username" from the client is an
account-enumeration tool. For the same reason a failed sign-in returns one
message whether the identifier or the password was wrong.

---

## D-06 — Scheduled work runs inside the database, not on the web tier

**Phases 2 and 4.** `pg_cron` calls Supabase Edge Functions through a `call_edge`
helper that reads its URL and service key from a private `app_config` table.

A Vercel cron would have been less machinery, but it makes a scheduled job
depend on the web tier being awake and on a deploy having succeeded. Effort
weeks and recurring rent must close whether or not anybody has deployed lately.

The consequence, accepted deliberately: domain logic that a job needs is written
twice — once in `lib/domain/` for the app, once in Deno for the function. Deno
and Next.js do not share a module graph on the free tier, and the alternative —
the job calling back into the app over HTTP — reintroduces exactly the
dependency this decision exists to remove. Both copies are held to the same
worked examples in `docs/06-ALGORITHMS.md`.

---

## D-07 — A closed period is immutable in the database, not in the route handler

**Phase 3.** A trigger refuses writes against a closed period regardless of who
asks. The service-role key bypasses RLS entirely and is still refused.

Enforcing it in the API means the guarantee holds only for traffic that went
through the API. The point of the rule is that nobody — including a maintenance
script written in a hurry — can quietly amend a settled month.

---

## D-08 — A non-zero settlement sum blocks the close

**Phase 3.** If the netting does not sum to exactly zero, the close fails and
says so. It is never rounded away.

A rupee that appears or disappears in netting is a defect in the split
arithmetic upstream. Papering over it at the settlement stage hides the actual
bug and quietly moves money between members.

---

## D-09 — Availability is not an input to the points target

**Phase 4.** `computeTargets` takes presence and carry. It does not take
capacity. Capacity is used for the feasibility check (HC-1) and as a
low-priority tie-break in the solver, and nowhere else.

This is design decision 2 from the index, restated here because it is the rule
the implementation is most likely to drift on: every time the solver struggles
to place work on a busy member, lowering their target is the obvious fix. It is
also the fix that turns "my job is demanding" into the new way to opt out. A
busy member gets weekend-weighted work, not less work.

Declared absence is different, and does reduce the target — an away day is not
busyness, it is not being in the house.

---

## D-10 — An unplaceable chore goes to the open pool; generation never aborts

**Phase 4.** When no member can legally take an instance, the solver marks it
open, records it in `unassigned_count`, and carries on.

Aborting the run would mean one impossible chore costs the house its whole
week's schedule. Assigning it anyway would mean publishing a schedule that
violates a hard constraint, which costs more than any number of unscheduled
chores: one member assigned a morning chore when they leave at seven destroys
trust in every other assignment on the screen.

---

## D-11 — Auto-confirmation leaves `confirmed_by` null

**Phase 4.** When the auto-confirm window elapses, the row moves to `confirmed`
with `auto_confirmed = true` and `confirmed_by` left null.

Attributing it to the doer would violate the self-confirmation constraint, and
attributing it to the house admin would be a lie in the audit trail. Nobody
confirmed it; the clock did, and the record should say so.

---

## D-12 — Regenerating a week replaces only outstanding work

**Phase 4.** `publish_schedule` deletes the `assigned` and `open` rows for the
week and inserts the new plan. Rows that are `done_pending`, `confirmed`,
`missed` or `rejected` survive untouched.

Regeneration must never take away points somebody has already earned, and it
must never erase a miss. The alternative — refusing to regenerate a week once
anything has happened in it — makes the admin's only recovery from a bad
schedule "live with it until Sunday".

---

## D-13 — The weekly generation job publishes through its own service-role function

**Phase 4.** `publish_schedule` requires `current_member()` to be an admin,
which a service-role job has no way to satisfy — it carries no JWT, so
`current_member()` is null. Rather than weaken that check, the cron path calls
`publish_schedule_for_house(p_house_id, …)`: the same body, taking the house
explicitly, with `execute` revoked from `anon` and `authenticated`.

Considered and rejected: letting `publish_schedule` treat a null member as a
trusted caller. That turns a clear authorisation rule into one with an
exception, and the exception is exactly the case an attacker would aim for. Two
functions with two audiences is more code and less surface.

---

## D-14 — The generator writes the week's targets; only the points trigger writes the points

**Phase 4, corrected in phase 5.** `effective_target`, `base_target`, `carry_in`
and `present_days` are written into `effort_ledger` when a week is published.
`earned_points` and the counts are written only by the trigger on
`chore_assignments`, and generation never touches them.

The bug this fixes was silent and total. Nothing wrote a target, so
`close-effort-week` fell back to "target = whatever they earned", every
`carry_out` came out zero, no deficit ever followed anybody into the next week,
and the month-end penalty was always nil. The leaderboard showed a target column
of zeroes and nobody noticed, because zero is a plausible-looking number.

Splitting the writes by column is what makes regenerating a week mid-week safe:
the plan can be replaced without resetting what people have already done.

---

## D-15 — Residency and declared absence reduce a target; being busy does not

**Phase 5.** `presentDays` counts the days a member's residency covers, minus
the days they have declared away. It does not look at their hours.

This is D-09 made concrete, and it is worth stating separately because the two
halves arrive from different places and it is easy to wire the wrong one in. A
weekday-only member is genuinely not in the house at the weekend, and HC-4
already refuses them weekend work — leaving their target at a full week would
set them a figure they are structurally unable to meet. A member who leaves at
seven and returns at ten is in the house all week and owes exactly what
everybody else owes.

The phase-4 code passed `presentDays: 7` for everybody, which was wrong for
weekday-only members in the same direction: an unmeetable target.

---

## D-16 — A guest costs their host at least one whole chore

**Phase 5.** Each assignable guest present on a date adds their proportional
share of that day's common workload, taken cheapest-first, and always at least
one instance.

The share rarely divides. With eight members and a 35-point day, a guest's share
is 4.4 points and the cheapest job in the house is 15 — so registering a visitor
for one night puts a whole 15-point job on their host. Rounding to nearest
instead would give zero for any normal house, and a guest who creates no work at
all is the outcome the mechanism exists to prevent. The granularity of a chore
is the smallest unit the house has.

Room-scoped and skilled chores are excluded: a visitor does not create a second
bedroom, and their effect on dinner is a bigger dinner, which the expense split
already charges for. A guest marked unassignable produces nothing — an elderly
relative or a small child is a head in the food count and not a source of
chores, and pretending otherwise would make hosts stop registering them.

---

## D-17 — A guest's chores do not move when their host declares a day away

**Phase 5.** Declaring an away day redistributes that day's outstanding chores
to whoever is furthest below target. Instances carrying a `guest_id` are
excluded and stay with the host.

HC-7 makes the host the only person who may do that work, so the only
destinations available are back to the absent host or into an open pool nobody
is permitted to claim from. Neither is a redistribution. A member who is going
away and had registered a guest should cancel the guest, which removes the work
along with the head count.

---

## D-18 — Withdrawing an away day does not pull the chores back

**Phase 5.** Deleting an exception removes the declaration and nothing else.
The assignments that moved stay where they went.

Somebody has already been told the work is theirs, and taking it off a person
who agreed to cover is a worse outcome than a lightly under-loaded week for the
member who came back early. They can claim from the open pool if they want the
points.

---

## D-19 — A `create or replace` starts from the newest definition, not the nearest file

**Phase 6.** Migration 035 rewrote `create_house` from the copy in migration
017. That copy predates the chore engine, so the rewrite silently dropped the
`seed_default_chore_templates` call migration 028 had added. Every house created
in between started with no chores and generated an empty week.

Nothing caught it in review. What caught it was an integration test whose setup
reads the first chore template of a freshly created house and got null.

The rule, and the reason it needs writing down: Postgres has no partial function
update. Replacing a function means restating its whole body, and the body to
start from is whichever migration last touched it — found with
`grep -ln 'function <name>' supabase/migrations/*.sql`, not by scrolling up in
the file that happens to be open.

---

## D-20 — Revoking from `anon` and `authenticated` does not revoke anything

**Phase 6.** Postgres grants `execute` to `PUBLIC` on every function it creates.
Migrations 031 and 032 revoked `publish_schedule_for_house` from `anon` and
`authenticated`, which removed grants those roles had never been given
separately, and left the inherited `PUBLIC` grant untouched.

`publish_schedule_for_house` takes the house id as a parameter and deliberately
performs no admin check, because its caller is a cron job with no JWT (D-13).
Reachable from a browser session, those two properties compose into: any
signed-in user of any house can overwrite any other house's published week.

Migration 037 revokes from `public, anon, authenticated` on every service
function. The integration test named for D-13 had been asserting exactly this
and was passing for the wrong reason before migration 036 fixed the setup that
was skipping it.

---

## D-21 — A household has a shape, and it is chosen at creation

**Phase 6.** `houses.household_type` is `shared` or `family`. It selects the
defaults for two independent settings — `money_mode` and `penalty_enabled` — and
the vocabulary the interface uses. It constrains nothing by itself.

The alternative was to infer the shape from the settings, which reads well until
somebody has to write the onboarding screen: "do you split expenses, and do you
charge for missed chores" are two questions a person setting up an app for their
family cannot answer before they have used it. "Is this a flat or a family" they
can answer instantly, and it gets both defaults right.

Everything stays editable afterwards, and the settings are what the code reads.
The type is the question asked once.

---

## D-22 — Pot mode attributes the whole amount to the payer

**Phase 6.** In `money_mode = 'pot'` an expense splits one way: the entire amount
onto the member who paid it.

The obvious implementation was to skip `expense_splits` altogether. It fails
immediately — the deferred sum trigger demands the splits equal the amount, and a
missing set of rows sums to zero. Working around that would have meant a
conditional in the trigger, the balance view, the netting, the close and the
settlement screen: six places that must agree, forever.

Attributing to the payer needs none of them. Paid equals fair share for
everybody, so `computeBalances` yields all zeroes, `minimiseTransfers` yields no
payments, and the month closes with nothing owed — which is precisely what a
family means by a shared pot. One new enum value bought the whole feature.

The splitting bases remain available per expense. A family dividing a holiday
between the adults can, without changing the household's mode to do it once.

---

## D-23 — A dependent is a head, not an account

**Phase 6.** `house_members.member_kind` is `adult` or `dependent`. A dependent
may have a null `user_id`, carries their name on the membership row, and has
`shares_cost` and `does_chores` flags of their own.

An eight-year-old eats a share of the groceries and owns no phone. Modelling
them as a member with a login nobody uses puts a permanent unclaimed invite in
the member list; leaving them out entirely makes the per-head cost wrong in
every household that has one — which is most families.

Their share of an equal split lands on their guardian, in a third column,
`dependent_share_paise`. That is deliberately the same shape as a guest's share
rather than a new mechanism: the arithmetic was already written, already
property-tested, and already understood.

`does_chores` is separate from `shares_cost` because the two do not move
together. A teenager does chores and pays nothing. An elderly parent may pay a
share and be given no work.

---

## D-24 — A guardian may mark their dependent's chore done, and may not confirm it

**Phase 6.** `mark_chore_done` accepts the assignee or, where the assignee is a
dependent, that dependent's guardian. `confirm_chore` refuses both.

Without the first half, a chore assigned to a child can never leave `assigned`
and is marked missed every week — the schedule would quietly count a child's
bed against the house forever.

Without the second half, the peer-confirmation rule evaporates for any work
routed through a dependent: a parent marks and confirms in two taps, and the
whole check becomes theatre. `no_self_confirm` on the table only knows about the
assignee, and the assignee here is somebody who will never press anything.

---

## D-25 — A head only counts if somebody is on the hook for it

**Phase 6, fixing a phase-5 defect.** `splitEqual` counted every guest present
on the date in the divisor, then skipped charging any guest whose host was no
longer a participant. The base paise for that head were charged to nobody, the
shares came up short, and `computeSplit`'s own guard threw — turning a departed
host into a failure to log the shopping.

Guests and dependents are now resolved to a paying carrier *before* the head
count, and a head with no carrier is not counted at all. The guardian resolution
walks the chain with a visited set, so a cycle terminates instead of hanging.

The rule generalises: a head in the divisor is a promise that somebody pays for
it. Count them in the same pass that finds who.

---

## D-26 — Generated types live in their own file

**Phase 6.** `npm run gen:types` writes `lib/types/supabase.ts`. The hand-written
row and enum aliases live in `lib/types/database.ts`, which re-exports the
generated `Database` type and is what every caller imports.

They used to share one file, with the aliases appended after the generated
content. A regeneration deleted them and broke thirty imports at once, in a way
that looked like the schema had lost half its tables.

Anything a code generator owns, it owns completely.


---

## D-27 — The dispatcher runs every fifteen minutes, not hourly

**Phase 7.** Section 3.3 of the notifications spec says the dispatcher runs
hourly. It cannot.

N-02 is due thirty minutes before a chore window opens. With a sixty-minute
polling interval, a reminder scheduled for 19:00 is delivered at any point up to
19:59 — which is to say, potentially after the window it was warning about had
already opened, and in the worst case after the chore was already late. A
thirty-minute lead time and a sixty-minute poll are not compatible claims.

Fifteen minutes is the coarsest interval at which the lead time still means
something. The cost is four times the invocations of a function that returns in
milliseconds when there is nothing due, which is the cheapest thing in the
system.

The spec's figure was written before the reminder timing was; this is the two
being reconciled, not the spec being ignored.

---

## D-28 — Notification copy lives in the database, and in TypeScript, and a test
holds them together

**Phase 7.** A notification has to exist the moment its cause does. A chore
reaching `done_pending` at 21:04 must put a confirmation request in front of the
house at 21:04, not at the dispatcher's next wake — so the row is written by a
database trigger, which means the copy has to be renderable in SQL.

The client needs the same strings: the coalesced digest is assembled in the Edge
Function, and the preference screen names the categories. So they exist in
TypeScript too.

Two copies of thirty strings is a drift waiting to happen. The answer is not to
pick one home and contort the other half around it — it is to make drift fail
the build. `tests/unit/notifications-copy.test.ts` parses the `insert` in
migration 041 and compares every title, body, deep link, category, priority and
quiet-hours exemption against `lib/domain/notifications/`. Change one, and the
test names the other.

The single source of truth is not one location. It is one enforced agreement
between two.

---

## D-29 — Muting a category silences the phone, never the record

**Phase 7.** Every notification writes a feed row, whatever the member's
preferences say and whatever the member's devices do afterwards. The preference
governs the interruption, not the entry.

The alternative — suppressing the row too — makes the feed a record of what the
member happened to have switched on that week, which is worthless the first time
somebody says "nobody told me". With the row always written, "you were told, on
Tuesday, and here it is" is answerable from the app rather than from an argument.

It also means turning a category back on does not leave a hole in the history.

`enqueue_notification` therefore takes no preference argument at all. The
dispatcher is the only place preferences are read, and the only thing they can
prevent is a send.

---

## D-30 — Settlement cannot be switched off, and the padlock is visible

**Phase 7.** Six notification categories are preferences. The seventh,
settlement, is stored as a column for symmetry and forced true by
`set_notification_prefs` — and the route schema does not accept it either, so a
hand-written request changes nothing.

A member who has muted the app cannot then claim they were never told they owed
money. That is the whole of the reasoning, and it is a rule about the argument at
the end of the month rather than about notifications.

The settings screen shows the row with a padlock and that sentence, rather than
hiding it. A rule a member discovers by being surprised is a rule they resent; a
rule stated in advance is one they accepted.

---

## D-31 — Web Push is implemented against Web Crypto, not imported

**Phase 7.** `web-push` on npm is a Node library: it reaches for
`crypto.createECDH` and `Buffer`, neither of which exists in an Edge Function.
The choice was to shim a Node runtime into Deno, or to write the four steps the
RFCs describe — ECDH key agreement, HKDF, AES-128-GCM, and an ES256 JWT — against
the Web Crypto both runtimes already have.

`supabase/functions/_shared/webpush.ts` is the second option, at about two
hundred lines, with the RFC section numbers in the comments. It has no
dependencies, which for the one piece of the system that handles a private
signing key is worth more than the lines it saved.

`sendPush` never throws. A push service that is down, a subscription that has
expired and a payload that is too large all resolve to a result object, because
the caller is sending a batch and one dead device must not abort the other seven.

---

## D-32 — The approval notification fires at commit, not on insert

**Phase 7.** N-18 shipped reading "Your share: ₹—".

`create_expense` writes the expense row and then the split rows, inside one
transaction. An ordinary `after insert` trigger on `expenses` runs between those
two statements, at a moment when the expense exists and its splits do not — so
the one figure in that notification the recipient actually cares about, their own
share, could not be read.

A deferred constraint trigger runs at commit instead, when every statement in the
transaction has completed. That is the whole fix (migration 043), and it
generalises: any notification about a row whose meaning depends on rows written
after it belongs at commit rather than on insert.

The dash had been there since the notification was written. It was found by
asserting the actual string in an integration test rather than asserting that
the notification existed — which is the difference between testing that a
notification fires and testing that it says something true.

---

## D-33 — The push encryption is tested by decrypting it

**Phase 7.** A push service returns 201 for any well-formed request. It does not
and cannot check the ciphertext, because it cannot read it — that is the point of
the scheme. So a mistake in the aes128gcm framing produces a successful send, a
browser that silently discards the message, and a member who is simply never
notified, with nothing anywhere reporting an error.

`supabase/functions/_shared/webpush_test.ts` therefore plays the receiver. It
generates a subscriber key pair, hands the public half to `encryptPayload`, and
decrypts the result the way a browser would — ECDH, HKDF, AES-GCM, and the
trailing record delimiter. It also verifies the VAPID token's signature with the
public key and checks the audience is the push service's origin rather than the
endpoint path, since a token scoped to the full path would leak which
subscription it was minted for.

`encryptPayload` and `vapidHeader` are exported for no other reason. That is a
fair trade: the alternative proof is a physical Android phone, which is not a
test.

---

## D-34 — One channel that reaches every device, not two channels

**Phase 2 correction (2026-08-26).** “One channel” means one in-product
notification policy and one device register, not one wire protocol. Browser and
PWA devices continue to use Web Push/VAPID. Android and iOS clients must use
their native push providers and token lifecycle behind a provider-neutral
adapter. Native tokens must not be stored as browser Web Push endpoints, and
native provider credentials must not be treated as VAPID keys.

**Phase 7, revised.** Phase 7 shipped a Telegram bot as the second delivery
channel: a member linked their chat with a one-time code, and the dispatcher
sent them a copy of every push. It was removed before it was ever switched on.
No bot token was ever configured, so nothing was delivered through it and no
member had a link to lose.

The reason to remove it is that the problem it solved has a better answer. It
existed because push does not always arrive — a browser without permission, a
laptop that is closed, a phone that never installed the PWA. A native app
answers all three, and it answers them *inside the product*. It is another
registered device and another adapter call, not another user-facing
notification channel. The transport differs by platform, so the device model
must retain provider/token metadata rather than pretending every device is a
browser subscription.

What a second channel actually costs is worth naming, because it is easy to
think of it as free reach. It is a second copy of every piece of copy, in a
second formatting dialect. It is a second failure mode in the dispatcher, on the
hot path, in a loop that must not throw. It is a second place a member has to go
to stop being interrupted — and a member who mutes a category in the app and
still gets messaged has not been given a preference, they have been given a
bug. It is a third party in the delivery path for notifications that say what
somebody owes. And it is an account, a token and a webhook secret in the setup
runbook of a product whose other secrets are all generated locally.

Against that, the reach it added was reach the house already had by another
route.

What replaces it is not another channel but a better register of devices.
`push_subscriptions` now carries `platform` and `last_seen_at`, and settings
lists every device with a readable label, when it was last used, and a control
to remove it. That is the honest answer to "where does the house reach me" —
previously unanswerable, because the table counted subscriptions and named
none of them.

The migration is a deletion rather than a deprecation for the same reason the
feature was cheap to remove: nothing depended on it. A channel kept switched off
"in case" is a channel nobody tests, and the first person to switch it on
discovers it broke three phases ago.

---

## D-35 — The LLM key belongs to the house, not to the deployment

**Phase 9, planned.** `docs/10-LLM-SPEC.md` v1.0 read the key from
`LLM_API_KEY`, which made AI features a property of whoever ran the server. The
plan now takes provider, model and key from the house admin during house
creation, stores them encrypted per house, and keeps the environment variable
only as a fallback.

Three facts pushed this. The free tiers that make the feature affordable are
granted per account, not per application — a shared deployment on one operator
key hits one shared rate limit, and the first house to generate a schedule on a
Sunday evening spends the minute budget of every other house. The product is
meant to be run by the people who live in the house, and asking them to redeploy
with an environment variable set is asking for something most of them will not
do, while asking them to paste a key into a field during setup is the same
gesture as every other setup step. And a key someone else is paying for is a key
whose spend nobody in the house can see; a key the house minted is one they can
revoke.

What was considered and rejected: an operator key with per-house quotas, which
means metering, which means the operator carries a bill and a rate-limiter for a
feature that is optional; and no key at all, shipping only deterministic output,
which is a smaller product than the roadmap promised.

The cost of the decision is that HouseOS now stores a third-party credential.
That is why the key is sealed with AES-256-GCM under a server-only master key,
with the house id as additional authenticated data, why `house_llm_credentials`
has row-level security and no `select` policy for any role, and why the UI reads
a view that stops at the last four characters. A database dump on its own does
not yield a working key.

The environment fallback stays because a single-house self-host is a real
deployment shape and because the test suite and the developer machine need a
path that does not involve a database write.

---

## D-36 — A provider is a data row, and there are only three wire formats

**Phase 9, planned.** The provider list — Gemini, Groq, OpenRouter, Hugging
Face, Cerebras, Mistral, OpenAI, Anthropic, and a custom OpenAI-compatible URL —
is a `ProviderDescriptor[]` in `lib/infra/llm/providers.ts`, not a set of
classes and not a switch statement.

The reason it works is an accident of the market that is worth relying on: the
overwhelming majority of inference services expose OpenAI's `/chat/completions`
shape. What differs between Groq and Cerebras and OpenRouter is a base URL, a
model id and the free-tier note, and none of that is code. Only Google and
Anthropic need their own request builders, so the whole surface is three
transport modules.

The alternative was one adapter class per provider, which reads as the tidier
object model and is in practice eight near-identical files that drift. The one
this rejects more firmly is an SDK per provider, each with its own dependency,
its own release cadence and its own opinion about retries — against an adapter
whose entire contract is one `fetch`, a 20-second timeout and one retry.

The test that keeps this honest is a fixture over the registry rather than over
any provider: every descriptor must have a well-formed base URL, a default model
that appears in its own model list, and a transport that exists. Adding a
provider is that entry, one line in a check constraint, and nothing else — which
is the property the decision exists to buy.

Model lists are offered, not enforced. Provider catalogues change monthly and
this repository does not, so the picker accepts a typed model id and lets the
provider be the one to reject it — surfaced by the verify call before anything
is saved, rather than by a failed schedule generation on a Sunday night.

---

## D-37 — The breaker and the parse cap live in memory, the credential's state lives in the database

**Phase 9, built.** Two pieces of phase-9 state are deliberately per process and
lost on a restart: the circuit breaker (three consecutive failures stop calls
for that house for an hour) and the natural-language parse cap (twenty per
member per day). Two pieces are in Postgres and shared by every instance: the
credential's `status`, and its `last_error`.

The split is by what the state is for. The breaker exists so that a house whose
key was revoked stops paying twenty seconds of latency per generation to be told
so again — a latency guard, and a cold instance that re-learns it after three
more failures has lost nothing but three calls. The parse cap exists so that one
person's typing cannot spend a free tier's per-minute budget; the cost of a
miscount after a deploy is a handful of 300-token calls, and the alternative is
a database row per keystroke.

`status` is different, because it is shown to a person. "The key was rejected,
AI features are off until it is replaced" is a sentence the settings page has to
be able to say on any instance, an hour later, after a restart — so it is a
column, written by the service role, and the admin notification (N-31) fires
exactly once on the transition into `disabled`.

The rejected alternative was a `llm_breaker_state` table updated on every call.
It makes every LLM call a write, and it buys correctness for a value whose whole
purpose is to avoid a wasted twenty seconds.

---

## D-38 — A rejected key does not fall back to the operator's

**Phase 9, built.** `resolveLlm` reads the house's own row first, the
environment variables second, and returns `null` third. What it does *not* do is
treat a `disabled` house row as absent and carry on with `LLM_API_KEY`.

A house that has entered a key has chosen a provider and an account. If that key
is revoked, exhausted or mistyped, spending the operator's quota instead is not
a fallback — it is a surprise, and on a multi-house deployment it is one house's
mistake becoming another's bill. The environment fallback exists for the
single-house self-host and for development, which are precisely the cases where
no house row exists at all.

The visible consequence is the one the specification asks for: the house sees a
banner in settings, every feature runs its deterministic branch, and nothing
else in the product changes.

---

## D-39 — The interface says Home, the schema says house

**Specification 2.0, planned.** Every user-facing string is "Home". Every table,
column, function, API path and type keeps `house`: `houses`, `house_id`,
`house_members`, `is_house_member`, `/api/houses`. New tables introduced by 2.0
use the domain's own word — `home_rules`, `meals` — and still carry `house_id`.

The alternative was a rename. It is forty-plus applied migrations, every RLS
policy, every repository, every generated type and every test fixture, in
exchange for a word no user ever sees. Worse, it is the kind of change that is
95 percent mechanical and 5 percent load-bearing, and the 5 percent is
`is_house_member` — the predicate the whole isolation model rests on. Renaming
that during a period when sixteen new tables are being added is how a policy ends
up pointing at the wrong function.

What makes the split safe rather than merely cheap is that it is total and
written down. There is no table where the interface word leaks into the schema
and no screen where the schema word leaks into the interface, and
`docs/01-BRD.md` section 0.1 carries the mapping so nobody has to infer it.

The cost is real and worth naming: somebody reading the code for the first time
has to learn one translation. That is a paragraph. A half-finished rename is
forever.

---

## D-40 — One decision engine, not eight approval flows

**Specification 2.0, planned.** Settlement close, settlement reopen, member
removal, rule changes, governance changes, balance adjustments, absence requests,
join requests, expense approvals and chore confirmations all write to the same
three tables: `decisions`, `decision_participants`, `decision_responses`. The
domain module `lib/domain/governance/` knows nothing about what any of them mean.

The obvious implementation is a flow per feature, and it is obvious because each
one arrives separately and each one looks slightly different when it does. An
absence needs one approver; a close needs acknowledgements; a removal needs a
subject excluded from its own vote. Four of those built independently produce
four meanings of "approved", four places to forget the self-exclusion rule, and
four different answers to what happens when somebody never responds.

The generic version costs a participant-selection function with a case per type —
about eighty lines, all of it in one file where the differences are visible side
by side. What it buys is that the Approvals surface is one query, Approve All is
one rule, the notification catalogue has one entry per event rather than per
feature, and "no one person can complete a Critical decision" is a property of
one resolver rather than a claim about eight.

The thing it deliberately does not generalise is the *effect*. Each decision type
has its own apply function, because closing a month and activating a rule have
nothing in common and pretending otherwise would produce a dispatcher nobody can
read.

---

## D-41 — Approval and acknowledgement are different response kinds

**Specification 2.0, planned.** A response is `approve`, `reject` or
`acknowledge`. An approver can refuse; an acknowledger can only delay. A check
constraint refuses `acknowledge` paired with a rejecting capacity, and the
reverse.

Both alternatives fail in the same direction from opposite ends. Requiring
approval everywhere gives every member a veto over the month closing, which means
one person in a bad mood can stop the settlement — and the first time that
happens the Home stops using the app for money. Requiring nothing but an Admin's
click is the model version 1.0 had, which is how the app becomes "his app".

Acknowledgement is the middle, and it carries most of the load in the default
matrix precisely because most Critical decisions are things the Home is entitled
to *know* rather than to *block*. The Admin is empowered to close August; the
Home is entitled to be told it is happening and to have that recorded.

Where a veto genuinely belongs — a balance adjustment between two people, a
member's removal — the matrix asks for approvals, and it asks the people
affected.

---

## D-42 — Approval and application are separate states, and the database refuses the second

**Specification 2.0, planned.** A decision moves `waiting → approved` when the
responses are in, and `approved → applied` in a separate transaction. The effect
runs inside `apply_decision`, a `security definer` function that re-checks the
status and the mandatory responses itself, with `execute` revoked from `public`,
`anon` and `authenticated`.

Applying the effect in the same statement that collects the last response is
simpler and wrong in two ways. It loses the distinction between "the Home agreed"
and "it happened", which are different facts with different timestamps and which
come apart in practice: a close approved on Thursday whose balances no longer
net, a removal approved for the last remaining Admin. Those need to leave a
record saying the Home agreed and the world had moved, not a rollback that erases
the agreement.

The second way is the one D-20 already taught. A rule enforced only in the route
handler is a rule that holds for traffic that went through the route handler.
"The Admin cannot do this alone" is the claim this whole version of the product
makes, and it has to survive a maintenance script holding the service-role key —
which means the refusal lives in a function that key cannot call, and the tests
attack it with that key rather than through the API.

---

## D-43 — The confirmation quorum scales with the Home, and auto-confirm survives it

**Specification 2.0, planned.** One eligible confirmer needs one confirmation;
three to five need two including an Admin or Co-Admin; six or more need three
including a lead. The requirement is computed and stored on the assignment when
it is marked done, and the auto-confirm window applies at every size.

Version 1.0's single peer confirmation is too weak in an eight-person house —
whoever is nearest taps approve, and the check becomes a formality — and the
requested "admin plus two others" is impossible in a house of three. Neither is
wrong; they are answers to different house sizes, and the product serves both.

Snapshotting at "done" rather than evaluating at "confirm" is the part that looks
like a detail and is not. Without it, a member joining on Tuesday raises the bar
on work done on Monday and a member leaving lowers it, so the same chore can need
two signatures at 21:00 and three at 21:05 — which is indefensible to the person
who did it.

Keeping auto-confirm is the part most likely to be argued away later, so the
reasoning is worth stating plainly: a quorum that requires an Admin's signature
and never times out hands every Admin a veto over everybody's points. That is
design decision 3 from the index, and it is the exact failure the confirmation
mechanism exists to prevent. A stronger quorum without a timeout is weaker than a
weak quorum with one.

---

## D-44 — Membership begins with a request, and nothing creates one for somebody else

**Specification 2.0, planned.** A Home issues an invite link. A person opens it,
signs in as themselves, and asks. An Admin or Co-Admin accepts. There is no
endpoint that manufactures a membership for another person, and the test that
protects this enumerates the route tree rather than trying one call.

Version 1.0 had an admin-adds-member flow alongside the invite code, and it is
the more convenient of the two: the Admin knows who lives there and can just type
them in. What it produces is a member list full of accounts nobody has claimed, a
person whose first experience of the app is being told they are already in it,
and an Admin who has, structurally, spoken on somebody else's behalf. In a
product whose central claim is that important decisions are shared, the very
first record about a person should not be one they did not make.

`Requested` is a state with no role at all rather than a role with no
permissions, and the two are enforced against each other by a check constraint in
both directions. That is what makes RLS the whole implementation: `status =
'active'` inside `is_house_member` means a requested person gets zero rows from
every table without a single special case anywhere.

The one exception is a dependent, created by their guardian because there is
nobody to send a link to. It is safe for the same reason it is necessary: a
dependent has no account and no permissions, so nothing is being said on their
behalf that they could have said themselves.

---

## D-45 — A removal that cannot settle becomes Inactive rather than failing

**Specification 2.0, planned.** An approved removal checks the member's money.
Clear, and they are removed. Not clear, and they become `inactive` with
`pending_settlement = true`, keep appearing in the money views and in
settlements, and are removed automatically when the last payment is confirmed —
by a trigger on settlement confirmation, and again by a daily job.

The alternatives are both bad in ways the Home feels. Refusing the removal until
the money is settled means somebody who has physically moved out keeps receiving
chore assignments; the Home's answer to that is to stop trusting the schedule.
Removing them and writing off the balance means the app decided to forgive a debt
nobody agreed to forgive, which is the single most damaging thing a shared-money
product can do.

Two mechanisms complete it rather than one, deliberately. The trigger handles the
ordinary path and is instant; the daily job catches a balance cleared by an
adjustment, by a reopen, or by a path that did not exist when the trigger was
written. A state that exits through only one code path is a state people get
stuck in.

---

## D-46 — A rule is text first, structure second, and AI never activates one

**Specification 2.0, planned.** `home_rules` stores what the Admin typed,
verbatim and forever, alongside a parsed structure they edited. Activation
happens only through an approved decision, and a version row with `activated_at`
set and `decision_id` null is refused by a check constraint.

The tempting version is a rules *engine*: a condition vocabulary, an action
vocabulary, an evaluator, and a screen of dropdowns. It fails at the first real
rule, because the real ones are "nobody leaves unwashed vessels overnight" and
the honest structured translation of that is `kind: other`. A Home that cannot
write down the rule it actually has will not use the feature, and a feature that
only accepts the four rules the engine can execute is a configuration screen
wearing a costume.

So version 2 executes exactly two structured kinds and *records* everything else.
A written rule the Home agreed to — versioned, dated, and pointed at during an
argument — is most of the value. Pretending the app enforces more than it does
would be worse than admitting it enforces two things.

AI's role is narrow for the same reason it is useful: it turns a sentence into a
first draft of the structure, which removes the only genuinely tedious step. It
never activates anything, and the one mechanical guard on its output is that a
penalty is stripped unless the source text contains a digit. Every other
hallucination costs somebody a form correction; an invented "₹50" that gets
skimmed past is money the Home then acknowledged.

---

## D-47 — A meal is a named thing, and food is loosely coupled to money

**Specification 2.0, planned.** `meals` carries a name, a source, items,
participants and its own costs. It may reference an expense and an expense may
reference it; neither is required, neither cascades, and the recommender reads
the money module while nothing in the money path reads food.

Modelling food as breakfast, lunch and dinner produces a diary nobody has an
opinion about — "dinner" is not a thing anyone likes or dislikes, and it cannot
be suggested. Modelling it as an expense category produces a number with no
information in it. The named meal is what makes preference, repetition, cost per
person and suggestion all expressible, and it is what people actually say to each
other.

The loose coupling is the rule most likely to be eroded by a well-meaning later
change, so it is worth naming the failure it prevents. Making a food expense
require a meal record adds fields to the most-used flow in the product, and the
ten-second expense entry is the thing the entire ledger depends on. Making a meal
create an expense automatically means every home-cooked dinner generates a debt
between flatmates who split the groceries a week ago. Both are one small step
from where the schema already is, and both are why the arrows point one way.

Per-person cost divides by participants rather than Home size for the same reason
the expense split counts heads: a meal three people ate is not a cost the other
five incurred.

---

## D-48 — Two from the library, two from AI, visibly separated

**Specification 2.0, planned.** The suggestion card shows exactly two meals
computed deterministically from the Home's own history, and at most two ideas
from a model, in two labelled groups that are never interleaved. Any validation
failure drops the AI half entirely and the library half renders alone.

One blended ranked list is the version that looks better designed. It is worse,
because the reader cannot tell which suggestions are grounded in what the Home
has actually eaten and which the model invented — and the moment one invented
suggestion is obviously wrong, the grounded ones lose their credibility too. The
separation is not a layout choice; it is what lets a Home trust half a card while
distrusting the other half, which is the correct posture towards both.

The cold-start rule follows from the same reasoning. With fewer than five
recorded meals the library half says so and shows recent meals, rather than
ranking three data points or quietly handing its slot to AI. A card with two
entries and an honest sentence is better than four entries where nobody knows
which two were real.

---

## D-49 — Six call sites, one router, and a switch per capability

**LLM specification 3.0, planned.** `route(houseId, capability)` is the only way
a call site obtains a provider. It is `resolveLlm` plus one check of the Home's
capability flag, and a source scan asserts that nothing outside
`lib/infra/llm/` imports `resolveLlm` directly.

Adding three call sites — rule parsing, food ideas, meal-name normalisation —
without this produces three more places that each decide independently whether AI
is available, and the per-Home capability switches promised by AI-02 become three
switches somebody has to remember to check. A four-line function that is the
*only* entry point makes that enforceable by a grep rather than by care.

The switches themselves exist because the six features are not one preference. A
Home may reasonably want food ideas and not a model's opinion on its rota, and
the two have nothing in common except a key. A capability that is off behaves
exactly as no key at all, for that feature alone — no banner, no upsell, no
error — which keeps the deterministic path the ordinary path rather than a
degraded one.

The food card is cached daily by a scheduled job rather than computed on view,
which is what keeps the most-looked-at AI feature off the per-request path
entirely.

---

## D-50 — Insights is one filtered screen, and a report is not a destination

**Specification 2.0, planned.** One screen with a period control, a type control
and two filters, replacing the four-tab analytics page. Daily, weekly and monthly
reports are not separate routes and are not in the More menu.

The natural growth of an analytics feature is a page per question: daily spend,
weekly effort, monthly food, budget report, member report. Eight of those is a
menu nobody reads, and each one is the same three transformations over a
different date range. The filters make the combinations reachable without making
them navigable, which is the difference between a product with twelve screens and
one with sixty.

The related rule — that primary navigation carries six destinations and Approvals
displaces Insights whenever something is pending — comes from the same place.
Insights is the only primary destination that is never urgent, so it is the one
that yields its slot. A pending decision two taps deep is a decision that lapses.

---

## D-51 — the pending-schema overlay, rather than an edited generated file

**Phase 10.** `lib/types/supabase.ts` is generated by `npm run gen:types`, which
reads a **migrated** database. A migration that has been written and not yet
pushed therefore cannot be in it, and hand-editing the file is forbidden for the
reason D-26 records: a regeneration overwrites it wholesale and took thirty
imports with it the last time something hand-written lived there.

`lib/types/schema-pending.ts` is the delta, and `lib/types/database.ts` merges it
into the `Database` type every Supabase client in the app is instantiated with.

The alternative was the `LooseClient` cast phase 9 used for
`house_llm_credentials` — an untyped client confined to one repository file. That
is right for two tables behind one module. It is wrong for phase 10, where the
change is a *renamed enum value* across twenty-four call sites: an untyped client
would have made `'pending'` compile everywhere and fail at run time on the first
insert. The overlay turned the same rename into twenty-four compile errors in one
run, which is the whole reason to have types at all.

The cost is a file that must be pruned after every `gen:types`. It says so at the
top, and anything left in it afterwards is either a mistake or a migration
somebody forgot to push — which is a useful thing for a file to be able to tell
you.

---

## D-52 — an authorised-write flag, not an `auth.uid() is null` exemption

**Phase 10.** `assert_member_field_privilege` refuses a change to `role`,
`status` or `left_date` unless `is_house_admin` says yes. `is_house_admin` reads
`auth.uid()`. The `complete-pending-removals` cron job has no JWT, and phase 11's
decision effects act for the Home rather than for whoever cast the last response,
so both would have been refused by a trigger written to stop a member editing
their own row.

The obvious fix — exempt callers with no `auth.uid()` — makes the service-role
key a way around the trigger. It is already a way around RLS, and D-42 is the
decision that says the database must hold what RLS cannot: a key that bypasses
policies must not also bypass invariants.

So the exemption is a transaction-local setting, `app.member_write_authorised`,
set by `begin_member_removal` and by nothing else. It cannot be set by a client,
it cannot leak into the next statement on a pooled connection, and it is granted
by the code path that has already established the authority rather than by the
absence of a session.

The last-Admin guard sits **outside** the exemption, deliberately. No decision
should be able to leave a Home unable to change its own settings either.

---

## D-53 — a link and a request, not a code and an approval

**Phase 10, from HM-06.** Version 1 had a six-character invite code and a
`pending` membership: typing the code created a member row that an admin then
approved. Version 2.0 has a 144-bit link and a join request, and the difference
is not cosmetic.

Under the old model a person existed in the Home before anybody agreed to it. The
row was there, in a state every query had to remember to exclude, and "is this
member pending?" became a condition in the member list, the expense split, the
availability form and four screens besides. Any one of them forgetting it was a
leak.

Under the new model a person who has asked has a `join_requests` row and **no
membership at all**. `is_house_member` already required `status = 'active'`, so
the whole of HM-07's "no permissions of any kind" is that one predicate, with no
second code path anywhere and nothing for a new query to forget.

The link replaces the code because the code was doing two jobs badly: it was
short enough to be read over a phone and therefore short enough to be guessed,
and it was permanent, so revoking access meant changing what everybody had. The
link is opaque, rotatable, and worth nothing on its own — possession lets you
ask, and asking is not joining (SEC-15).

`houses.invite_code` stays, because the specification retains it. Nothing reads
it as a credential.

---

## D-54 — the resolver is duplicated into SQL, the selector deliberately is not

**Phase 11.** Migration 051 restates `resolve.ts` as `resolve_decision()` in
PL/pgSQL, and stops there. The participant selector — fourteen cases of who is
asked, in which capacity, and who is excluded — stays in TypeScript alone.

The two halves are not the same kind of rule, which is why they get different
treatment under D-06.

The resolver answers "what is this decision now". That question has to be
answered correctly by whatever wrote the last response, including a script
holding the service-role key and a future Edge Function that never loads the
application. A status that is only right when the write came through Next.js is
a status nothing can trust, so it is computed by a trigger in the same
transaction as the response.

The selector answers "who should be asked". That question is asked exactly
once, at proposal time, by a caller that is always the application — and it is
the half that is genuinely intricate, property-tested over randomised Home
sizes and role distributions. Restating it in PL/pgSQL would double the surface
without doubling the confidence, and the copies would drift on the first new
decision type.

So `create_decision` **validates the selector's output rather than recomputing
it**. Participants must be real, active members of this Home; the subject must
not be among them; and a Critical decision must have at least two distinct
people who could answer it. Those are the invariants that must hold whatever
produced the list, and they hold against a caller that skipped the selector
entirely. A wrong list is refused; a merely unusual one is allowed, because the
database is not the place that decides who a Home consults.

The consequence worth stating: `NOT_ENOUGH_PARTICIPANTS` is raised at proposal
time and not at resolution time. A Home is never asked to approve something
that could not have completed.

---

## D-55 — a decision effect carries its own authority, and no browser can run one

**Phase 11.** Every function in this schema that changes something asks who is
calling: `is_house_admin`, `is_house_lead`, `current_member`, all of them
reading `auth.uid()`. An applied decision has no such person. It is carried out
after the last response lands, possibly by a job with nobody logged in, and the
authority for it is the Home's answer rather than whoever happened to tap last.

Two things follow, and they pull in opposite directions.

`apply_decision` is revoked from `public`, `anon` and `authenticated`, and
granted to `service_role` alone. A browser responds; the server applies what the
responses produced. An `apply` a member could call directly would be an admin
action reachable by anyone the RLS policies let read the decision.

But the effect, once running, has to reach past checks written for people.
Removal already had an answer to this — migration 050's transaction-local
`app.member_write_authorised`, which lets the removal path through the
privileged-column trigger. Migration 053 generalises it as
`app.decision_effect`, set in exactly one place, inside `apply_decision`, after
every guard has passed and never before. `decision_effect_authorised()` is what
the reworked functions ask instead of dropping their permission check.

The guards are the point of the ordering. `apply_decision` re-derives from the
rows what `resolve_decision` recorded in `status`: no approver rejected, every
mandatory participant answered, and a Critical decision had two distinct
responders. It does this **even though the status already says `approved`**,
because the acceptance criterion is that it refuses a decision missing a
mandatory response *when called with the service-role key* — that is, when
called by something that could have written the status itself.

An effect that raises rolls the whole transaction back, including the `applied`
stamp. What the Home is left with is a decision that is still `approved` and an
effect that did not run, which is the state the specification asks for: a close
whose balances no longer net to zero, kept as an approval that could not be
carried out rather than as a half-applied one.

---

## D-56 — the proposal is the proposer's approval, written as a response

**Phase 11.** The participant selector lists the proposer as a mandatory
approver on every Critical decision. It could instead have left them out and
lowered the counts by one; both arrangements produce the same arithmetic.

Listing them is the version that keeps the record honest. A decision names
everybody it depends on, and "Ravi proposed this and Ravi approves of it" is a
fact worth storing rather than an inference a reader has to make from the
absence of a row. It also means the resolver has one rule instead of two: a
decision approves when its participants have answered, with no special case for
the person who asked.

So `POST /api/decisions` writes the proposer's `approve` response immediately
after `create_decision` returns, and writes it **through the caller's own
Supabase client** rather than the service-role one. The
`respond_to_own_decision` insert policy applies to it exactly as it does to
every other response: the decision must be waiting, the member row must be the
caller's own, and a matching participant row must exist. A proposal that
somehow produced a participant list not containing its proposer simply does not
get that row, rather than acquiring one by privilege.

The visible consequence: a two-person Home cannot remove somebody by one
person proposing it, because the proposer's own approval is one responder and
the floor is two. That is the property the version exists to protect, arriving
here as a natural consequence rather than as a separate check.

---

## D-57 — the server applies on the response's coattails, and an unbuilt effect is reported rather than raised

**Phase 11.** `apply_decision` is granted to `service_role` and to nobody else
(D-55), which settles who may run an effect but not when it runs. Three
candidates: a job that sweeps approved decisions, an explicit apply endpoint, or
the request that carried the last response.

It is the last one. `POST /api/decisions/:id/respond` re-reads the decision
after the insert, and if the trigger has moved it to `approved`, applies it with
the service-role client before answering. The alternative — approved decisions
sitting in a queue until a job notices — would mean a Home watching a removal it
has agreed to for up to an hour, and a member asking whether it worked. An
explicit apply endpoint would put the decision to run an effect back in a
browser, which is precisely what D-55 removes.

The consequence that needed a decision: **an effect that refuses does not fail
the response.** Most decision types have no effect built yet — the settlement
close, the rule change, the reserve — and `apply_decision_effect` raises
`EFFECT_NOT_IMPLEMENTED` for each of them. A member who has just acknowledged a
settlement close should not receive a 500 for having answered correctly. So the
handler catches the refusal, reports it as `applied: false` with the refusal
named alongside the decision, and leaves the row `approved` and visibly
unapplied — which is the honest state, and the same one the specification asks
for when a close is agreed and then cannot be carried out.

This is also why `applyIfApproved` re-reads the status from the database rather
than trusting what the domain resolver computed a moment earlier. The status is
the database's answer; the repository acts on it and does not second-guess it.

---

## D-58 — the quorum is snapshotted at "done", and the guardian ban covers rejecting too

**Phase 11.** Migration 054 replaces "any one peer confirms" with the table in
`docs/14-GOVERNANCE-SPEC.md` section 4. Two things in it were not settled by the
specification and are settled here.

**The snapshot is the whole design.** `confirmations_required`,
`requires_lead_confirmer` and the set of signatures live on the assignment
and in `chore_confirmations`, written once by `mark_chore_done` from
`chore_quorum_for()` and never recomputed. The alternative — reading the Home's
current size at confirmation time — has two failure modes that are invisible
until they bite. A person joining on Tuesday raises the bar for Monday's work,
which is a chore that was one signature from confirmed and silently is not any
more. A person leaving lowers it, which is points posting for a quorum that was
never met. Neither produces an error; both produce a number in the effort
ledger that nobody can account for. So the count is a fact about the moment the
work was declared done, in the same way `effort_points` on the assignment is a
snapshot of the template rather than a live read of it.

The visible consequence is deliberate: a Home that grows mid-window finishes
its outstanding chores on the old quorum, and only new work is asked for more.

**A guardian may not reject either.** The specification bans the guardian of a
dependent assignee from *confirming* their chore (D-24) and says nothing about
rejecting. Banning only confirmation leaves the guardian able to close the
chore out alone in the other direction: mark it done, reject it, mark it done,
reject it, and the dependent has two rejections and a miss with no other adult
ever involved. A rejection is not the safe half of a confirmation decision — it
is the half that costs somebody their points. `reject_chore` therefore refuses
the guardian for the same reason `confirm_chore` does, and both refusals live
in the function *and* in the `chore_confirmation_is_peer` trigger, so the
service-role key obeys them (D-06).

Two smaller points fall out of the same file. A Home with nobody to ask
confirms at "done" rather than waiting out the auto-confirm window — the window
exists to stop a stall, and there is nothing to stall on. And a rejection
deletes the signatures already given, because they were given for work that has
since been declared not done; the retry starts its quorum from zero.

---

## D-59 — the working agreements for the rest of the build

**Settled 2026-08-27**, before phase 11's remaining slices. These are not
product decisions; they are the process ones that had been made implicitly and
were producing a growing, unverified diff.

**A database comes before more features.** Migrations 045 to 054 have been
written and applied nowhere, so roughly fifty-six integration assertions skip
themselves and no governance screen has ever been opened against a schema that
contains its tables. Every further migration written in that state raises the
cost of the eventual first apply, because a failure in 047 blocks the seven
files after it and the failures arrive together rather than one at a time. So
feature work pauses: `supabase start` locally, apply 045 to 054, run the
integration suites, re-run `npm run gen:types`, and delete from
`lib/types/schema-pending.ts` every entry the regenerated file now covers —
which is also the check D-51 describes, since anything still in that overlay
afterwards is an unpushed migration.

**Local is the test target; the hosted project is not touched.** The
integration suites create and delete real users, and PROGRESS records a run
that failed on a dropped connection to the remote rather than on a defect. Both
problems have the same answer. `npm run db:push` against the hosted project is
a separate, explicitly requested action from here on, not a step in a
verification run.

**One commit per slice.** The tree had sixteen uncommitted files spanning the
governance engine, five route handlers, three screens and a migration — a diff
nobody could review as one thing, and a history that no longer matched
`PROGRESS.md`. Each slice is committed as it is finished, on `main`.

**One Playwright journey per phase, written with the phase.** The repository
tests pure logic as unit cases and database behaviour as integration cases; the
route handlers and screens between them have no automated coverage at all, and
the roadmap's definition of done asks for acceptance criteria demonstrated by
running them. Phase 11's journey is propose, respond, apply. A journey cannot
be written before the migrations are applied, which is another reason the
database comes first.

**AI stays house-owned.** A provider key is available when a call site needs
real verification, and it is pasted into the app's own AI settings panel, where
it is sealed against that Home. It does not enter the repository, `.env.local`,
a fixture or a test. `LLM_KEY_ENCRYPTION_KEY` is the only LLM value the
deployment holds, and it is a sealing key rather than a provider credential.

**Scope is the whole of specification 2.0.** Phase 11 is finished, then 12 to
15 in the roadmap's order. Nothing in phases 11 to 15 is being trimmed, so the
heavy money items — expected contributions and the reserve — stay in phase 11
rather than being deferred past the release gate.

The order phase 11's remaining slices are built in is cheapest-risk first: the
three governance jobs and notifications N-40 to N-46, which finish what is
already written; then the proposer entry points S-37; then absence requests;
then shared chore assignment; then governed close and reopen with balance
adjustments; and last the expected contribution and the reserve, which is the
only remaining slice that changes settlement arithmetic.

---

## D-60 — changing the confirmation policy is its own decision type

**Phase 11.** `house_settings.confirmation_policy` arrived with migration 054,
is read by `chore_quorum_for`, and is written by nothing. CE-10 says a Family
Home may reduce confirmation to a single acknowledgement or switch it off, and
today no Home can. There were three ways to make it reachable.

An Admin-only settings endpoint was rejected. It is the fastest, and it makes
this the one Home rule that changes without the Home agreeing — inside the
phase whose entire purpose is that important rules stop being one person's to
set. Switching confirmation off is not a preference; it is a decision to stop
checking each other's work, and the person most likely to want it is the person
whose work would stop being checked.

Extending `change_governance` was rejected for a narrower reason. Its effect
moves the nine `governance_policy` columns, and reaching one column on a
different table would mean restating a hundred and fifty lines of
`apply_decision_effect` for two, while making the audit trail of a governance
change ambiguous about which table it touched.

So `change_confirmation_policy` is the fifteenth decision type: Critical,
mandatory on the Admin and the Co-Admin, acknowledged by every active adult —
the same requirement as `change_governance`, because it is the same kind of
change — with its own effect writing the one column. It is added to
`lib/domain/governance/types.ts`, to the enum in migration 051 and to the level
matrix in the same change or in none of them, which is the rule that file's
header already states.

Migration 051 has never been applied to any database, so the enum value is
added to the `create type` in 051 itself rather than through an `alter type` in
a later file. That is only correct while 051 remains unapplied; after the first
apply, an added value needs its own migration, because `alter type … add value`
may not run in the transaction the Supabase CLI wraps each file in.

---

## D-61 — a Critical decision is proposed by a lead, and removal has one door

**Phase 11, the S-37 slice.** Two rules were implicit until the proposer entry
points made them reachable, and both had to be written down before a screen
could send a proposal.

**Who may propose.** Every Critical row of the matrix in
`docs/14-GOVERNANCE-SPEC.md` §3.3 reads "Admin (proposer), Co-Admin", but
nothing enforced it: `create_decision` checks that the caller is a member, and
the participant selector adds the proposer as a mandatory approver without
asking what role they hold. `DELETE /api/members/:id` asked for Admin before
phase 11, so leaving the proposal route open would have turned that check into
decoration — the same removal could be started by anybody through
`POST /api/decisions`. So the application refuses a Critical proposal from
somebody who is neither an Admin nor a Co-Admin. A Co-Admin is admitted as well
as an Admin because a Co-Admin is a mandatory participant on every Critical
decision anyway: one who proposes is reaching past nobody, and a Home whose
Admin is away should not be unable to raise anything.

This is an application rule, not a database one, which is the one asymmetry
worth naming. The invariants the database holds are the ones that must survive
a service-role key — who is asked, who may answer, and what "approved" means.
Who *asks* is not one of them: a proposal from the wrong person still cannot
complete without the people the engine names.

**Removal has one door.** Migration 050 shipped `remove_member(uuid)` as the
wrapper a person reached, and said in its own comment that phase 11 would drop
it. Dropping it alone would not have been enough. The privilege trigger let an
Admin write `status` and `left_date` directly and the RLS policy let a lead
update member rows, so an Admin with a PostgREST client could still deactivate
somebody without asking anyone — the exact thing BR-165 forbids. Migration 056
therefore drops the function *and* restates the trigger: an **adult** member's
`status` and `left_date` may only be written by something holding the
authorisation flag, which is a decision effect or the removal job that finishes
what a decision started.

Dependents are deliberately left on the Admin path. A dependent has no account,
no voice and no vote; removing one is an administrative correction, and
`DELETE /api/members/dependents/:id` does exactly that with a direct update.

The consequence worth stating plainly: **a two-person Home cannot remove
anybody.** The subject is never a participant and a Critical decision needs two
distinct responders, so the only other person is excluded and there is nobody
left to ask. That is the floor from §2.4 working as intended rather than an
oversight, and the sheet says so — the proposal is refused before it is made,
not after the Home has been asked to approve something that could never apply.

---

## D-62 — routine privileges are stated, not inherited

**Track B (OpenCode).** Migration 068 fixed table grants but deliberately omitted
routines. `supabase db reset` installs default `EXECUTE` on every routine for
`public`, `anon`, `authenticated`, `service_role`; `supabase migration up`
against a running stack does not. This created two opposite failures:
- Budget alerts: `check_budget_thresholds` callable by cron but not by browser —
  `permission denied` for authenticated callers.
- Notifications: `enqueue_notification` callable from browser — must be trigger-only.

Migration 080 fixes both by stating grants explicitly, following 068's pattern:
- Baseline `revoke execute on all routines in schema public from public, anon, authenticated`
- Grant back ONLY what browser clients call (grep `.rpc(` across `lib/` and `app/`)
- Re-assert load-bearing revocations: `apply_decision` → `service_role` only;
  `apply_decision_effect` and all `effect_*` → nobody; migration-037 service
  functions → nobody; cron functions → `service_role` only; `enqueue_notification` → nobody
- `alter default privileges` so future functions don't silently reopen the hole
- New test in `rls-isolation.test.ts` asserts the posture directly

This is the kind of non-obvious platform behaviour the file exists for — a
database built by either path ends up the same, and the grants are in version
control where a reader can disagree with them.

---

## D-63 — a food restriction is a filter, not a weight

A dislike is a term in the recommendation score, weighted 0.35 against recency,
cost and repetition. An allergy is not a stronger dislike; it is a different kind
of thing, and modelling it as a heavier weight is the mistake that eventually
serves somebody a peanut because the budget term was large enough that week.

Restrictions therefore live in their own table (`member_restrictions`, migration
082) with a severity — `allergy`, `intolerance`, `diet` — and they **remove
candidates from the set before scoring**, never after. The filter-then-rank order
is load-bearing: a filter applied after ranking is one a later refactor can drop
without any test noticing, because the output looks the same until the day it
does not.

Three consequences worth stating, because each was a choice:

- **Allergy blocks the write, in the database.** Recording a meal with an
  allergen for one of its participants raises `FOOD_RESTRICTION_VIOLATION` from a
  deferred constraint trigger, not from a route handler. A service-role key
  bypasses RLS; it does not bypass this. Intolerance and diet warn instead —
  they are not medical events, and a record of something that actually happened
  should not be refusable.
- **An empty answer is a correct answer.** If every candidate is restricted for
  somebody eating tonight, both halves render nothing with an honest message.
  The filter is never widened to fill the two slots, and AI is not called as a
  way around it.
- **The AI half is filtered on our side.** The prompt carries the union of
  restricted items and every returned idea is re-checked against it on the way
  back. A prompt is a request; the check is the guarantee.

Restrictions are health information about one person, so RLS is narrower than the
Home: the person and, for a dependent, their guardian. The recommender reads them
through a security-definer function that returns safe food ids and never the
restrictions themselves, and they appear in no digest, export or Insights
response (BR-226).

---

## D-64 — an invite link is an address, not a seat

Two people opening the same link at the same moment both succeed, because a link
authorises **raising a request**, never joining. There is nothing to race for,
and that is what makes the concurrency question uninteresting — it was settled by
D-44 removing the admin-creates-member path, and this decision only records that
the link inherits it.

What the link needed, and now has: a 14-day default expiry, storage as a hash
rather than plaintext, constant-time comparison, and rotation that **retains the
old token row marked revoked** rather than deleting it. Revoked, expired and
never-existed all return the identical `INVALID_INVITE` response — a distinct
`INVITE_EXPIRED` code was drafted and dropped, because a different code is a
different answer and a different answer is an oracle for enumerating Homes.

---

## D-65 — erasure removes the person, not the arithmetic

A Home's record is jointly authored. If one member's erasure deleted their
splits, everybody else's settled month would silently stop balancing — a figure
they agreed to, changed later, by somebody else, without them being told.

So erasure removes the account and everything personal to it — credentials,
devices, push subscriptions, notifications, avatar, receipts, ratings,
restrictions — and retains the membership row, its splits, settlements,
assignments and decision responses under a stable pseudonym with `user_id` set
null. Money that was settled stays settled. The right to a copy is served by the
export paths that already exist and are permanent under BR-292.

Two guards: erasure requires being financially clear in **every** Home, so it
cannot be used to walk away from a debt; and a removal decision never triggers
it, so the Home cannot erase somebody by vote. A Home itself is deleted only when
its last member leaves, after a 30-day window in which any former member can
restore it.

---

## D-66 — the offline write queue's contract is written before the queue

`03-ARCHITECTURE.md` said a future write queue "needs an explicit idempotency and
conflict contract before being enabled". That sentence has been outstanding since
version 1, which meant the queue would arrive in phase 16 and the contract would
be reverse-engineered from whatever it did. Section 8.1 now writes it first.

The load-bearing part is that it is **not last-write-wins**, which is what the
TRD's out-of-scope list previously implied. A queued mutation is re-validated
against current state on arrival, exactly as a live request would be, and a
mutation the world has invalidated is rejected and surfaced to the member — never
applied over a decision the Home made while their device was offline.

The second part is that the queue is **opt-in per endpoint and refuses by
default**. Recording something that happened is queueable; agreeing to something
is not. A decision response replayed an hour later does not mean what the member
meant, and the property this version exists for is that no Critical decision
completes on stale input.
