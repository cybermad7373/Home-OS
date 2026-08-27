# 08 — UI / UX Specification

**Product:** HouseOS
**Version:** 2.0
**Date:** 2026-08-27

This document specifies every screen, every state and every visual token. A developer should be able to build the entire interface from this document without asking a design question.

---

## 1. Design principles

1. **Mobile is the product; desktop is a wider version of it.** Every layout is designed at 360 px first. Nothing is desktop-only.
2. **Today answers "what is happening now" in one screen, without scrolling:** who is home, what work is mine, what money moved, what we are eating, and what is waiting on me.
3. **Logging is one thumb, one screen, under ten seconds.** Any flow that takes more will not be used, and unused flows destroy the data set the product depends on. This applies to a meal as much as to an expense.
4. **Fairness data is never hidden behind a tap.** The standing, the paid-versus-owed chart and who-owes-whom are surfaces, not reports.
5. **Numbers are the loudest thing on the screen.** Points, amounts and counts get the largest type. Labels are secondary.
6. **No modal traps.** Every sheet dismisses by swipe or backdrop tap. Destructive actions confirm inline, not in a dialog stack.
7. **Simple words on the surface, whatever the model underneath.** The interface says Person, Member, Requested, Rule, Food, Money, Approve, Acknowledge, Done, Owe, Paid. It never says governance engine, effort deficit, decision participant, policy object or membership lifecycle. Those exist in the code and stay there.
8. **A pending decision is never buried.** Approvals is promoted into primary navigation the moment anything is waiting on the person looking. A queue nobody sees is a Home that stops deciding things.
9. **Say why.** A suggested meal, an assigned chore, a settlement payment and a required acknowledgement each state their reason on the surface. An automatic allocation nobody understands is one nobody accepts.

---

## 2. Design tokens

### 2.1 Colour

Defined as CSS custom properties on `:root`, with a dark variant. Dark is the default on first load, matching the system when set.

```css
:root {
  /* surfaces */
  --bg:            #FAFAF9;   /* page */
  --surface:       #FFFFFF;   /* cards */
  --surface-2:     #F5F5F4;   /* nested, input backgrounds */
  --border:        #E7E5E4;
  --border-strong: #D6D3D1;

  /* text */
  --text:          #1C1917;
  --text-muted:    #78716C;
  --text-subtle:   #A8A29E;

  /* brand */
  --primary:       #0F766E;   /* teal 700 — actions, active nav */
  --primary-hover: #0D9488;
  --primary-fg:    #FFFFFF;

  /* semantic */
  --success:       #15803D;   /* confirmed, surplus, money owed to you */
  --success-bg:    #DCFCE7;
  --warning:       #B45309;   /* pending, approaching budget */
  --warning-bg:    #FEF3C7;
  --danger:        #B91C1C;   /* missed, deficit, money you owe */
  --danger-bg:     #FEE2E2;
  --info:          #1D4ED8;
  --info-bg:       #DBEAFE;

  /* chore categories — used for the coloured left rail on chore cards */
  --cat-cooking:   #EA580C;
  --cat-kitchen:   #CA8A04;
  --cat-bathroom:  #0891B2;
  --cat-room:      #7C3AED;
  --cat-common:    #059669;
  --cat-mopping:   #2563EB;
  --cat-other:     #64748B;
}

:root[data-theme="dark"] {
  --bg:            #0C0A09;
  --surface:       #1C1917;
  --surface-2:     #292524;
  --border:        #292524;
  --border-strong: #44403C;
  --text:          #FAFAF9;
  --text-muted:    #A8A29E;
  --text-subtle:   #78716C;
  --primary:       #2DD4BF;
  --primary-hover: #5EEAD4;
  --primary-fg:    #0C0A09;
  --success:       #4ADE80;  --success-bg: #14532D;
  --warning:       #FBBF24;  --warning-bg: #451A03;
  --danger:        #F87171;  --danger-bg:  #450A0A;
  --info:          #60A5FA;  --info-bg:    #172554;
}
```

**Semantic colour rule, applied everywhere without exception:** green means the house owes you, or you are ahead on effort. Red means you owe the house, or you are behind. This one mapping must never invert, on any screen or chart.

### 2.2 Typography

| Role | Family | Size / line | Weight | Used for |
|------|--------|-------------|--------|----------|
| Display | Inter | 32 / 38 | 700 | Dashboard hero numbers |
| Title | Inter | 22 / 28 | 600 | Screen titles |
| Heading | Inter | 17 / 24 | 600 | Card and section headings |
| Body | Inter | 15 / 22 | 400 | Default |
| Label | Inter | 13 / 18 | 500 | Form labels, metadata |
| Caption | Inter | 12 / 16 | 400 | Timestamps, helper text |
| Numeric | Inter, `font-variant-numeric: tabular-nums` | — | 600 | Every money and points value |

Tabular numerals on every number in a column is not optional. Amounts that do not align vertically read as untrustworthy.

### 2.3 Spacing, radius, elevation

```
Spacing scale (px):  4  8  12  16  20  24  32  40  48  64
Radius:              sm 6   md 10   lg 14   full 9999
Shadow sm:           0 1px 2px rgba(0,0,0,.06)
Shadow md:           0 4px 12px rgba(0,0,0,.08)
Shadow lg:           0 12px 32px rgba(0,0,0,.12)   /* sheets only */

Screen padding:      16px horizontal on mobile, 24px at ≥768px
Card padding:        16px
Gap between cards:   12px
Minimum touch target: 44 × 44px
```

### 2.4 Breakpoints

| Name | Width | Layout change |
|------|-------|---------------|
| base | 360–639 | Single column. Bottom tab bar. Sheets slide from bottom. |
| sm | 640–1023 | Two-column card grid on dashboard and analytics. |
| lg | ≥1024 | Left sidebar replaces the bottom tab bar. Content max-width 1120 px, centred. Sheets become right-side drawers. |

### 2.5 Motion

| Interaction | Duration | Easing |
|-------------|----------|--------|
| Sheet open / close | 240 ms | `cubic-bezier(.32,.72,0,1)` |
| Page transition | 180 ms | `ease-out` |
| Button press | 80 ms | `ease-out`, `scale(0.97)` |
| Number change (points, balance) | 400 ms | count-up, `ease-out` |
| Toast in / out | 200 ms | `ease-out` |

All motion respects `prefers-reduced-motion: reduce` by collapsing to opacity-only changes.

---

## 3. Navigation

**Changed in 2.0.** Five destinations became six, and one of them appears
conditionally.

### 3.1 Mobile — bottom tab bar

```
┌──────────────────────────────────────────┐
│  🏠 Chennai Flat  ▾            🔔 3  RK  │
├──────────────────────────────────────────┤
│                                          │
│              screen content              │
│                                          │
├──────────────────────────────────────────┤
│  🏠     ☀️     ✅     ➕     ₹     🍛     │
│ Home  Today  Chores  Add  Money  Food    │
└──────────────────────────────────────────┘
```

Six primary destinations, one of which — Add — is a control rather than a place:

| Tab | Route | Contains |
|-----|-------|----------|
| Home | `/home` | The Home overview: headline numbers, what is pending, entry points |
| Today | `/today` | Presence, today's chores, today's money, today's food, what needs me |
| Chores | `/chores` | Week view, my chores, confirmations, standing |
| **Add** | — | Raised centre button. The universal quick-add. |
| Money | `/money` | Expenses, balances, who owes whom, settle |
| Food | `/food` | Add meal, suggestions, library, history, preferences |

**Insights** and **Approvals** are the two destinations that do not have a fixed
slot:

- **Insights** lives in More on mobile and is a primary item from 640 px up. It
  is the only primary destination that is never urgent, so it is the one that
  yields the slot.
- **Approvals** is in More when nothing is pending, and **replaces Insights in
  the bar, with its count, the moment anything is waiting on the caller.** It
  returns to More when the queue empties.

At 360 px the bar therefore holds at most six items and never seven. If it does
not fit on a real device, Insights moves permanently to More — not Food, and
never Approvals while something is pending.

The centre Add button is 56 px, raised 12 px above the bar, in `--primary`. It is
the single most-used control in the app.

### 3.2 The Home switcher

The header carries the Home's name and a chevron. Tapping it opens the Home
list — every Home the person is Active in, with their role in each, plus Create
Home. The currently selected Home is always visible and never ambiguous (HM-04).

A person in exactly one Home still sees the name, without the chevron.

### 3.3 Badges

| Where | When |
|-------|------|
| Chores | An assignment is due today, or a confirmation is waiting on the caller |
| Money | An expense awaits the caller's approval |
| Approvals | Anything at all is waiting on the caller — this is also what promotes it into the bar |
| Bell | Unread notifications |

A badge is a count, never a dot, because "three things" and "one thing" are
different decisions about whether to tap.

### 3.4 More

```text
More

Members          Calendar         Approvals
Rules            Categories       History
Home settings    Governance       AI settings
Export           Reserve
```

Everything rarely used, and nothing that is urgent. Daily, weekly and monthly
reports are **not** here and are not anywhere: they are filters inside the module
they belong to.

### 3.5 Desktop — left sidebar

Same destinations, plus the sub-items of More promoted to visible entries, and
Insights always visible. The Home name with its switcher and the caller's effort
standing sit at the top of the sidebar.

### 3.6 The universal quick-add

```text
+
──────────────

Expense
Meal
Chore done
Absence
```

An Admin's sheet additionally offers **Chore**, **Rule** and **Category**. A
Co-Admin's offers Chore and Category. The sheet shows only what the caller may
actually do — an option that opens and then refuses is worse than an option that
was never there.

---

## 4. Screen inventory

Fifty-seven screens. S-01 to S-31 are specification 1.0 and are unchanged except
where marked **changed in 2.0**. S-32 to S-58 are new — S-55 to S-58, and S-12a,
come from the competitive analysis (see
[16-COMPETITIVE-POSITIONING.md](16-COMPETITIVE-POSITIONING.md)). Every screen lists its
purpose, its content, its states and its actions.

### 4.1 Authentication and onboarding

#### S-01 Sign in — `/signin`
- Email and password fields, "Continue with Google", link to sign up.
- **States:** idle, submitting, invalid credentials (inline, under the password field), network error (toast).

#### S-02 Sign up — `/signup`
- Display name, email, password with a strength meter, terms note.
- On success routes to S-03.

#### S-03 Join or create — `/onboarding/home` — **changed in 2.0**
- Two large cards: "I have an invite link" and "Create a new Home".
- **There is no code field.** Joining starts from a link, which lands on S-32.
  This screen exists for a person who arrives without one, and its invite card
  says so: "Ask someone in the Home to send you the link."
- Create routes to the Home wizard: name, type (Shared or Family), location,
  timezone.

#### S-04 Awaiting acceptance — `/onboarding/requested` — **changed in 2.0**
- Home name, "waiting to be accepted", with a polling indicator.
- **The person sees nothing else about the Home.** No member list, no counts, no
  activity. A Requested person has no permissions (HM-07), and the screen is the
  visible edge of that rule rather than an exception to it.
- Auto-advances to S-05 when accepted. Shows a "notify me" push opt-in.
- If declined, states so plainly with the reason, and offers "Ask again".
- If the person belongs to other Homes, offers to switch to one of those instead
  of waiting.

#### S-05 Set availability — `/onboarding/availability`

The most important onboarding screen, because bad data here corrupts every schedule.

```
┌────────────────────────────────────────┐
│  When are you home?                    │
│  Rough times are fine — averages work. │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ Weekdays (Mon–Fri)               │  │
│  │  Leave home    [ 09:30  ▾ ]      │  │
│  │  Back home     [ 19:00  ▾ ]      │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ Saturday      ( Home all day  ▾) │  │
│  │ Sunday        ( Home all day  ▾) │  │
│  └──────────────────────────────────┘  │
│                                        │
│  [ Set different times per day ]       │
│                                        │
│  ── What this means ──────────────────  │
│  You are free about 4h 30m on weekdays │
│  and all day at weekends.              │
│  Morning chores: not a fit             │
│  Evening chores: good fit              │
│  Weekend chores: good fit              │
│                                        │
│              [ Continue ]              │
└────────────────────────────────────────┘
```

The "what this means" panel updates live as the times change. It is the mechanism by which a member catches their own data-entry mistake, and it is required, not decorative.

- **Per-day mode** expands to seven rows, each with: home all day, away all day, or leave/return times.
- **Validation:** return time must be after leave time. A window under 30 minutes shows a warning, not an error — it is allowed but flagged.

#### S-06 Cooking and room — `/onboarding/profile`
- "Can you cook a full meal?" — yes / no. Explains that this decides whether cooking chores can be assigned.
- Room shown read-only if the admin already assigned one, otherwise "your admin will assign your room".
- Optional UPI ID, with the explanation that it is used only to generate payment links at month end.

#### S-06b AI features — `/onboarding/ai` (admin only, optional, engineering phase 9)

Shown to the person creating a house, after the household shape is chosen. A member joining an existing house never sees it.

- One sentence on what a key buys: a written weekly summary, a schedule the model may improve, and typing "paid 840 for vegetables yesterday" instead of filling a form. And one on what it costs: nothing, on the free tiers listed.
- **Provider picker** as a list of cards — label, one-line free-tier note, and a link that opens that provider's console in a new tab. Free tiers first, paid ones below a divider.
- **Key field**, `type="password"`, with a show toggle and a paste-friendly width. A format hint under it, used only to catch an obvious mis-paste; it never blocks submission.
- **Model field**, pre-filled with the provider's default, editable, with the provider's listed models as suggestions rather than as the only options.
- **Verify** runs a real round trip and reports it inline: a latency in milliseconds on success, or the provider's own refusal in plain words. Verifying is not required to save.
- **Skip** is a button of equal weight, not a link in the corner. Skipping is the expected choice, and the copy says so: every screen in the app works without a key.
- After saving, the field is replaced by `•••• 4f2a` with **Replace** and **Remove**. The key is never rendered again.
- **States:** idle, verifying, verified, rejected by the provider, sealing unavailable (the server has no `LLM_KEY_ENCRYPTION_KEY` — the panel says so plainly and offers Skip).

The same panel is `/house/settings/ai` for a house that skipped, and it carries the failure banner from section 3.6 of [10-LLM-SPEC.md](10-LLM-SPEC.md) when a key has been rejected.

#### S-07 Enable notifications — `/onboarding/notify`
- Explains exactly what will be sent, listed as four bullet items, before requesting permission. Requesting permission with no explanation is the fastest way to a permanent denial.
- Devices already registered are listed, so a member enabling push on a second phone can see the first.
- "Skip for now" is present and does not nag.

---

### 4.2 Dashboard

#### S-08 Dashboard — `/dashboard` — **superseded in 2.0 by S-51 `/home` and S-50 `/today`**

The screen that must answer everything at a glance.

```
┌────────────────────────────────────────┐
│  Anna Nagar Boys          🔔 3    RK   │
│                                        │
│  ┌─────────────────┬────────────────┐  │
│  │ THIS WEEK       │ THIS MONTH     │  │
│  │                 │                │  │
│  │   85 / 105      │   ₹1,240       │  │
│  │   points        │   you're owed  │  │
│  │  ▓▓▓▓▓▓▓░░ 81%  │                │  │
│  │  20 points to go│  paid ₹7,271   │  │
│  └─────────────────┴────────────────┘  │
│                                        │
│  TODAY                        Mon 24   │
│  ┌──────────────────────────────────┐  │
│  │▌Cook dinner            30 pts    │  │
│  │ 19:30 – 22:00        [ Done ✓ ]  │  │
│  ├──────────────────────────────────┤  │
│  │▌Take out rubbish        5 pts    │  │
│  │ Evening              [ Done ✓ ]  │  │
│  └──────────────────────────────────┘  │
│                                        │
│  NEEDS YOUR CONFIRMATION          2    │
│  ┌──────────────────────────────────┐  │
│  │ Kumar — Kitchen cleaning         │  │
│  │ 2h ago      [ ✕ ]    [ Confirm ] │  │
│  └──────────────────────────────────┘  │
│                                        │
│  HOUSE STANDING            See all →   │
│  ┌──────────────────────────────────┐  │
│  │ 1  Ravi      380  ▓▓▓▓▓▓▓▓  +40  │  │
│  │ 2  Kumar     340  ▓▓▓▓▓▓▓   +12  │  │
│  │ 3  Vinoth    280  ▓▓▓▓▓      −8  │  │
│  │ 7  Suresh     95  ▓▓        −285 │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

- The two hero cards are the week's effort position and the month's money position. Green when ahead, red when behind, on both.
- Today's chores are actionable inline — the Done button posts without leaving the screen.
- Confirmation requests appear above the fold whenever any exist, because a stalled confirmation queue is the failure mode that breaks the product.
- The standing card shows the top three and the caller's own row when they are outside the top three, so nobody has to search for themselves.
- **Empty states:** no chores today → "Nothing assigned today. Next: Tuesday, kitchen cleaning." No confirmations → the section is omitted entirely, not shown empty.

---

### 4.3 Chores

#### S-09 Week view — `/chores`
- Horizontal day selector, seven pills, today highlighted, each showing that day's chore count.
- Below it, the selected day's assignments grouped by slot: Morning, Evening, Any time.
- Each card: a category-coloured left rail, chore name, assignee avatar and name, window, points, status chip.
- Filter chips at the top: All / Mine / Unassigned.
- Pull to refresh.
- **Admin only:** a long-press on any card opens reassignment.
- Each card carries **when this chore was last actually done** and by whom —
  "last done 6 days ago by Arun" (CH-12). Confirmed completions only; one still
  awaiting confirmation reads "pending", and a chore never done reads **"never
  completed"** rather than showing a creation date or an empty line.
- A shared instance shows every assignee and each one's share of the points
  (CE-11), so the card never implies one person owns work three people did.

#### S-10 My chores — `/chores/mine`
- Grouped: Overdue, Today, This week, Awaiting confirmation, Recently done.
- Overdue items carry a red rail and show how far past the deadline they are.

#### S-11 Chore detail — `/chores/:id` (bottom sheet)
- Chore name, category, points, duration, window, assignee, status, and the full status history with timestamps.
- Photo if attached, tappable to full screen.
- Actions vary by state and by who is looking:
  - Assignee, `assigned`: Mark done · Request swap · Release to pool · Share with someone
  - Non-assignee, `done_pending`: Confirm · Reject
  - Anyone, `open`: Claim
  - Admin, any state: Reassign · Cancel
- **Reject flow:** requires a reason of at least 10 characters, chosen from four presets or typed. Presets: "Not actually done", "Done badly", "Done late", "Wrong chore marked".

#### S-12 Mark done — **changed in 2.0: one action, then the sheet**

**Marking a chore done is one tap (CE-12).** The Done button on the Today card
and on the week card completes the action by itself. Nothing is asked for first.

- On tap: the card moves to "waiting for confirmation" immediately, and a toast
  reads "Waiting for someone to confirm — auto-confirms in 48h", which sets the
  expectation at once.
- The toast carries an **Add photo** action, and the chore detail keeps an
  **Add photo or note** control for as long as the instance is open. Both are
  after the fact.
- The sheet — optional photo via camera or gallery, compressed client-side to
  1280 px, and an optional note — still exists, but it is now something a member
  opens **after** marking done, never a gate in front of it.
- There is no intermediate "validate" or "submit" state between the tap and
  `done_pending`. A screen that asks for anything before the transition is a
  defect against BR-076.
- If the write fails, the card returns to its previous state, the failure is
  named, and the tap stays retryable (BR-293). It is never shown as done before
  the server has confirmed it.

#### S-12a Share this chore — sheet — **new in 2.0**
- Member picker, multi-select, showing each candidate's current week load.
- Live preview of the division: "25 points → Arun 9 · Ruth 8 · Vijay 8".
- A line stating the consequence plainly: "None of you can confirm this one."

#### S-13 Swap request — sheet
- Member picker showing each candidate's current week load, so the requester can see who is least loaded rather than always asking the same person.
- Optional message. Send.

#### S-14 Open pool — `/chores/open`
- Unassigned chores with their points, prominently. Framed as an opportunity: "Claim these to build surplus."
- Empty state: "Nothing available. Everything is assigned."

#### S-15 Leaderboard — `/chores/standing`
- Full ranked list: rank, avatar, name, earned points, a target bar, carry, chores done, chores missed.
- Period toggle: this week / this month / all time.
- A house summary card at the top showing the top-three concentration percentage with its trend arrow — the BRD's headline metric, on screen, not buried in analytics.
- **Every number on this screen is tappable** and opens S-55 (EF-12). No points
  figure anywhere in the product is presented without a path to its arithmetic.

---

### 4.4 Money

#### S-16 Expense list — `/expenses`
- Sticky header showing month total and the caller's position.
- Grouped by date, newest first. Each row: category icon, description, payer avatar, amount, and the caller's own share in muted text beneath.
- Filter sheet: category, payer, date range, amount range.
- Infinite scroll, 30 per page.
- An adjustment expense shows a chip reading "for July".

#### S-17 Add expense — sheet (the most-used screen in the app)

```
┌────────────────────────────────────────┐
│                                    ✕   │
│              ₹ 1,240                   │
│         ┌─────────────────┐            │
│         │  1 2 3          │            │
│         │  4 5 6          │  numeric   │
│         │  7 8 9          │  keypad    │
│         │  . 0 ⌫          │            │
│         └─────────────────┘            │
│                                        │
│  🥬 Groceries  🍚 Rent  ⚡ Utilities   │
│  🔥 Gas  📶 Internet  🧹 Maid  🍽 Out  │
│                                        │
│  Today  ·  Paid by me  ·  Split equal  │
│  ────────────────────────────────────  │
│  Note (optional)                       │
│  📷 Add receipt                        │
│                                        │
│         [      Save  ₹1,240      ]     │
└────────────────────────────────────────┘
```

- The amount keypad has focus on open. Category is one tap. Everything else defaults correctly.
- The metadata line — date, payer, split — is one row of tappable chips. Tapping any chip opens only that control.
- Live under the button: "Your share: ₹155.00 · 8 people". With a guest present, it reads "9 people (1 guest)".
- Above the approval threshold, the button label changes to "Save — needs approval".
- **Target: three taps and a number.** Amount, category, save.

#### S-18 Expense detail — sheet
- Amount, category, payer, date, note, receipt.
- The full split, per member, with each share and any guest share attributed.
- Actions: Edit (payer or admin, open period only) · Void (with reason) · Approve or Reject when pending.
- Activity trail: created, approved, edited, by whom and when.

#### S-19 Approvals — `/expenses/approvals`
- Everything awaiting the caller. Each card shows amount, payer, category, note, receipt thumbnail, and their own resulting share.
- Approve and Reject buttons per card. Reject requires a reason.

#### S-20 Current period — `/expenses/period`
- Month total, category breakdown as a donut, per-member paid-versus-share as a horizontal bar pair.
- A projected penalties panel: who is currently in effort deficit and what it would cost them if the month closed today. Visible to everyone. The warning is the entire point of showing it early.
- Admin only: the Close Month button, disabled with an explanation while approvals are pending.

#### S-21 Close month — `/expenses/close` (admin)

A four-step wizard, because closing a month is irreversible in practice and must not be a single accidental tap.

1. **Review** — total, expense count, pending approvals (blocking, listed with links).
2. **Penalties** — each member's effort deficit, points, rate and amount. A "run in shadow mode" toggle that computes and displays without charging, for the first month.
3. **Balances** — the full table: paid, fair share, penalty, final net. A prominent check reading "Balances net to zero ✓". If it does not, closing is blocked and the discrepancy is shown.
4. **Confirm** — the resulting payment list, with a note that every member will be notified. Close.

#### S-22 Settle — `/settle`
- **If the caller owes:** a card per payment with the recipient, the amount, and a large "Pay with UPI" button that opens the deep link, followed by "I've paid" to mark it.
- **If the caller is owed:** a card per incoming payment with its status, and a "Confirm received" button.
- A house-wide progress strip: "5 of 7 payments confirmed".
- History: previous periods, each expandable to its full record.

#### S-23 Recurring expenses — `/expenses/recurring` (admin)
- List with name, amount, day of month, next run, split basis, active toggle.
- Add and edit in a sheet.

---

### 4.5 House

#### S-24 Members — `/house/members`
- Each row: avatar, name, room, residency chip, effort standing, current money position.
- Admin: approve pending joins, change role, change residency, deactivate.
- Pending joiners appear pinned at the top with Approve and Decline.

#### S-25 Rooms — `/house/rooms`
- A card per room: name, capacity, rent, occupants with avatars, and per-person rent.
- Admin: add, edit, assign members, mark vacant.

#### S-26 Guests — `/house/guests`
- Upcoming and past guests: name, host, dates, and two chips showing whether they count for expenses and whether they are assignable.
- Add guest sheet: name, date range, two toggles. On save, a preview line: "Adds 1 head to shared expenses for 3 days, and about 40 points of work assigned across Sat and Sun."

#### S-27 My availability — `/house/availability`
- The same editor as S-05, plus an exceptions list.
- Add exception sheet: date or date range, type (away, home all day, different hours), reason.
- Adding an away date over a published week shows exactly what will be reassigned before confirming.

---

### 4.6 Analytics — **superseded in 2.0**

#### S-28a Analytics — `/analytics` — **superseded by S-28 Insights (section 4.12)**

What shipped in phase 8, kept here until the Insights screen replaces it in phase 15.
Four tabs. Every chart is readable at 360 px and legible in both themes.

**Spending tab**
- Monthly total, a line chart over up to twelve months.
- A stacked bar of category by month.
- A category table: amount, percentage, month-over-month change.

**People tab**
- Paid versus fair share, one horizontal bar pair per member. This is the chart that makes financing visible.
- Cost of living per member per month.
- Net position over time.

**Effort tab**
- Points per member per month, grouped bars.
- The top-three concentration ratio as a line over time, with the 45 percent target drawn as a reference line. If this line is falling, the product is working.
- Completion and miss rate per member.

**Budgets tab**
- A meter per category: spent against budget, projected month end, breach flag.

Export as CSV from every tab.

---

### 4.7 Admin

#### S-29 Chore templates — `/admin/chores`
- List grouped by category, with points and frequency visible per row.
- Add and edit sheet: name, category, points (a slider from 5 to 50 with descriptive anchors — 5 "a minute", 15 "quick", 30 "a real job", 50 "the worst one"), duration, slot, scope, room, frequency, cooking flag, heavy flag.
- A live panel: "This adds 210 points per week to the house. Each member's weekly target becomes 105."

#### S-30 House settings — `/admin/settings`
- Penalty rate per point, with a live example: "At ₹5 per point, missing one dinner costs ₹150."
- Expense approval threshold.
- Auto-confirm window.
- Schedule generation day and time.
- Carry cap percentage.
- LLM scheduling toggle, disabled with an explanation when no key is configured.
- Invite code with regenerate.

#### S-31 Schedule runs — `/admin/schedule`
- History of generations: week, generator (engine or LLM), whether the LLM proposal was accepted, maximum deviation from target, unassigned count.
- The LLM rationale text when present.
- A Regenerate button with a warning that confirmed work is preserved and only outstanding assignments move.

---

### 4.8 Homes and joining — **new in 2.0**

#### S-32 Invite landing — `/join/:token`
Public, before sign-in. The first thing a new person ever sees.

- Home name, type, member count, and one line: "Sign in to ask to join."
- Sign in and Create account, both returning here.
- Once signed in: a message field and one **Request to join** button.
- **States:** valid; invalid or revoked ("This link is no longer active — ask for
  a new one"); already a member (routes straight in); already requested (routes
  to S-04).

#### S-33 My Homes — `/homes`
- A card per Home: name, type icon, the caller's role, and its pending count.
- Requested Homes appear below, muted, with "Waiting to be accepted".
- **+ Create Home** at the foot.
- Tapping a card selects it and routes to Home.

#### S-34 Members — `/more/members` — **changed in 2.0**
- **Active** section: avatar, name, role chip (Admin, Co-Admin or nothing for a
  plain Member), room, residency, effort standing, money position.
- **Requested** section, muted: for a lead, the name, message and when they
  asked, with Accept and Decline. For everybody else, the count and muted rows
  reading "Requested" with no detail (HM-07).
- **Inactive** section: name, when they left, and any outstanding amount with
  "Pending settlement" where it applies.
- Admin actions: promote to Co-Admin, demote, propose removal. **Removal opens a
  decision (S-36), not a confirmation dialog.** The button says "Propose
  removal", because that is what it does.
- Dependents appear inline under their guardian.

### 4.9 Governance — **new in 2.0**

#### S-35 Approvals — `/more/approvals`

The single queue. The screen this version of the product is organised around.

```
┌────────────────────────────────────────┐
│  Approvals                        11    │
│                                        │
│  [ Approve all 8 I can ]               │
│                                        │
│  Expenses                          3   │
│  ┌──────────────────────────────────┐  │
│  │ ₹1,240 Groceries                 │  │
│  │ Added by Arun · your share ₹155  │  │
│  │        [ Reject ]  [ Approve ]   │  │
│  └──────────────────────────────────┘  │
│                                        │
│  Chores                            2   │
│  Absences                          1   │
│  Join requests                     2   │
│                                        │
│  ── Needs a deliberate decision ─────  │
│  ┌──────────────────────────────────┐  │
│  │ ⚠ Close August                   │  │
│  │ Ravi proposed · you're the last  │  │
│  │ acknowledgement needed           │  │
│  │ Approving completes this.        │  │
│  │                    [ Review → ]  │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

- Grouped by kind, each with its count. Every card states the **effect** of
  approving, not only the request.
- **Approve all** names how many it will act on, and never silently includes
  anything from the deliberate section (AP-04).
- The deliberate section holds Critical decisions that would complete on the
  caller's response. They open S-36 rather than resolving inline.
- Rejecting always asks for a reason of at least ten characters, from four
  presets or typed.
- **Empty state:** "Nothing needs you." — and Approvals leaves the tab bar.

#### S-36 Decision detail — `/more/approvals/:id`

- What is being decided, in one sentence, in the Home's own vocabulary.
- **What changes if this happens** — the concrete effect, computed and shown:
  the settlement table for a close, the outstanding amount for a removal, the
  before-and-after for a rule.
- The proposer, their reason, and when they proposed it.
- **Who is needed**, as a checklist: each person, their capacity ("must approve"
  or "must acknowledge"), and whether they have responded, with the time.
- The deadline, as a relative phrase ("3 days left") with the exact date beneath.
- Actions for the caller, and only those: Approve · Reject · Acknowledge.
- **States:** waiting; approved-not-yet-applied; applied with its result;
  rejected with the reason and who gave it; lapsed ("Nobody responded in time.
  Nothing changed."); cancelled.
- A person who is not a participant sees the whole screen read-only. Everyone can
  see every decision — that is the point.

#### S-37 Propose a decision — sheet
- Opened from the action that needs it: Close month, Reopen, Propose removal,
  Adjust a balance, Submit a rule.
- Shows what will be proposed, **who will be asked**, and how many responses it
  needs, before the person commits to asking.
- A reason field, required for anything Critical.
- One line that sets the expectation: "Nothing changes until they respond."

#### S-38 History — `/more/history`
- The permanent record, grouped by day, newest first.
- Every entry: what happened, who did it, when. Decisions show their full
  response chain inline.
- Filters: type, person, date range.
- This is the screen a Home opens when it is arguing. It is written to be read
  aloud: "30 Aug — Ravi proposed closing August. Kumar acknowledged. Six members
  acknowledged. Settlement closed."

#### S-39 Governance settings — `/more/settings/governance` (admin)
- The matrix, as a readable table rather than a form: each action, who can do it,
  and what else it needs.
- The configurable values from section 9 of
  [14-GOVERNANCE-SPEC.md](14-GOVERNANCE-SPEC.md).
- Editing anything here **proposes a change** rather than saving one, and the
  screen says so above the controls: "Changing these needs everyone's
  acknowledgement."

### 4.10 Rules — **new in 2.0**

#### S-40 Rules — `/more/rules`

```
┌────────────────────────────────────────┐
│  House Rules                           │
│                                        │
│  ✓ Clean dishes after eating           │
│    v2 · since 4 June       [ ⋯ ]       │
│                                        │
│  ✓ Bathroom cleaned every Sunday       │
│    v1 · since 12 May       [ ⋯ ]       │
│                                        │
│  ✓ ₹50 penalty per 10 missed points    │
│    v3 · since 1 August     [ ⋯ ]       │
│                                        │
│  ○ No outside guests after 11 PM       │
│    Disabled 20 July        [ ⋯ ]       │
│                                        │
│  [ + Add a rule ]                      │
└────────────────────────────────────────┘
```

- Each rule is its own row with its own Edit, Disable and History (RL-05).
- A rule waiting on a decision carries a "Waiting for the house" chip and its
  current version stays in force underneath.

#### S-41 Write a rule — `/more/rules/new` (admin)
- **One large text area first**, with the placeholder as an example: "Nobody
  should leave unwashed vessels overnight. If someone does, they clean the
  kitchen next morning."
- **Understand this** runs the parse. With AI configured it fills the structured
  fields below; without it, the fields are simply there to fill in, and the
  button is absent rather than disabled with an explanation (RL-08).
- The structured fields — When, Then, Applies to, Points, Penalty, Dates — are
  always visible and always editable. The parse is a head start, never a wall.
- A line under the parse, when one ran: "This is a suggestion. Check it before
  you submit."
- **Submit** opens S-37. The rule does not go live here.
- **States:** empty; parsing; parsed; parse unavailable; submitted and waiting.

#### S-42 Rule history — `/more/rules/:id/history`
- A version per row: number, dates in force, and what changed, field by field,
  from the previous version.
- Each version carries its reason and the people who acknowledged the decision
  that activated it, with times.
- The original text of every version is shown verbatim, because that is what the
  Home actually agreed to.

### 4.11 Food — **new in 2.0**

#### S-43 Food — `/food`
The layout in section 8 of [15-FOOD-SPEC.md](15-FOOD-SPEC.md): today's prompt,
the two-and-two suggestion card, then Library, History and Preferences.

Each suggestion card and each library entry carries a **Plan it** action, which
places that meal on a date the member picks (FD-20). A planned meal appears on
the Calendar and on Today for its date, clearly marked as an intention, with a
single **Confirm as eaten** control. Until that control is used it creates no
cost, no expense, no participants and no preference signal, and it appears in no
history or Insights view (BR-217).

#### S-44 Add meal — sheet

```
┌────────────────────────────────────────┐
│                                    ✕   │
│  What did you eat?                     │
│  ┌──────────────────────────────────┐  │
│  │ parupu sadam                     │  │
│  └──────────────────────────────────┘  │
│    Did you mean:                       │
│    ▸ Paruppu Sadham · eaten 14 times   │
│                                        │
│  Who ate it?                           │
│  [Arun ✓] [Vijay ✓] [Ruth ✓] [Karthik] │
│                                        │
│  🏠 Home cooked   🛍 Bought   🛵 Ordered│
│                                        │
│  ₹ 180              [ break it down ▾ ]│
│  ₹45 each · 4 people                   │
│                                        │
│  ─────────── optional ───────────────  │
│  Items · Meal type · Photo · Note      │
│  Recipe instructions (plain text)      │
│  ☑ Save to Food Library                │
│  🔗 Link to an expense                 │
│                                        │
│         [      Save meal      ]        │
└────────────────────────────────────────┘
```

- **Name, who, source, cost.** Everything else is below the fold and optional.
  A meal with only a name and today's date saves (FD-06).
- Participants default to everyone home today, one tap to deselect.
- The per-person figure updates live, under the cost field.
- "Break it down" expands to base, preparation, delivery and other.
- The did-you-mean panel offers; it never merges (FD-10).
- **Target: a name, a tap on who, and an amount.**

#### S-45 Meal detail — sheet
- Name, date, source, items, the full cost breakdown, participants and per-person
  cost, photo, note, recipe instructions (if present), and the linked expense if there is one.
- The caller's own rating, inline: ❤️ 😐 👎.
- Everyone else's ratings beneath, as faces with their rating.
- Actions: Edit · Delete · Make an expense from this · Link to an expense.
- Deleting says plainly that a linked expense is unaffected.

#### S-46 Suggestions card — component, on Food and Today

```
Try Today

🏠 From Your Home
🥘 Paruppu Sadham              ₹45/person
   Liked by 6 of 7 · 14 days ago
🍚 Curd Kolambu                ₹38/person
   Liked by 5 of 7 · 21 days ago

✨ New AI Ideas
🤖 Vegetable Kothu Parotta   est. ₹60/person
🤖 Egg Shawarma Bowl         est. ₹85/person
```

- The two halves are **visibly separated** and never interleaved (FD-14). The
  library half carries its reasons; the AI half carries an estimate and the
  robot mark.
- Tapping a library suggestion opens Add Meal pre-filled. Tapping an AI idea
  opens Add Meal with the name and nothing else — it has never been eaten here.
- **Cold start:** the library half reads "Not enough history yet — record a few
  meals and this fills in", and shows recent meals. The AI half is unaffected.
- **No AI:** the AI half is absent. No placeholder, no upsell, no error.
- A budget line appears above when food spend is over: "Outside-food spending is
  already high this month."

#### S-47 Food library — `/food/library`
- Searchable list: name, times eaten, last eaten, typical per-person cost, Home
  preference as a small face.
- Tapping opens the food: every meal of it, everyone's ratings, and its cost
  history.
- Lead actions: edit, merge two entries, deactivate.

#### S-48 Preferences — `/food/preferences`
- **Mine**: every food and item the caller has rated, editable in place.
- **The Home's**: each food with the spread of ratings across everybody.
- One line where an individual override is in force: "You dislike bitter gourd,
  so meals with it aren't suggested to you."

#### S-49 Meal history — `/food/history`
- Grouped by date, newest first. Name, source icon, per-person cost, participant
  faces.
- Filters: source, person, date range.

### 4.12 Today, Calendar and Insights — **new in 2.0**

#### S-50 Today — `/today`

The screen the product is used from.

```
┌────────────────────────────────────────┐
│  TODAY                     Wed 26 Aug  │
│                                        │
│  People            5 home · 2 away     │
│  ● ● ● ● ●  ○ ○                        │
│                                        │
│  MY CHORES                             │
│  ┌──────────────────────────────────┐  │
│  │▌Cook dinner          30 pts      │  │
│  │ 19:30 – 22:00      [ Done ✓ ]    │  │
│  └──────────────────────────────────┘  │
│                                        │
│  NEEDS YOU                        3    │
│  ┌──────────────────────────────────┐  │
│  │ Kumar — Kitchen cleaning         │  │
│  │ 1 of 2 confirmations             │  │
│  │ 2h ago    [ ✕ ]    [ Confirm ]   │  │
│  ├──────────────────────────────────┤  │
│  │ ⚠ Close August — you're needed   │  │
│  │                    [ Review → ]  │  │
│  └──────────────────────────────────┘  │
│                                        │
│  MONEY                    ₹1,240 today │
│  Groceries · Arun · pending approval   │
│                                        │
│  FOOD                                  │
│  🍛 What did you eat?   [ + Add Meal ] │
│  Try: Paruppu Sadham · Curd Kolambu    │
│                                        │
│  ANNOUNCEMENTS                         │
│  ⚠ Maintenance tomorrow 10 AM – water off   │
│    Posted by Arun · expires in 18h      │
│                                        │
│  [ View calendar → ]                   │
└────────────────────────────────────────┘
```

- Six blocks, in this order, always. A block with nothing in it is **omitted**,
  not shown empty — except Food, whose prompt is the point.
- Announcements are admin-only, time-boxed, broadcast messages. They appear
  above the calendar link and below Food. A non-admin member sees them but
  cannot create them.
- "Needs you" merges chore confirmations, expense approvals and decisions into
  one list, ordered by urgency. Critical decisions carry the ⚠ mark.
- A chore confirmation shows the quorum progress ("1 of 2 confirmations"), so
  confirming feels like contributing rather than like a rubber stamp.

#### S-51 Home — `/home` — **replaces S-08 `/dashboard`**
- The overview: the week's effort position, the month's money position, what is
  pending, and the Home's headline numbers.
- The standing card, top three plus the caller's own row.
- Who owes whom, for everyone — three rows and "see all" (DB-03).
- Entry points into each module.
- `/dashboard` redirects here.

#### S-52 Calendar — `/more/calendar`
- **Day · Week · Month** as a segmented control.
- **Day:** presence, chores with assignees, money logged, meals eaten, pending
  decisions, and any **planned** meals for that date (FD-20), marked as intentions
  and visually distinct from meals that were actually eaten.
- **Week:** points per member, total money, meals logged, approvals pending.
- **Month:** money, points, completion rate, meals, outside-food and
  home-cooking spend.
- Reachable from Today's footer link and from More (CL-05).

#### S-53 Shopping List — `/food/shopping` — **new in 2.0**
- A list of items needed for upcoming meals, derived from meal plans and pantry.
- Each item shows: name, quantity, unit, estimated price, linked meal (if any).
- Members can check off items; the list updates in real time.
- A "Generate from meals" button creates items from the next 7 days of meal plans.
- Checked-off items move to a "This week" section at the bottom.
- Reachable from Food (CL-03) and from the quick-add menu.

#### S-54 Game Layer — `/more/game` — **new in 2.0**
- Shown only when `game_layer_enabled` is true.
- Per-member cards showing: points total, current streak, longest streak, badges.
- No leaderboard, no ranking, no comparison between members.
- Badges displayed as a grid of icons with labels.
- Reachable from More (CL-05) and from member profiles.

#### S-55 Points breakdown — sheet — **new in 2.0**

Opened by tapping any points figure anywhere in the product (EF-12). Effort
points and game points alike.

```
┌────────────────────────────────────────┐
│                                    ✕   │
│  Arun · earned this month              │
│  412 points                            │
│                                        │
│  3 Aug  Clean bathroom          +25    │
│         confirmed by Ruth, Vijay       │
│  4 Aug  Mop common area          +8    │
│         shared with Karthik, Ruth      │
│  6 Aug  Wash dishes               0    │
│         rejected by Ruth —             │
│         "pans still in the sink"       │
│  7 Aug  Cook dinner               0    │
│         missed                         │
│                          ────────      │
│                          412 points    │
└────────────────────────────────────────┘
```

- The components **sum to the figure, visibly**. The running total is shown, and
  the last line matches the headline. If they ever disagree, the figure is wrong.
- Zero rows are shown deliberately: "why 412 and not 470" is the question people
  actually ask, and a miss or a rejection with its reason and its author is the
  answer.
- Rejections name the rejecting member and quote the reason. This is what makes a
  disputed figure resolvable by looking rather than by arguing.
- Also reachable from S-15, S-50, S-51, S-54 and S-28's chore view.

#### S-56 Position — `/money/position` — **new in 2.0**

The Money answer to "where do we stand", distinct from the ledger of entries
(IN-09, EX-13, EX-14).

```
┌────────────────────────────────────────┐
│  POSITION                   August ▾   │
│                                        │
│  YOU                                   │
│  Expected      ₹4,000                  │
│  Paid          ₹4,820   ▲ ₹820         │
│  Fair share    ₹3,750                  │
│  You are owed  ₹1,070                  │
│                                        │
│  THE HOME                              │
│  Expected ₹32,000 · Paid ₹30,100       │
│  ████████████████░░░  94%              │
│                                        │
│  RESERVE — House fund                  │
│  ₹8,000        in ₹12,000 · out ₹4,000 │
│  [ Contribute ]     [ Propose a draw ] │
│                                        │
│  BUDGETS                               │
│  Groceries  ₹6,420 / ₹8,000            │
│  ██████████████░░░░░                   │
│                                        │
│  [ Everyone's position → ]             │
└────────────────────────────────────────┘
```

- "You are owed ₹1,070" is the same number the settlement uses, from the same
  calculator. The two views may never disagree.
- **Expected contribution charges nobody.** Where it is set, the row reads as a
  comparison, never as a bill, and no Pay control appears next to it.
- Every member's position is visible to every member (EX-10): the footer link
  opens the same figures for everybody, not only the caller.
- Where no expected contribution is set, that row is omitted rather than shown as
  zero. Where there is no reserve, the block is omitted.
- Reachable from Money, from S-51 and from the Insights money view.

#### S-57 Reserve — `/money/reserve` — **new in 2.0**
- The pot's balance and its full movement history: every contribution with its
  member, every draw with the expense it paid and the decision that authorised it.
- **Contribute** posts directly. **Propose a draw** opens the decision flow and
  returns "waiting on the house" — never a completed movement (EX-14).
- A draw larger than the balance is refused at the form, with the balance shown,
  so nobody proposes something the Home cannot approve into effect.
- A line under the balance states the rule plainly: "This pot changes nobody's
  position until the house draws on it."

#### S-58 Export — `/more/export` — **new in 2.0**
- CSV of any Insights view, the Home's full history as a zip of CSVs, and the
  settlement statement as PDF (IN-10).
- Available to every Active member, for their own records and the Home's.
- No tier, no quota, no waiting period, and no upsell on this screen (CM-1, CM-3).

#### S-28 Insights — `/insights` — **changed in 2.0, replaces Analytics**
- One screen. A period control (Day · Week · Month), a type control
  (Money · Chores · Food · Home), and two filters (category, person).
- **Money:** spend by category, spend over time, who paid, paid versus fair
  share, who owes whom, and a link to the position view (S-56).
- **Chores:** workload by member, completed, missed, confirmed, pending,
  completion rate, and the top-three concentration ratio with its 45 percent
  reference line. Every figure opens S-55.
- **Food:** home-cooked versus outside, food spend, most liked, recently eaten,
  most repeated.
- **Home:** activity, pending decisions, workload imbalance.
- Export from any view.
- **In a Family Home**, the chores view is titled Contribution, has no ranking
  and no concentration ratio. The same data, and not a scoreboard.

---

## 5. Component inventory

Built on shadcn/ui primitives. These are the composed components the screens above require.

| Component | Props | Used by |
|-----------|-------|---------|
| `StatCard` | label, value, sublabel, trend, tone | S-08, S-20 |
| `ChoreCard` | assignment, variant (compact / full), actions | S-08, S-09, S-10 |
| `StatusChip` | status | everywhere chores appear |
| `MemberAvatar` | member, size, showName | everywhere |
| `PointsBar` | earned, target | S-08, S-15 |
| `MoneyText` | paise, tone (auto by sign), size | everywhere |
| `ExpenseRow` | expense, showMyShare | S-16 |
| `AmountKeypad` | value, onChange, currency | S-17 |
| `CategoryPicker` | categories, selected, onSelect | S-17 |
| `SplitPreview` | amount, participants, guests | S-17, S-18 |
| `TimeRangePicker` | leavesAt, returnsAt, onChange | S-05, S-27 |
| `AvailabilityPreview` | derived windows | S-05, S-27 |
| `LeaderRow` | rank, member, earned, target, carry | S-08, S-15 |
| `SettlementCard` | settlement, perspective (payer / receiver) | S-22 |
| `EmptyState` | icon, title, body, action | every list |
| `BottomSheet` | open, onClose, title, children | all sheets |
| `ConfirmAction` | label, confirmLabel, onConfirm | destructive actions |
| `ChartCard` | title, subtitle, children, exportable | S-28 |
| `HomeSwitcher` | homes, selected, onSelect | header, everywhere |
| `RoleChip` | role | S-34, S-36 |
| `DecisionCard` | decision, myCapacity, variant (queue / detail) | S-35, S-50 |
| `ParticipantChecklist` | participants, responses | S-36 |
| `EffectPreview` | decisionType, payload | S-36, S-37 |
| `DeadlineText` | deadline | S-35, S-36 |
| `QuorumProgress` | received, required, needsLead | S-11, S-50 |
| `ApproveAllBar` | eligibleCount, onApproveAll | S-35 |
| `RuleRow` | rule, version, actions | S-40 |
| `RuleFields` | condition, action, appliesTo, weights, onChange | S-41 |
| `VersionDiff` | previous, current | S-42 |
| `MealCard` | meal, variant (compact / full) | S-45, S-49 |
| `SuggestionCard` | library[], ai[], coldStart, budgetNote | S-46, S-50 |
| `RatingControl` | value, onChange | S-45, S-48 |
| `CostBreakdown` | base, prep, delivery, other, participants | S-44, S-45 |
| `FoodNameField` | value, matches, onChange, onPick | S-44 |
| `PresenceStrip` | home, away | S-50, S-52 |
| `OwesRow` | from, to, amount | S-51, S-28 |
| `QuickAddSheet` | role | the centre button |
| `LastDoneLine` | lastDoneAt, byName, pending | S-09, S-10, S-29 |
| `ShareSplitPreview` | points, members[] | S-12a |
| `PointsBreakdown` | figure, components[], total | S-55 |
| `PositionCard` | expected, paid, fairShare, variance | S-56, S-51 |
| `ReserveCard` | balance, contributed, drawn | S-56, S-57 |

---

## 6. Universal states

Every screen implements all five. A screen without an explicit empty state and an explicit error state is not complete.

| State | Treatment |
|-------|-----------|
| **Loading** | Skeleton matching the real layout's shape. Never a spinner on a full screen; never a layout shift when content arrives. |
| **Empty** | Icon, one-line explanation, and the action that resolves it. Never a bare "No data". |
| **Error** | Inline card with the plain-language cause and a Retry button. Technical detail behind a "details" disclosure. |
| **Offline** | A persistent amber strip at the top: "Offline — showing saved data". Current write actions fail honestly and remain retryable; do not show a queued/saved confirmation until an offline mutation queue is implemented and tested. |
| **Stale** | When cached data is older than 5 minutes, a subtle "updated 12m ago" line under the screen title. |

### Toast copy

| Event | Message |
|-------|---------|
| Chore marked done | "Marked done. Needs an admin and one other, or it auto-confirms in 48h." |
| Chore confirmed, quorum incomplete | "Confirmed. One more person needed." |
| Chore confirmed, quorum met | "Confirmed — 30 points to Kumar." |
| Expense saved | "₹1,240 added. Your share: ₹155." |
| Expense needs approval | "Saved. Waiting for someone to approve it." |
| Swap sent | "Swap request sent to Vinoth." |
| Offline write attempted | "You're offline. Reconnect to save this change." |
| Decision proposed | "Asked. 5 people need to respond." |
| Response recorded, still waiting | "Recorded. Waiting on Kumar and 2 others." |
| Response completed a decision | "August is closed. 7 payments created." |
| Decision lapsed | "Nobody responded in time. Nothing changed." |
| Approve All | "Approved 5. 2 need a closer look." |
| Join request raised | "Asked to join Chennai Flat. You'll be told when they answer." |
| Member accepted | "Karthik is in. Chores from next week." |
| Removal proposed with money outstanding | "Proposed. They'll stay in the money views until ₹1,240 is settled." |
| Meal saved | "Paruppu Sadham saved. ₹45 each." |
| Meal saved to the library | "Saved, and added to your Food Library." |
| Rating recorded | "Noted." |
| Rule submitted | "Submitted. The house needs to acknowledge it." |
| Rule activated | "Live from today. Version 2." |

---

## 7. Accessibility

| Requirement | Rule |
|-------------|------|
| Contrast | 4.5:1 for body text, 3:1 for large text and interactive borders, verified in both themes |
| Touch targets | 44 × 44 px minimum, with 8 px between adjacent targets |
| Focus | A visible 2 px `--primary` ring on every interactive element. Never removed. |
| Labels | Every input has a persistent visible label. Placeholder-only labelling is not used. |
| Status | Status is never conveyed by colour alone — every status chip carries text |
| Screen readers | Charts have a text summary alternative; icon-only buttons carry `aria-label` |
| Motion | `prefers-reduced-motion` collapses all transforms to opacity |
| Zoom | Layout remains usable at 200 percent text zoom |

---

## 8. Performance budget

| Metric | Budget |
|--------|--------|
| First contentful paint, 4G | < 1.8 s |
| Time to interactive, 4G | < 3.0 s |
| Initial JavaScript, gzipped | < 180 KB |
| Route chunk | < 60 KB |
| Largest contentful paint | < 2.5 s |
| Cumulative layout shift | < 0.1 |
| Interaction to next paint | < 200 ms |

Enforcing measures: charts are dynamically imported and only on the analytics route; images are served as WebP through `next/image`; the font is subset to Latin and preloaded; server components are used for every read path so that list screens ship no client JavaScript beyond their interactive controls.

---

## 9. PWA specifics

```json
{
  "name": "HouseOS",
  "short_name": "HouseOS",
  "start_url": "/today",
  "display": "standalone",
  "background_color": "#0C0A09",
  "theme_color": "#0F766E",
  "orientation": "portrait",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "shortcuts": [
    { "name": "Add expense", "url": "/money/new" },
    { "name": "Add meal",    "url": "/food/new" },
    { "name": "My chores",   "url": "/chores/mine" },
    { "name": "Approvals",   "url": "/more/approvals" }
  ]
}
```

The install prompt is deferred until the third session, and is shown as an inline dismissible card rather than an interrupting dialog.
