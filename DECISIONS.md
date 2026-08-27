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
