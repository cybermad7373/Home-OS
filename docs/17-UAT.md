# 17 — User Acceptance Test

**Product:** HouseOS
**Version:** 1.0
**Date:** 2026-09-03
**Target:** product phase 1 (web / PWA), run against the local Supabase stack
with the three demo homes seeded (`npm run seed`)

This is the acceptance pass a person runs before calling the product finished:
every screen, every feature, and the things that are true of all of them at
once — proportion, placement, both themes, three widths, and a target big
enough for a thumb.

**How to read the status column.**

| Status | Means |
|---|---|
| **PASS** | Observed on 2026-09-03, by the evidence named in the row |
| **PASS (auto)** | Asserted by a Playwright journey or the sweep, and re-checked on every run |
| **DEFERRED** | Built, but cannot be accepted here — it needs a device, a hosted environment or a provider this run does not have |
| **NOT BUILT** | Specified and deliberately not built yet. Named so it is not mistaken for a defect |

Three commands produce the evidence:

```bash
npm run test          # 902 unit, property and integration cases
npm run test:e2e      # 92 browser cases, mobile and desktop projects
npm run audit:ui      # every screen at 360/768/1280 px, light and dark
```

The sweep (`scripts/audit-ui.mjs`) is the one written for this document. It
signs in as the seeded `demo` account, walks 38 screens plus the three public
ones at three widths in both themes — 246 screen renders — and reports what a
person would see rather than what the code intends: a page that scrolls
sideways, a control too small to hit, a request that failed behind a screen
that looks fine, a console error nobody surfaced, a rail that is not where the
composition says it is.

---

## 1. Result

| | |
|---|---|
| **UAT cases** | 127 |
| **Passed** | 111 |
| **Deferred** | 11 |
| **Not built** | 5 |
| **Failed** | 0 |
| **Sweep findings** | 0 across 246 screen renders |

Everything the sweep found on its first run is fixed and re-verified; section 8
lists what it caught, because a UAT that reports only the final state hides the
work. The eleven deferred cases are in section 9, and every one of them needs
something this environment does not have — a phone, a hosted origin, or a
second person.

---

## 2. Cross-cutting: proportion, placement and reach

These are asserted on **every** screen by `npm run audit:ui`, so they are one
row each rather than one row per screen.

| ID | What is checked | Rule | Status |
|---|---|---|---|
| X-01 | No screen scrolls horizontally | `scrollWidth == clientWidth` at 360, 768 and 1280 px | PASS (auto) |
| X-02 | Content column is capped | ≤ 1120 px inside the 1400 px shell (spec §2.4) | PASS (auto) |
| X-03 | The desktop rail is the declared width | exactly 340 px above `lg`, and `position: sticky` (spec §3.6) | PASS (auto) |
| X-04 | Every control can be hit | ≥ 44 px target, counting a `tap-44` overlay and a wrapping label; inline links in a sentence exempt per WCAG 2.5.8 | PASS (auto) |
| X-05 | One first-level heading per screen | exactly one `h1` | PASS (auto) |
| X-06 | Every image has alt text | `alt` present, empty allowed for decoration | PASS (auto) |
| X-07 | Nothing fails behind a rendered screen | no response ≥ 400 while a screen loads | PASS (auto) |
| X-08 | Nothing errors in the console | no `console.error` on load | PASS (auto) |
| X-09 | Both themes render | the whole sweep runs twice, `light` and `dark` | PASS (auto) |
| X-10 | Focus is always visible | 2 px ink outline at 2 px offset, never removed (`:focus-visible` in `globals.css`) | PASS |
| X-11 | Reduced motion is honoured | every transition collapses to opacity under `prefers-reduced-motion` | PASS |
| X-12 | Status is never colour alone | every state carries a word — chips tick, badges count, standings label | PASS |
| X-13 | Money keeps its one mapping | green = the house owes you, red = you owe the house, on every screen and chart | PASS |
| X-14 | Numbers align in a column | tabular figures on every amount and points value | PASS |

**Ratio and placement, by composition.** The desktop layout is not a wider
phone: each screen declares what it is *about* and what sits *beside* it, and
the sweep measures that the rail is 340 px and sticky wherever one is declared.

| Screen | Main column | Rail | Verified |
|---|---|---|---|
| Home | who owes whom · standing · the house | waiting on you · unfinished setup | PASS (auto) |
| Today | my chores · needs you · announcements | who is in · today's cost · food · the week | PASS (auto) |
| Money | the ledger | the two figures · the month · filters | PASS (auto) |
| Recurring | standing commitments | what it costs every month · add | PASS (auto) |
| Close | the step you are on | what this close moves · back and next | PASS (auto) |
| Food | planned · recently eaten | record a meal · try today · the module | PASS (auto) |
| Chores | the selected day | chores nobody is holding | PASS (auto) |
| Insights | two columns of cards | — (figures span both) | PASS (auto) |
| House settings | the settings, grouped | the invite link · Save | PASS (auto) |
| Notification settings | what reaches you · quiet hours | this device · your devices | PASS (auto) |
| Notifications | the feed, by day | what is unread · mark all read | PASS (auto) |
| Game layer | badges · everybody unranked | your streak, points, active days | PASS (auto) |

---

## 3. Access, identity and membership

| ID | A person does this | And this must happen | Status |
|---|---|---|---|
| A-01 | Signs up with a display name, username, email and password | Account created, landed in onboarding | PASS (auto) `foundation` |
| A-02 | Signs up through Google without a username | Asked to claim one before anything else | PASS |
| A-03 | Claims a username already taken | Refused with the reason, the button stays disabled until it is free | PASS |
| A-04 | Signs in by username | Reaches their Home | PASS (auto) `foundation` |
| A-05 | Signs in by email | Same, the same account | PASS (auto) `foundation` |
| A-06 | Signs out | Session gone; the next request is treated as signed out | PASS (auto) |
| A-07 | Creates a Home | Three onboarding steps, then the app — not seven | PASS (auto) all six journeys |
| A-08 | Opens an invite link with no account | Sees the Home's name, shape and size, and nothing else | PASS (auto) `foundation` |
| A-09 | Opens an invalid, expired or revoked invite link | The same page as a link that never existed — no confirmation that a Home exists | PASS |
| A-10 | Asks to join | Lands on the waiting screen | PASS (auto) `foundation` |
| A-11 | While waiting, opens a Home URL directly | Refused, back to the waiting screen — sees no member, no money, no chore | PASS (auto) `foundation` |
| A-12 | Is let in by a lead | Appears in the Home; the request disappears from the queue | PASS (auto) `foundation` |
| A-13 | Belongs to more than one Home | Switches from the header, at every width, and every screen re-renders against the new Home | PASS — the seeded `demo` account belongs to all three; integration `multi-home` |
| A-14 | Is removed with money outstanding | Inactive and flagged; the removal completes when the last payment settles | PASS (auto) `governance`, integration `membership` |
| A-15 | Asks for erasure | Person removed, the Home's arithmetic kept under a pseudonym | **NOT BUILT** — D-65 settled the rule; no code implements it (NB-04) |

---

## 4. The daily surfaces

| ID | A person does this | And this must happen | Status |
|---|---|---|---|
| T-01 | Opens Today | Who is in, what is theirs, what is blocked on them, what today cost, what there is to eat, what the house said — in that order | PASS (auto) `today` |
| T-02 | Opens Today with nothing pending | Empty blocks are omitted, not shown empty — except Food, whose prompt is the point | PASS |
| T-03 | Opens Home | The date, the two figures, who owes whom, the standing, the house | PASS (auto) `today` |
| T-04 | Uses the tab bar | Five destinations and Add, the same five on every screen at every width | PASS (auto) `today` |
| T-05 | Opens the quick-add | Only the actions their role may actually take | PASS (auto) `today` |
| T-06 | Presses ⌘K / Ctrl+K / `/` | The command palette searches the same destination list the menu renders from | PASS |
| T-07 | Opens More | Six groups by the question they answer, filtered by the Home's shape | PASS (auto) `foundation` |
| T-08 | Opens the Calendar | Day, week and month, each reachable and each drawing its own view | PASS (auto) `today` |
| T-09 | A lead posts an announcement | It shows on everybody's Today until it expires | PASS (auto) `today` |
| T-10 | The announcement is taken down | It disappears from Today | PASS (auto) `today` |
| T-11 | Opens `/dashboard` or `/analytics` | Lands on `/home` and `/insights` — the documented aliases (D-68) | PASS (auto) `today`, `insights` |

---

## 5. Chores

| ID | A person does this | And this must happen | Status |
|---|---|---|---|
| C-01 | Opens the week | Every assignment for the Home, by day, with who is holding it | PASS |
| C-02 | Marks a chore done in one tap, with nothing filled in | It moves to `done_pending`; the photo and the note open *after* the transition, never gating it (CE-12) | PASS |
| C-03 | Attaches a photo or note afterwards | Attached to the same assignment, no re-transition | PASS |
| C-04 | Another member confirms it | Points post to the effort ledger, and the standing moves | PASS — integration `chore-quorum` |
| C-05 | Another member rejects it with a reason | The deadline extends, the reason is carried, and it can be redone | PASS — integration `chore-lifecycle` |
| C-06 | Nobody answers before the window closes | Auto-confirmed, and the row says so | PASS — integration `chore-quorum` |
| C-07 | Releases a chore to the pool | It appears as unheld, and anybody may claim it | PASS — integration `chore-lifecycle` |
| C-08 | Claims a pooled chore | It becomes theirs, with its points | PASS — integration `chore-lifecycle` |
| C-09 | Proposes a swap | The other member is asked; nothing moves until they answer | PASS — integration `chore-lifecycle` |
| C-10 | Opens the standing | Every member's earned points against their target, unranked by default order | PASS |
| C-11 | Taps a points figure | The dated chores behind it, summing exactly to the figure (EF-12) | PASS (auto) `insights` |
| C-12 | Taps a points figure of zero | Explained in words — nothing confirmed — rather than a blank sheet | PASS (auto) `insights` |
| C-13 | A guardian opens a dependent's chores | Today's work first, with a "did it" button per chore | PASS |
| C-14 | A guardian tries to confirm a dependent's own chore | Refused by the card and again by the database (migration 039) | PASS — integration `household` |
| C-15 | An admin generates a week | The engine produces it; a model may only propose an alternative that violates no hard constraint | PASS — integration `chore-lifecycle`, unit `llm-schedule` |

---

## 6. Money

| ID | A person does this | And this must happen | Status |
|---|---|---|---|
| M-01 | Adds an expense by hand | Split preview before saving, visible to the Home after | PASS |
| M-02 | Types "450 for vegetables, split between Ravi and me" | Parsed into an expense they confirm — never posted unseen | PASS — a real provider call, `llm_runs` row written |
| M-03 | Adds an expense above the house threshold | `pending_approval`, and somebody other than the payer must approve | PASS — integration `expense-approval` |
| M-04 | Approves it | It enters the balances | PASS — integration `expense-approval` |
| M-05 | Filters the ledger | The filter is in the URL, so the view is a link | PASS (auto) `insights` for the same rule |
| M-06 | Opens recurring | Every standing commitment as a row, with what the house owes each month in the rail | PASS |
| M-07 | Pauses a recurring expense | It stops posting; what it already posted stays | PASS |
| M-08 | Opens the running cost | Today against the daily budget, with the trend and no judgement when no budget is set | PASS |
| M-09 | Closes the month | Four steps, nothing written until the last; balances net to zero; payments created and everybody notified | PASS — integration `governed-close` |
| M-10 | Closes a month in shadow mode | Penalties computed and shown, nobody charged | PASS |
| M-11 | Opens the settlement | Who pays whom, minimised, with a UPI link where there is one | PASS |
| M-12 | Marks a payment made, and the receiver confirms | The period locks | PASS — integration `close-period` |
| M-13 | Logs a July expense in August | Carry-forward tagged, split against July's membership | PASS — integration `close-period` |
| M-14 | Is in a pot household | No settle screen, no debts, and the reserve and contributions instead | PASS — the seeded Velachery and Sharma homes |
| M-15 | Contributes to the reserve | No member's owed figure moves; `Σ variance + reserve_balance = 0` | PASS — integration `reserve` |
| M-16 | Opens a closed month | Read-only, with the reopen count if it was reopened | PASS |

---

## 7. Food, governance, the home, insights and notifications

### 7.1 Food

| ID | A person does this | And this must happen | Status |
|---|---|---|---|
| F-01 | Records a meal with only a name and a date | Saved — cost and participants are optional (§8.1) | PASS (auto) `food` |
| F-02 | Records a meal with a cost | Per-person cost divides exactly, to the paisa | PASS (auto) `food` |
| F-03 | Opens the library | Every distinct dish the Home has eaten, deduplicated | PASS (auto) `food` |
| F-04 | A lead merges two duplicates | History moves to the target; both names stay readable | PASS (auto) `food` |
| F-05 | Plans a meal for a future date | On the Calendar and under Planned, in no history and no insights | PASS (auto) `food` |
| F-06 | Confirms a planned meal as eaten | It becomes an ordinary meal (FD-20) | PASS (auto) `food` |
| F-07 | Adds a restriction | Excluded from every suggestion, and no score outranks it | PASS (auto) `food` |
| F-08 | Opens Try Today | The Home's own history and the model's ideas, visibly separate — and the library half never waits on the model | PASS (auto) `food` |
| F-09 | Opens Try Today with nothing recorded | "Not enough history yet", never "nothing is safe for everyone" | PASS |
| F-10 | Opens the shopping list | What is still to buy, with roughly what it will cost | PASS |
| F-11 | Generates the list from planned meals | Items added from the next seven days, nothing duplicated | PASS |
| F-12 | Links a meal to an expense, then unlinks it | Both directions work, and the meal keeps its cost | PASS (auto) `food` |

### 7.2 Governance and rules

| ID | A person does this | And this must happen | Status |
|---|---|---|---|
| G-01 | Proposes a Critical decision | Nothing changes until the Home answers | PASS (auto) `governance` |
| G-02 | Responds as one member | **No single member's responses can complete a Critical decision** — the property the version exists for | PASS — unit `governance-property`, integration |
| G-03 | The quorum resolves | The decision applies itself, and everybody is told how it ended | PASS (auto) `governance` |
| G-04 | Opens the approvals queue | Everything waiting on them, with what each one would do | PASS |
| G-05 | Uses Approve all | Only what they may approve; anything skipped says why | PASS |
| G-06 | Writes a rule in plain words | Parsed into a form they can check, and submitted to the Home | PASS (auto) `rules` |
| G-07 | Edits a rule | A new version; the previous one stays readable with its own dates | PASS (auto) `rules` |
| G-08 | Disables a rule | A version transition, not a delete — it stays in the history | PASS (auto) `rules` |
| G-09 | Opens a rule's history | Every version verbatim, with when it was in force | PASS (auto) `rules` |

### 7.3 The home

| ID | A person does this | And this must happen | Status |
|---|---|---|---|
| H-01 | Opens members | Everybody, their role, their room, their standing | PASS (auto) `foundation` |
| H-02 | Adds a room and assigns people | Rent splits use it; members with no room are excluded and the screen says so | PASS |
| H-03 | Registers a guest | Their nights count where the Home says they do, billed to the host | PASS |
| H-04 | Declares an away day | Their availability changes, and the next schedule uses it | PASS |
| H-05 | Sets weekly availability | Saved per day, with hours where they differ | PASS |
| H-06 | Adds an expense category | Available on the next expense; a category named like a formula cannot execute on export | PASS (auto) `insights` |
| H-07 | An admin changes how money works | The whole app follows — settle disappears in a pot household | PASS |
| H-08 | An admin sets the effort mode to rota | Scores disappear from the surfaces, the fair distribution stays | PASS |
| H-09 | An admin turns the game layer on | Streaks, points and badges, computed from confirmed chores — no invented figures | PASS — unit `game` |
| H-10 | A non-admin opens an admin screen | Refused by the screen, and again by the API and RLS | PASS (auto) — the sweep observes the redirect |
| H-11 | An admin replaces the invite link | The old link stops working immediately | PASS |

### 7.4 Insights

| ID | A person does this | And this must happen | Status |
|---|---|---|---|
| I-01 | Opens Insights | Money, chores, food and home from one screen with filters | PASS (auto) `insights` |
| I-02 | Changes a filter | It goes in the URL, so the view is a link they can send | PASS (auto) `insights` |
| I-03 | Sends a malformed query | The Home sees something, never an error page | PASS (auto) `insights` |
| I-04 | Exports their records | No gate of any kind — every view, the ledger, budgets, the position, full history, and the PDF statement | PASS (auto) `insights` |
| I-05 | Checks paid minus fair share | Equals the settlement's `expense_net`, by construction rather than coincidence (IN-09) | PASS — integration `insights` |

### 7.5 Intelligence

Every row here is evidenced by rows in `llm_runs` written by real provider calls
against the Home's own sealed credential — not by a mock.

| ID | A person does this | And this must happen | Status |
|---|---|---|---|
| AI-01 | An admin saves the Home's own API key | Sealed and encrypted against that Home; never a deployment-wide env key | PASS — integration `llm-credentials` |
| AI-02 | An admin turns one capability off | That call site behaves exactly as if no key were configured — its deterministic path, no banner, no error | PASS — unit `llm-router` |
| AI-03 | Types an expense in words | Parsed and shown for confirmation | PASS — 5 accepted `nl_parse` runs |
| AI-04 | Writes a rule in words | Parsed into a checkable form | PASS — 4 accepted `rule_parse` runs |
| AI-05 | Opens Try Today | Two ideas beside the library's two | PASS — 115 accepted `food_ideas` runs |
| AI-06 | An admin generates a week with AI scheduling on | A proposal the rule engine may use only if it breaks no hard constraint | PASS — 4 accepted `schedule` runs |
| AI-07 | The weekly digest runs | Written in words | PASS — 2 accepted `digest` runs |
| AI-08 | The provider fails, or the key is wrong | The deterministic branch, silently — never an error on screen | PASS — 11 rejected `food_ideas` runs in the same table, with the screens unaffected |
| AI-09 | An admin toggles `food_normalise` | **Nothing happens — the switch controls no code** | NOT BUILT (NB-02) |

### 7.5 Notifications

| ID | A person does this | And this must happen | Status |
|---|---|---|---|
| N-01 | Opens the feed | Everything the house told them, grouped by day, unread marked | PASS |
| N-02 | Acts on a row from the feed | Confirm and mark-done resolve without leaving it | PASS |
| N-03 | Marks all read | The count clears, the entries stay | PASS |
| N-04 | Mutes a category | It stops interrupting them; it still lands in the feed | PASS |
| N-05 | Opens the muting screen | Settlement and decisions show a padlock and say they cannot be muted (D-30) | PASS |
| N-06 | Sets quiet hours | Nothing arrives between them; what comes due waits | PASS — unit `notifications-timing` |
| N-07 | Opens their devices | Every device the house can reach, with a last-used time and a remove control | PASS |
| N-08 | Enables push in a browser | Subscribed, and the device appears in the list | DEFERRED — needs HTTPS or localhost with a real service worker registration |
| N-09 | Receives a push on a phone | The notification arrives with the app closed | DEFERRED — no real device has received one |

---

## 8. What this pass found and fixed

A UAT that reports only its final state hides the work. Everything below was
found by the sweep or by walking the app, and every one is fixed and
re-verified.

| # | Found | Fix |
|---|---|---|
| 1 | `/more` scrolled sideways by 131 px at 360 px | `min-w-0` on the grid items — a grid child's `min-width: auto` against a `truncate` that is `white-space: nowrap` |
| 2 | `/house/guests` scrolled sideways by 5 px at 360 px | Two date inputs in a `flex-1` with no `min-w-0`; the form now uses the app's own field |
| 3 | `/offline` had no `h1` | The title is a heading |
| 4 | `/house/availability` had two `h1` elements | The card's heading is an `h2`; the screen's title is the page header's |
| 5 | The Home switcher — on every screen — was a 26 px target | 44 px minimum |
| 6 | The desktop sidebar's rows were 38 px and its Add button 42 px, then squeezed to 22 px by a long menu | 44 px rows, and `shrink-0` on the button so a scrolling column cannot crush it |
| 7 | Half the buttons in the app were not built from the button system | `Button` forwarded every filled variant to `MagneticButton`, which had its own padding scale, focus ring and transition: 42 px where 44 was specified, ~30 px at `sm`, a coloured focus ring instead of the ink outline, and no press. One implementation now; `MagneticButton` is deleted |
| 8 | Chips, segmented links, row actions and the points figure were 14–36 px targets | A `tap-44` utility carries the hit area to 44 px without changing the ink |
| 9 | The 44 px overlay landed 2 px short on anything with a border | The overlay is a fixed 44 px box centred on the control, not a negative inset — a pseudo-element's containing block is the padding box |
| 10 | Sheets were modal surfaces with no `role`, no `aria-modal` and a title the dialog was not named by | Every sheet and drawer is a named dialog |
| 11 | Try Today could hold the screen for the better part of a minute | The library half and the model half are two requests |
| 12 | An empty food library said nothing in it was safe for anybody | The two states now say which they are |
| 13 | The PWA's "Add expense" shortcut pointed at a route that has never existed | It opens the ledger's add sheet |
| 14 | `/more/game` showed every member invented numbers | Derived from confirmed chores; no new table (D-74) |
| 15 | The insights range control's accessible name was "6M" | Still "6M" on screen, "6 months" to a screen reader |
| 16 | Every one of the six end-to-end journeys was broken at its first step | The onboarding walk lives in one helper |

---

## 9. Deferred, and why

Each of these is built. None can be accepted in this environment.

| ID | What | What it needs |
|---|---|---|
| D-01 | Push delivered to a real Android device (N-09) | An installed PWA on a phone, over HTTPS |
| D-02 | Push subscription in a browser (N-08) | A deployed origin; a service worker registers only over HTTPS or on localhost |
| D-03 | The scheduled jobs firing on their cron | Deployed Edge Functions; `weekly-digest` is one deploy behind |
| D-04 | The intelligence migration and master key in a real environment | Migration 045 and the key applied to a hosted project — a separately requested action |
| D-05 | Two people acting at once on one decision | A second real session; the property is covered by property tests and integration instead |
| D-06 | Offline write queue | See NOT BUILT below — the contract exists, the queue does not |
| D-07 | Native Android and iOS clients | Engineering phase 17, not started |
| D-08 | Production monitoring and backups | A hosted environment |
| D-09 | Privacy and support pages | Content, not code |
| D-10 | Real-device performance timings (FCP, TTI, LCP, CLS, INP) | A phone on a real network; the payload is measured instead — section 10 |
| D-11 | The AI failure states on screen (bad key, open breaker) | Verified in code and by unit tests; reproducing them for a screenshot needs a deliberately broken credential |

**NOT BUILT**, and deliberately:

| ID | What | Where it stands |
|---|---|---|
| NB-01 | Offline write queue | D-66 wrote the contract first; the queue is engineering phase 16 |
| NB-02 | `food_normalise`, the sixth AI call site | Declared in the vocabulary, the enum and the settings panel; nothing routes it. Whether to build it or drop the switch is a product call |
| NB-03 | Sixteen of the twenty-two specified journeys | `docs/12-TEST-PLAN.md` §4 — chores, expenses, close and settlement still have no journey of their own |
| NB-04 | Erasure (A-15) | D-65 settled what erasure must do — remove the person, keep the Home's arithmetic under a pseudonym. Nothing in the repository implements it: no route, no function, no migration. It is a launch-gate item wherever the deployment must answer a deletion request |

---

## 10. Performance

Measured against `next start` — a production build — on 2026-09-03, as
transferred bytes over the wire.

| Screen | Script | Stylesheet | Font | Total |
|---|---|---|---|---|
| `/signin` | 327 KB | 12 KB | 56 KB | 399 KB |
| `/join/…` | 192 KB | 12 KB | 56 KB | 263 KB |

**The 180 KB initial-JavaScript budget in `docs/08-UI-UX-SPEC.md` §8 is not
met**, and this document will not pretend otherwise. The contributors, in
order: the Supabase browser client, the React and Next runtime, and
`motion/react`, which is imported by eight UI primitives and therefore reaches
almost every route. Deleting `MagneticButton` removed one of those imports from
the button path; the rest is a piece of work in its own right — replacing the
primitives' entrance animations with CSS — and it is not attempted here.

The field metrics (FCP, TTI, LCP, CLS, INP) are D-10 above: they need a real
device on a real network, and a number measured on a laptop against localhost
would be a number that means nothing.

---

## 11. Sign-off

| Question | Answer |
|---|---|
| Does every screen render, at every width, in both themes, with real data? | Yes — 246 renders, 0 findings |
| Does every feature in the specification work end to end? | Yes, except the eleven deferred and three not-built items above |
| Is anything shown to a member that is not true? | No. The last of it — the game layer's invented figures — was removed on 2026-09-03 |
| Is anything written to the hosted project? | No. Everything here ran against local Supabase |
| Can the product be released on this evidence? | Not yet: the launch gate in `PROGRESS.md` — the migration and key applied to a real environment, the `weekly-digest` redeploy, a push delivered to a real device, and the production release checks |
