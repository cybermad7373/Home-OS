# 11 — Notifications Specification

**Product:** HouseOS
**Version:** 2.0
**Date:** 2026-08-26

Every notification the system can send: its trigger, its timing, its channel, its recipients, and its exact copy. Notifications are the only part of the product that reaches a member who has not opened the app — which makes them the mechanism by which the house's least engaged members are actually engaged. They are also the fastest way to make someone uninstall. The volume caps in section 5 exist for that reason and are not optional.

---

## 1. Channels

| Channel | Reach | Use |
|---------|-------|-----|
| **Push transport** | Web Push/VAPID for browser and PWA devices in product phase 1; native provider adapters for Android/iOS in product phase 2 | The only channel that leaves the app. Everything time-sensitive. |
| **In-app feed** | Everyone, always | Every notification is written here regardless of push outcome. The feed is the record. |
| **Badge counts** | Tab bar | Pending confirmations and pending approvals only. |

Delivery order: write the feed row first, then attempt push to every device the member has registered. A device that fails never blocks the others.

**This ordering is a commitment, not an implementation detail.** The competitive
analysis records notification reliability as an unresolved complaint against two
competitors, and the answer here is structural: the feed row is written before
any push is attempted, so a notification exists whether or not a phone received
it, and one dead device never suppresses the others. A member who says "I never
got told" can always be shown the row and its timestamp. The assertion is tested
— see the feed guarantee in section 9 — and it holds for every type in the
catalogue, including the ones a member has muted (a muted category produces no
push and still produces a feed row).

There is no second messaging channel. An earlier version of this spec put a Telegram bot here as a fallback for members whose push does not arrive; it was removed before it was ever switched on (DECISIONS.md D-34). The answer to "push did not reach me" is another registered device, not another company's network.

---

## 2. Notification catalogue

Fifty-seven notification types. N-01 to N-31 are specification 1.0; N-32 to N-57
are new in 2.0, N-52 to N-57 arriving with the competitive-analysis additions.
`{braces}` are substituted at send time.

### 2.1 Chores — assignment and reminder

| ID | Trigger | Timing | To | Title | Body |
|----|---------|--------|----|-------|------|
| N-01 | Weekly schedule published | Sunday 20:05 | All members | "Next week's chores are up" | "You have {n} chores, {points} points. First one: {chore}, {day}." |
| N-02 | Chore window opens soon | 30 min before window start, or at start if window < 1h | Assignee | "{chore} — {time}" | "{points} points. Window: {start} to {end}." |
| N-03 | Chore due today, still not done | 2 hours before deadline | Assignee | "{chore} still pending" | "Due by {deadline}. {points} points." |
| N-04 | Chore assigned by admin override | Immediately | New assignee | "You've been given {chore}" | "{day}, {slot}. {points} points. Assigned by {admin}." |
| N-05 | Chore reassigned away from you | Immediately | Previous assignee | "{chore} moved to {name}" | "You no longer have this one." |

### 2.2 Chores — confirmation

| ID | Trigger | Timing | To | Title | Body |
|----|---------|--------|----|-------|------|
| N-06 | Someone marks a chore done | Immediately | The members the quorum needs | "{name} did {chore}" | "Confirm it, or it auto-confirms in {hours}h." |
| N-07 | Your chore confirmed | Immediately | Assignee | "{points} points added" | "{confirmer} confirmed {chore}. You're at {earned} of {target} this week." |
| N-08 | Your chore auto-confirmed | At the window close | Assignee | "{points} points added" | "{chore} auto-confirmed — nobody responded in {hours}h." |
| N-09 | Your chore rejected | Immediately | Assignee | "{chore} was rejected" | "{rejecter}: \"{reason}\" — you have until {new deadline} to redo it." |
| N-10 | Rejected chore redone and confirmed | Immediately | Original rejecter | "{name} redid {chore}" | "Confirmed by {confirmer}." |

### 2.3 Chores — misses and escalation

| ID | Trigger | Timing | To | Title | Body |
|----|---------|--------|----|-------|------|
| N-11 | Deadline passed, not done | At deadline | Assignee | "{chore} missed" | "0 points. You're {deficit} points behind this week." |
| N-12 | Escalation — house feed | 2 hours after N-11 | All members | "{name} missed {chore}" | "{points} points unearned. Currently {deficit} behind." |
| N-13 | Deficit warning | Friday 19:00, when the member is more than 40 points behind | That member | "You're {deficit} points behind" | "At month end that's about ₹{amount}. {n} chores left this week." |

N-12 is the sharpest notification in the product. It is what converts a private lapse into a house-visible fact, which is the entire enforcement mechanism working as designed. It fires only after the private reminder in N-11 has gone unanswered for two hours.

### 2.4 Chores — swaps and the pool

| ID | Trigger | Timing | To | Title | Body |
|----|---------|--------|----|-------|------|
| N-14 | Swap requested of you | Immediately | Target member | "{name} wants to swap {chore}" | "{day}, {points} points. \"{message}\"" |
| N-15 | Swap accepted | Immediately | Requester | "{name} took {chore}" | "The {points} points go to them." |
| N-16 | Swap declined | Immediately | Requester | "{name} declined {chore}" | "It's still yours — {day}, {deadline}." |
| N-17 | Chore released to the pool | Immediately | All members | "{chore} is up for grabs" | "{points} points, {day}. First to claim it gets them." |

### 2.5 Money

| ID | Trigger | Timing | To | Title | Body |
|----|---------|--------|----|-------|------|
| N-18 | Expense needs your approval | Immediately | All members except the payer | "{name} added ₹{amount}" | "{category} — needs approval. Your share: ₹{share}." |
| N-19 | Your expense approved | Immediately | Payer | "₹{amount} approved" | "Approved by {approver}." |
| N-20 | Your expense rejected | Immediately | Payer | "₹{amount} rejected" | "{rejecter}: \"{reason}\"" |
| N-21 | Budget threshold crossed | Daily 20:00, on the day it crosses | All members | "{category} is at {percent}%" | "₹{spent} of ₹{budget} this month." |

### 2.6 Settlement

Settlement notifications ignore quiet hours, because a member who is owed money should learn it when it happens.

| ID | Trigger | Timing | To | Title | Body |
|----|---------|--------|----|-------|------|
| N-22 | Month closed | On close | All members | "{Month} is settled" | *If owing:* "You owe ₹{amount}. Tap to pay." *If owed:* "You're owed ₹{amount}." *If neither:* "You're square." |
| N-23 | Payment marked paid | Immediately | Receiver | "{name} says they paid ₹{amount}" | "Confirm when it lands." |
| N-24 | Payment confirmed | Immediately | Payer | "{name} confirmed your ₹{amount}" | "Settled." |
| N-25 | Settlement outstanding | Daily from day 7 after close | Both parties | "₹{amount} still unsettled" | "{payer} to {receiver}, from {month}." |
| N-26 | Period reopened | Immediately | All members | "{Month} was reopened" | "{admin} reopened it for a late ₹{amount} expense. New amounts to follow." |

### 2.7 House and digest

| ID | Trigger | Timing | To | Title | Body |
|----|---------|--------|----|-------|------|
| N-27 | New member joined | On approval | All members | "{name} joined the house" | "Room {room}. Chores from next week." |
| N-28 | Guest registered | Immediately | All members | "{host} has a guest: {name}" | "{from} to {to}. Counts for shared costs." |
| N-29 | Weekly digest | Sunday 21:00 | All members | "This week in the house" | The digest summary from [10-LLM-SPEC.md](10-LLM-SPEC.md), truncated to 180 characters, with a link to the full text. |
| N-30 | Unassignable chores | On generation, if any | Admin only | "{n} chores couldn't be assigned" | "Nobody is available for them. Tap to fix." |
| N-31 | AI key rejected | On the transition to `disabled` | Admin only, once per replacement | "AI features are off" | "Your {provider} key was rejected. Replace it in settings." |

### 2.8 Governance — **new in 2.0**

These are the notifications that make shared decisions work. A decision nobody
is told about is a decision that lapses.

| ID | Trigger | Timing | To | Title | Body |
|----|---------|--------|----|-------|------|
| N-32 | A decision needs your response | Immediately | Each required participant | "{proposer} wants to {action}" | "You need to {approve\|acknowledge} this. {n} others too." |
| N-33 | Decision deadline approaching | 24h before the deadline | Participants who have not responded | "{action} — 1 day left" | "Nothing happens until you answer." |
| N-34 | Decision resolved | On resolution | Everyone in the Home | "{action}: {outcome}" | "{n} approved, {m} acknowledged." |
| N-35 | Your decision was rejected | On rejection | The proposer | "{name} said no to {action}" | "\"{reason}\"" |
| N-36 | Decision lapsed | At the deadline | The proposer, and everyone who did respond | "{action} lapsed" | "Nobody answered in time. Nothing changed." |
| N-37 | Decision approved but could not be applied | On failure | The proposer | "{action} couldn't be done" | "The house agreed, but: {reason}" |

N-32 is addressed **only to the people whose response is required** (NT-07).
Broadcasting a decision to the whole Home is how the Approvals queue becomes
noise everyone learns to ignore. N-34 goes to everyone, because the outcome is
Home news even where the decision was not.

### 2.9 Membership — **new in 2.0**

| ID | Trigger | Timing | To | Title | Body |
|----|---------|--------|----|-------|------|
| N-38 | Somebody asked to join | Immediately | Admin and Co-Admin | "{name} wants to join" | "\"{message}\"" |
| N-39 | Your request was accepted | On acceptance | The requester | "You're in — {home}" | "Set when you're home, and you're done." |
| N-40 | Your request was declined | On decline | The requester | "{home} declined your request" | "\"{reason}\"" |
| N-41 | A new member joined | On acceptance | All members | "{name} joined" | "Chores from next week." |
| N-42 | Your removal was proposed | On proposal | The subject | "{proposer} proposed removing you" | "\"{reason}\" — the house is deciding." |
| N-43 | You are inactive, pending settlement | On the removal applying | The subject | "You're no longer active in {home}" | "₹{amount} is still to settle. You'll stay in the money view until it's clear." |
| N-44 | You were made a co-admin | On the role change | The member | "You're a co-admin of {home}" | "You can now approve day-to-day things and you're needed for the big ones." |

N-42 is deliberately sent **to the person being removed**, at proposal time
rather than after the fact. A Home that decides to remove somebody without
telling them is not using a governance feature, it is using a trapdoor.

### 2.10 Food — **new in 2.0**

Built with phase 13, which is the module these describe. Everything above,
N-32 to N-44, ships with phase 11.

Food gets **one** optional notification and no others. It is the module most
capable of becoming nagging, and a food diary that pesters is a food diary that
gets switched off along with everything else.

| ID | Trigger | Timing | To | Title | Body |
|----|---------|--------|----|-------|------|
| N-45 | Daily meal suggestion | Configurable, default 17:00, **off by default** | All members | "Tonight: {meal}" | "{reason}. About ₹{amount} a head." |
| N-46 | Food budget crossed | Daily 20:00, on the day it crosses | All members | "Food is at {percent}% this month" | "₹{spent} of ₹{budget}. {n} low-cost meals in your library." |

N-45 is the only notification in the product that is **off by default**.
Everything else the app sends is about an obligation; a meal suggestion is not,
and a person who wants it will find it.

### 2.11 Rules — **new in 2.0**

| ID | Trigger | Timing | To | Title | Body |
|----|---------|--------|----|-------|------|
| N-47 | A rule became active | On activation | All members | "New rule: {title}" | "{summary}" |
| N-48 | A rule changed | On activation of a new version | All members | "{title} changed" | "{old} → {new}" |

Rule notifications carry the plain summary, not the parsed structure. Nobody
needs to read a condition object at 21:00.

### 2.12 Announcements — **new in 2.0**

| ID | Trigger | Timing | To | Title | Body |
|----|---------|--------|----|-------|------|
| N-49 | An announcement was posted | Immediately | All members | "{title}" | "{body}" |

Announcements are broadcast-only and do not require acknowledgement. The
notification is a one-time alert; the announcement persists on the Today
screen until it expires.

### 2.13 Shopping list — **new in 2.0**

| ID | Trigger | Timing | To | Title | Body |
|----|---------|--------|----|-------|------|
| N-50 | Shopping list generated | On generation | All members | "Shopping list ready" | "{n} items from {m} meals this week" |
| N-51 | Shopping list reminder | Wednesday 18:00, if unchecked items remain | All members | "Shopping list still has {n} items" | "Mark items off before the weekend shop." |

Shopping notifications are low-priority and respect the volume cap. They
never interrupt; they inform.

### 2.14 The reserve and the position — **new in 2.0**

| ID | Trigger | Timing | To | Title | Body |
|----|---------|--------|----|-------|------|
| N-52 | A draw from the reserve is proposed | Immediately | Required participants | "{name} proposed a draw of ₹{amount}" | "For {expense}. The house has to approve it." |
| N-53 | A draw is applied | On apply | All members | "₹{amount} drawn from {reserve}" | "{expense} is covered. The pot now holds ₹{balance}." |
| N-54 | A contribution is recorded | On contribution | All members | "{name} put ₹{amount} into {reserve}" | "The pot now holds ₹{balance}." |
| N-55 | An expected contribution is set or changed | On apply | The member it concerns, and all members | "Expected contribution set to ₹{amount}" | "Agreed by the house. It is a comparison, not a charge." |

N-55's body says what it says deliberately: an expected contribution charges
nobody (BR-280), and the notification is the first place a member could
misunderstand that.

### 2.15 Planned meals — **new in 2.0**

| ID | Trigger | Timing | To | Title | Body |
|----|---------|--------|----|-------|------|
| N-56 | A meal is planned for tomorrow | 20:00 the day before | All members | "{meal} planned for tomorrow" | "Whoever cooks, it is on the calendar." |
| N-57 | A planned meal's date passes unconfirmed | 21:00 that day | The member who planned it | "Did you eat {meal}?" | "Confirm it, or it drops off the calendar." |

Both respect the volume cap and the Food category switch. N-57 asks once and
never again: an unconfirmed plan is dropped, not chased (BR-218).

---

## 3. Timing rules

### 3.1 Availability-aware reminders

A reminder must arrive when the member can act on it. Sending a 09:00 reminder for an evening chore to someone who is at work is how notifications become noise.

```
function reminderTime(assignment, member):
    windowStart = assignment.window_start
    candidate   = windowStart − 30 minutes

    // never before they are home
    if member returns at R on that date and candidate < R:
        candidate = R + 5 minutes

    // never inside quiet hours
    if candidate ∈ quietHours(member):
        candidate = quietHoursEnd(member)

    // never after the deadline
    if candidate > assignment.deadline:
        candidate = windowStart

    return candidate
```

**Worked example.** Suresh returns at 22:00. His evening chore's window is 22:00–23:00, deadline 23:00. Reminder at 21:30 would arrive while he is commuting. The rule moves it to 22:05, five minutes after he is home.

### 3.2 Quiet hours

Default 23:00 to 07:00, per member. Suppressed notifications queue and deliver at the end of quiet hours, coalesced into one if more than one accumulated.

**Exempt:** N-22, N-23, N-24 (settlement). Nothing else.

### 3.3 The dispatcher

Runs every fifteen minutes, not hourly. A reminder due thirty minutes before a
window cannot survive a sixty-minute poll; the reasoning is D-27, and this
sentence is the specification being reconciled with it rather than the
specification being ignored.

Idempotent by construction.

```
for each house:
  for each member:
    due = notifications where scheduled_for ≤ now and sent_at is null
    due = filter(due, not in quiet hours, or type is exempt)

    if count(sent today) + count(due) > 6:
        coalesce due into one digest notification
    for each n in due:
        write feed row
        try push to every registered device;  on 404/410 delete that subscription
        set sent_at
```

---

## 4. Push payload

```json
{
  "title": "Cook dinner — 19:30",
  "body": "30 points. Window: 19:30 to 22:00.",
  "icon": "/icon-192.png",
  "badge": "/badge-72.png",
  "tag": "chore-{assignment_id}",
  "data": { "url": "/chores/{assignment_id}", "type": "N-02" },
  "actions": [
    { "action": "done",  "title": "Mark done" },
    { "action": "later", "title": "Snooze 1h" }
  ],
  "requireInteraction": false
}
```

- `tag` collapses repeats: a second reminder for the same chore replaces the first rather than stacking.
- The `done` action marks the chore done directly from the notification shade, without opening the app. This is the single highest-value interaction in the product — it removes every step between remembering and recording.
- `later` reschedules the reminder one hour on, at most twice.

### Service worker handler

```js
self.addEventListener('notificationclick', (event) => {
  const { url, type } = event.notification.data;
  event.notification.close();

  if (event.action === 'done') {
    event.waitUntil(
      fetch(`/api/chores/${idFrom(event.notification.tag)}/done`, { method: 'POST' })
        .then(() => self.registration.showNotification('Marked done', {
          body: 'Waiting for someone to confirm.', tag: event.notification.tag
        }))
    );
    return;
  }
  if (event.action === 'later') { /* schedule +1h, max 2 */ return; }

  event.waitUntil(clients.openWindow(url));
});
```

---

## 5. Volume control

The limits that keep the app installed.

| Rule | Value |
|------|-------|
| Maximum push per member per day | 6 |
| Overflow behaviour | Coalesced into one "3 things need you" digest, linking to the feed |
| Maximum reminders per chore | 2 — one before the window, one before the deadline |
| Snooze limit | 2 per chore |
| Escalation entries per member per day | 1 house-feed post maximum, regardless of how many chores were missed |
| Digest | Exactly one per week |
| Duplicate suppression | The same `tag` within 10 minutes replaces rather than adds |

**Priority when the cap is reached**, highest first: settlement, **decisions
whose deadline is inside 24 hours**, confirmation requests, chore reminders due
within the hour, **other decisions addressed to you**, approvals, everything
else. Lower priorities are dropped into the coalesced digest rather than sent
individually.

Version 2.0 adds three volume rules of its own, because governance is the part of
the product most able to generate notification traffic:

| Rule | Value |
|------|-------|
| Decision reminders per decision per person | 1 — the 24-hour warning, and nothing between proposal and deadline |
| Decision outcome notifications | 1 per decision, to everyone, on resolution. Not one per response. |
| Food suggestions | 1 per day maximum, and off by default |

The second is the important one. A Critical decision with eight participants
collects up to eight responses; sending the Home a push for each would be eight
notifications about one event. The Home is told once, when it is settled.

---

## 6. Preferences

Per member, in `notification_prefs`:

| Setting | Default | Controls |
|---------|---------|----------|
| Chore reminders | On | N-01 to N-05 |
| Confirmation requests | On | N-06 |
| My chore outcomes | On | N-07 to N-11 |
| House activity | On | N-12, N-17, N-27, N-28, N-41 |
| Expense activity | On | N-18 to N-21 |
| Settlement | On, **not disableable** | N-22 to N-26 |
| **Decisions** | On, **not disableable** | N-32, N-33, N-35, N-36, N-37, N-42, N-43 |
| **Decision outcomes** | On | N-34, N-47, N-48 |
| **Membership** | On | N-38, N-39, N-40, N-44 |
| **Food** | **Off** | N-45 |
| Weekly digest | On | N-29 |
| Quiet hours | 23:00–07:00 | All except settlement and decisions with a deadline inside 24 hours |

**Two categories cannot be switched off**, and for the same reason:

- **Settlement.** A member who has muted the app cannot then claim they were
  never told they owed money.
- **Decisions addressed to you personally** — N-32, N-33, N-35, N-36, N-37,
  N-42, N-43. A Home where a required participant can silence the request and
  then say nobody asked has a governance model on paper only. Muting these would
  make lapse the default outcome of every Critical decision.

N-34 (somebody else's decision resolved) and the rule notifications **are**
mutable, because they are news rather than an obligation. The line is exactly
that: if the notification is asking the reader to do something only they can do,
it cannot be muted.

The settings screen shows both locked rows with a padlock and that sentence,
rather than hiding them (D-30). A rule a member discovers by being surprised is a
rule they resent; a rule stated in advance is one they accepted.

**Food is the only category that is off by default**, for the reason in section
2.10.

**Where these live.** The switches are columns on `notification_prefs`;
`decisions`, `decision_outcomes` and `membership` arrived with migration 055,
which also seeds N-32 to N-44 and adds the two triggers and one job that
produce them. `decisions` is written like `settlement_updates` — stored, and
forced true by `set_notification_prefs` — so that "cannot be switched off" is a
property of the database rather than of the settings screen.

---

## 7. Devices

A member is reached by every device they have registered. Each registration is
one row in the device model, but its transport metadata is provider-specific.
The browser on a laptop and a native app on a phone are two registrations and
one notification.

`platform` records where the row came from — `web`, `android` or `ios` — and a
provider/transport field (to be added by the phase-2 device migration) selects
the dispatcher adapter. Web uses the current
Web Push endpoint and VAPID encryption keys. Native clients use their platform
push provider token and lifecycle; they must not reuse browser endpoints or
VAPID credentials.

Settings lists every device with a label derived from its user agent ("Chrome on Android", "Android app"), when it was last used, and a control to remove it. Removing the device being used unsubscribes it locally as well — deleting the row alone would leave the browser holding a subscription nothing sends to, and the next app open would register it again.

A device is also removed without being asked: a 404 or 410 from the push service means the endpoint is dead, and the dispatcher deletes it after the batch rather than during it.

---

## 8. In-app feed

`/notifications`. Grouped by day, newest first. Unread carry a dot and a tinted background. Every row deep-links to the thing it is about. Actionable rows (a confirmation request, a swap request) carry their buttons inline, so the feed itself is a work queue rather than a log.

Read state syncs across devices. "Mark all read" is present. Entries older than 90 days are pruned by the monthly job.

---

## 9. Testing

| Test | Assertion |
|------|-----------|
| Quiet hours | A chore reminder scheduled for 23:30 is delivered at 07:00, not at 23:30 |
| Settlement exemption | A settlement notification at 02:00 is delivered at 02:00 |
| Availability timing | A member returning at 22:00 receives their evening reminder after 22:00, never at 21:30 |
| Volume cap | The seventh notification in a day is coalesced, not sent |
| Expired subscription | A 410 deletes the subscription and does not abort the remaining sends in the batch |
| Feed guarantee | Every notification type writes a feed row even when push fails on every device |
| Tag collapse | Two reminders for the same chore produce one visible notification |
| Escalation order | N-11 always precedes N-12 by the configured two hours |
| Action handler | The `done` action marks the chore done without opening the app |
| Preferences | A disabled category produces no push, but still produces a feed row |
| Decision addressing | N-32 reaches exactly the required participants and nobody else |
| Decision cannot be muted | Attempting to disable the decisions category through the API changes nothing, and the schema does not accept it |
| Decision reminder | Exactly one 24-hour warning per decision per person, and none between |
| Decision outcome | One N-34 per decision, not one per response |
| Removal is told | N-42 reaches the subject at proposal time, before anything is decided |
| Quorum addressing | N-06 reaches the members the quorum needs, not every member |
| Food default | A new Home sends no N-45 until somebody switches it on |
| Food volume | Never more than one suggestion in a day, whatever the screen does |
| Draw addressing | N-52 reaches the participants the decision requires, and N-53 reaches everybody — a movement of the Home's money is not private |
| Expected contribution copy | N-55 states that it is a comparison and not a charge, in every locale the product ships |
| Plan chased once | N-57 is sent at most once per planned meal; an unconfirmed plan produces no second notification |
