# 15 — Food

**Product:** HouseOS
**Version:** 2.0
**Date:** 2026-08-28
**Depends on:** [01-BRD.md](01-BRD.md) section 6.10

Food is a first-class module, not an AI feature and not an expense category. It
records what the Home ate, what it cost, who ate it and whether anyone liked it —
and then answers "what do we eat tonight" from the Home's own history before it
ever asks a model.

---

## 1. What a meal is

A meal is a **named thing**, not a slot.

Wrong:

```text
Dinner = "KFC"
```

Right:

```text
Meal
────────────────────
Name:          KFC Combo
Date:          26 Aug
Meal type:     Dinner
Source:        Bought
Items:         Chicken, Mayo, Sprite
Base cost:     ₹520
Preparation:   ₹0
Delivery:      ₹60
Other:         ₹0
Total:         ₹580
Participants:  Arun, Ruth, Vijay
Per person:    ₹193.33
```

Another:

```text
Meal
────────────────────
Name:          Paruppu Sadham
Source:        Home Cooked
Items:         Rice, Dal, Ghee, Pickle
Ingredients:   ₹130
Preparation:   ₹30
Other:         ₹20
Total:         ₹180
Participants:  4
Per person:    ₹45
```

`Breakfast`, `Lunch`, `Dinner` and `Snack` survive as a `meal_type` field —
useful for suggesting the right thing at the right hour — but they are metadata
on a named meal, never the meal's identity.

### 1.1 Why items

A meal contains zero or more items because cost, preference and later nutrition
all decompose along them. "Vijay dislikes chicken" is a fact about an item, and
it is what lets the recommender avoid every meal containing chicken for Vijay
without anyone tagging meals by hand. The items are also where a pantry or a
nutrition feature would attach later, which is why they exist now even though
neither is in version 2.

Items are lightweight: a name, an optional quantity string, an optional cost
share. They are not a recipe engine and there are no measurements to validate.

---

## 2. Costs

| Field | Meaning |
|-------|---------|
| `base_cost_paise` | Ingredients for a home-cooked meal; the purchase price for a bought or ordered one |
| `prep_cost_paise` | Gas, labour paid for, anything spent turning ingredients into food |
| `delivery_cost_paise` | Optional. Delivery, packaging, service charge |
| `other_cost_paise` | Optional. Anything else |
| `total_cost_paise` | The sum. Stored, not derived on read, so history is stable |

All integer paise, like every other amount in the product (D-01).

### 2.1 Per-person cost

```
per_person = total_cost_paise / count(participants)
```

**Participants, not Home size.** A ₹180 meal three people ate is ₹60 each, not
₹22.50 across eight. A meal with no participants recorded has no per-person cost
and says so rather than guessing.

The remainder is handled the same way expense splits handle it — one paisa at a
time in participant-id order — so a displayed per-person figure never fails to
sum back to the total.

---

## 3. Food and Money are loosely coupled

This is the rule that keeps both usable.

```text
Expense  ──────────► Money system          (always works alone)
Meal     ──────────► Food history          (always works alone)
         ◄─ optional link ─►
```

| Rule | Detail |
|------|--------|
| FD-06 | Recording food is never mandatory. |
| FD-07 | A meal *may* reference an expense and an expense *may* reference a meal. Neither is required, in either direction. |
| FD-08 | A meal can generate an expense on explicit request, using the meal's participants as the split. It never does so automatically. |

Two consequences worth stating because they are easy to break:

- **Adding an expense must never open a food form.** The ten-second expense entry
  is the most-used flow in the product and nothing may be added to it.
- **Deleting or voiding an expense does not delete a meal**, and vice versa. The
  link is a reference, not ownership.

The expense screen offers "Link to a meal" as one chip among the others; the
meal screen offers "Link to an expense" the same way, matching on the same date
and a similar amount so the usual case is one tap.

---

## 4. The Food Library

Every meal can be saved to the Home's library so it never has to be described
twice.

```text
Add Meal

Name:  Paruppu Sadham
       ┌──────────────────────────────┐
       │ Did you mean:                │
       │   Paruppu Sadham   (14 eaten)│
       └──────────────────────────────┘

Save to Home Food Library?  ☑
```

### 4.1 Deduplication

Without this the library becomes:

```text
Parupu Sadham
Paruppu Sadam
Paruppu Sadham
Parupu Rice
```

The match is deterministic and runs before anything is written:

1. Normalise: lowercase, strip punctuation, collapse whitespace.
2. Exact match on the normalised form → offer it.
3. Otherwise Levenshtein distance ≤ 2 for names under 12 characters, ≤ 3 above →
   offer the closest three.
4. Otherwise treat it as new.

**The user decides.** The system offers; it never merges silently. AI may help
normalise a name when it is configured, and its output is still a suggestion the
person confirms (FD-10). A wrongly merged food is a worse outcome than a
duplicate, because a duplicate can be merged later and a merge cannot be
unpicked.

Merging two library entries is available to Admin and Co-Admin and rewrites the
references, keeping both original names in History.

### 4.2 What the library holds

```text
FoodLibraryEntry
├── name, normalised_name
├── default_source          home_cooked | bought | ordered | other
├── default_items[]
├── typical_cost_paise      rolling median of recorded meals
├── times_eaten
├── last_eaten_on
├── home_preference_score   derived from feedback
└── active
```

`typical_cost_paise` is a median rather than a mean because one catered biryani
should not make the library think biryani costs ₹4,000 a head.

---

## 5. Preferences and feedback

### 5.1 The vote

Three options, deliberately:

```text
How do you feel about this?

❤️ Like     😐 Okay     👎 Dislike
```

Anyone can rate any meal or any food, at any time, and change their mind. A
rating is per person per food, not per person per meal instance — "I like
paruppu sadham" is a standing fact, and the meal on 26 August is evidence for it
rather than a separate opinion.

"Would eat again / not often / never" is a deliberate version-3 idea. Three
options are enough to rank with and few enough that people actually tap them.

### 5.2 Two levels of preference

| Level | How it is computed | Used for |
|-------|--------------------|----------|
| **Home preference** | Aggregated over everyone's ratings: `(likes − dislikes) / total`, in −1…+1 | Ranking a meal as a Home meal |
| **Person preference** | That person's own rating, and the ratings of the items the meal contains | Ranking suggestions shown to that person |

**Individual overrides Home, for that individual only** (FD-13):

```text
Home likes:      Chicken Biryani ❤️
Vijay dislikes:  chicken 👎

For Vijay:       do not recommend
For the Home:    still an acceptable Home meal
```

This prevents one person's preference corrupting the entire Home's suggestions,
which is what a single blended score would do.

### 5.2a Restrictions — a hard exclusion, not a preference

A dislike is a weight. A **restriction** is not: it is a fact about a person that
no score may outrank. Allergy, intolerance, and a diet someone holds
absolutely — vegetarian, vegan, no beef, no pork, halal, jain — all behave the
same way, so they are one concept with a severity, not four features.

| | Dislike | Restriction |
|---|---|---|
| Stored on | `food_preferences.rating` | `member_restrictions` |
| Effect on ranking | A term in the score, weight 0.35 | Removes the candidate from the set entirely, before scoring |
| Can be outweighed | Yes, by cost, recency or Home preference | **No.** There is no score at which a restricted item is shown |
| Applies to the Home meal | No — the Home may still cook it | A meal containing an item restricted for a **participant** is flagged before it is saved |
| Reversible by the person | Yes, any time | Yes, but only by that person or, for a dependent, their guardian |

Severity decides what happens when a restricted item nonetheless appears on a
meal a person is a participant in:

| Severity | Meaning | On recommendation | On a meal being recorded |
|---|---|---|---|
| `allergy` | Eating it is a medical event | Never surfaced, in either the library half or the AI half | Saving is **blocked** with `FOOD_RESTRICTION_VIOLATION`, naming the member and the item. It can only be saved by removing that member from the participants |
| `intolerance` | Eating it makes them ill | Never surfaced | Warned, and saveable on explicit confirmation |
| `diet` | They do not eat it | Never surfaced | Warned, and saveable on explicit confirmation |

The rules that follow from this, in the order they are checked:

1. **Restrictions filter before scoring, never after.** A candidate carrying a
   restricted item for the person being served is removed from the candidate
   set. It is never ranked and then hidden, because a filter applied after
   ranking is a filter that a later refactor can drop.
2. **A restriction is per person, and it always applies to that person.** Unlike
   a dislike, it does not stop at the individual view: the Home's suggestions
   are computed per person, and there is no Home-level "acceptable anyway".
3. **Empty is a legitimate answer.** If every candidate is restricted for
   everyone present, the recommender shows nothing and says why. It does not
   relax the filter to fill the two slots.
4. **Unknown composition is treated as restricted.** A restaurant or delivery
   food whose items were never recorded cannot be proven safe, so it is excluded
   for anyone with an `allergy`-severity restriction and marked
   "composition unknown" for everyone else. Absence of evidence is not safety.
5. **A restriction never appears in a Home-wide report.** It is health
   information about one person. Insights aggregate it to nothing; the
   recommender reads it and the meal form checks it, and nothing else does.

**The limit of the matching, stated rather than assumed.** Matching is textual
containment on a canonical form — lowercased, punctuation collapsed — in both
directions, so "peanut" catches "peanut oil" and "peanut chutney". It knows
nothing about synonyms: a member restricted from **peanut is not protected from
an item somebody recorded as "groundnut"**. This is a real gap and the mitigation
is deliberate — the restriction entry screen offers known aliases so the member
adds both, rather than the matcher guessing at what two words mean. A matcher
that guesses is a matcher that will one day guess wrong in the direction that
matters. `tests/integration/food-restrictions.test.ts` asserts this limit
explicitly, so it is a known property rather than a surprise.

### 5.3 The feedback loop

```text
Ratings and what actually got eaten
        ↓
Recommendation ranking
        ↓
Somebody picks one, or ignores both
        ↓
That becomes evidence
        ↓
Ranking improves
```

This is a scoring function over stored data, updated as the data changes. It is
not model training, it needs no LLM, and it is deterministic — the same inputs
always produce the same ranking, which is what makes it testable and what makes
"why is this being suggested" answerable in the interface.

---

## 6. The two recommendation paths

Two clearly separated groups, exactly two suggestions each. The separation is
the point: it is what makes the AI half trustworthy, because the reader can see
which half is the Home's own history and which half is invention.

```text
Try Today

🏠 From Your Home
   1. Paruppu Sadham          ₹45/person
   2. Curd Kolambu            ₹38/person

✨ New AI Ideas
   1. Vegetable Kothu Parotta  est. ₹60/person
   2. Egg Shawarma Bowl        est. ₹85/person
```

### 6.1 Library recommendation — deterministic, always available

Candidates: active library entries eaten at least once, suitable for the current
meal type, **less every entry carrying an item restricted for the person being
served** (§5.2a). The restriction filter runs first and is not a term in the
score; nothing below can put a restricted food back into the set.

```
score(food, person, home, now) =
      w_pref     × preference(food, person, home)      // −1 … +1
    + w_recency  × recencyBonus(food.last_eaten_on)    //  0 … +1
    − w_repeat   × repetitionPenalty(food, 30 days)    //  0 … +1
    − w_cost     × costPressure(food, budget_state)    //  0 … +1
    + w_local    × localRelevance(food, home.location) //  0 … +1
    + w_type     × mealTypeFit(food, meal_type)        //  0 … +1
```

Default weights: preference 0.35, recency 0.20, repetition 0.15, cost 0.15,
local relevance 0.10, meal-type fit 0.05.

| Term | Definition |
|------|-----------|
| `preference` | Person preference where the person has rated it or its items; otherwise Home preference |
| `recencyBonus` | 0 for eaten today, rising to 1 at 21 days and flat afterwards. Something not eaten for three weeks is due. |
| `repetitionPenalty` | Times eaten in the last 30 days, normalised. Eaten four times this month is heavily penalised. |
| `costPressure` | 0 when the Home is comfortably inside its food budget; rising towards 1 as the month's food spend approaches or exceeds it, scaled by how far above the Home's median cost this food is |
| `localRelevance` | 1 for a food tagged to the Home's region, 0.5 for unregioned, 0 for a food tagged elsewhere |
| `mealTypeFit` | 1 when the food's recorded meal types include the current one |

**Worked example.** Paruppu Sadham, for Arun, on a Tuesday evening, in a Home
1.4× over its food budget for the month.

| Term | Value | Weighted |
|------|-------|----------|
| preference — liked by 6 of 7, Arun likes it | +0.71 | +0.249 |
| recency — last eaten 14 days ago | 0.67 | +0.134 |
| repetition — once in 30 days | 0.10 | −0.015 |
| cost — ₹42/person against a ₹55 median, budget tight | 0.05 | −0.008 |
| local — tagged Tamil Nadu, Home in Chennai | 1.00 | +0.100 |
| type — recorded as dinner | 1.00 | +0.050 |
| **Score** | | **0.510** |

Rendered to the reader as a normalised 0–100 with its reasons, because a
suggestion nobody understands is a suggestion nobody trusts:

```text
Paruppu Sadham                            91

Liked by 6 of 7 · Last eaten 14 days ago
₹42/person · Low repetition this month
```

**Cold start.** Fewer than five recorded meals in the Home means the library
half says "Not enough history yet — record a few meals and this fills in", and
shows the most recently eaten instead of a score. It does not fabricate a
ranking from three data points, and it does not quietly hand the slot to AI.

**Everything filtered out.** If the restriction filter empties the candidate set,
the library half says so — "Nothing in the library is safe for everyone eating
tonight" — and offers to record a meal instead. It never widens the filter to
produce two suggestions, and it never falls through to the AI half, which is
subject to the same filter.

### 6.2 AI ideas — optional, clearly marked, never authoritative

Sent as structured context, and only when the Home has configured AI and enabled
the `food_ideas` capability:

```json
{
  "location": { "city": "Chennai", "state": "Tamil Nadu", "country": "IN" },
  "meal_type": "dinner",
  "popular_meals": ["Paruppu Sadham", "Curd Rice", "Chicken Biryani"],
  "liked_items": ["chicken", "rice", "paneer"],
  "disliked_items": ["bitter gourd"],
  "recent_meals": [{ "name": "Chicken Biryani", "days_ago": 2 }],
  "budget_state": "tight",
  "outside_food_frequency": "high",
  "season": "monsoon"
}
```

Returned: exactly two ideas, each with a name, a one-line description, an
estimated per-person cost and the main items.

**Validation before anything is shown** — the full contract is in
[10-LLM-SPEC.md](10-LLM-SPEC.md) section 9.4:

1. Exactly two suggestions.
2. Neither duplicates a library entry by normalised name.
3. Neither contains an item on the Home's disliked list.
4. Estimated cost is a plausible number in range, not a promise.
5. **No named restaurant, brand, address or claim of availability.** Location is
   context for cuisine, season and price range. The model does not know what is
   open near this Home and must not appear to (FD-19).
6. **No item restricted for anyone being served.** The prompt carries the union
   of the participants' restricted items as an exclusion list, and every returned
   idea is checked against that list again on the way back. A model that returns
   a restricted item has failed validation — the check is on our side of the
   call, never delegated to the prompt, because a prompt is a request and a
   filter is a guarantee.

Failing any of these drops the AI half entirely. The screen shows the library
half alone, which is the correct outcome and not an error.

### 6.3 What AI must never do here

- Write a meal record
- Create or modify an expense
- Add to, edit or merge the library
- Rate a food, or alter a preference
- Read, write or infer a member's restrictions beyond the exclusion list it is given
- Replace the library half of the suggestions

AI produces two lines of text next to two lines the Home earned. That
distinction is the whole reason the feature is trustworthy (FD-14, FD-17).

---

## 7. Budget awareness

Food is where a Home's money actually goes, so the food module reads the money
module — one direction only.

```text
Money system  ──►  spending profile  ──►  Food recommendation context
```

It produces the `costPressure` term above, and one plain sentence when it is
high:

```text
Outside food this month:  ₹4,800
Home cooking:             ₹2,100

Your outside-food spending is already high this month.
Here are two low-cost meals from your library.
```

Food never writes to Money. The arrow points one way and that is what keeps the
expense flow fast.

---

## 8. The Food screen

```text
Food

Today
────────────────────
🍛 What did you eat?
[ + Add Meal ]

────────────────────
✨ Suggestions

🏠 From Your Home
🥘 Paruppu Sadham          ₹45/person
🍚 Curd Kolambu            ₹38/person

✨ AI Ideas
🤖 Vegetable Kothu Parotta  est. ₹60/person
🤖 Chicken Shawarma Bowl    est. ₹85/person

────────────────────
Food Library   ·   Meal History   ·   Preferences
```

Four destinations underneath: **Add Meal**, **Library**, **History**,
**Preferences**, plus **Suggestions** inline. Screens S-40 to S-45 in
[08-UI-UX-SPEC.md](08-UI-UX-SPEC.md).

### 8.1 Add Meal, in order of importance

1. **Name**, with library autocomplete and the did-you-mean panel.
2. **Participants**, defaulting to everyone home today — one tap to deselect.
3. **Source**, three chips.
4. **Cost**, one field that expands into base, prep, delivery and other.
5. Everything else — items, meal type, photo, link to an expense, save to
   library, rate it — is optional and below the fold.

A meal recorded with only a name and today's date is a valid meal. Requiring more
than that is how a food diary stops being kept.

---

## 9. Food in the rest of the product

| Where | What it contributes |
|-------|--------------------|
| **Today** | "What did you eat?" plus the two-and-two suggestion card |
| **Calendar** | Meals on the day; meal count on the week; meals, outside-food spend and home-cooking spend on the month |
| **Insights** | Home-cooked versus outside, food spend over time, most-liked meals, recently eaten, frequently repeated |
| **Money** | Nothing is required. An expense may carry a meal link and shows it. |
| **Notifications** | One optional daily suggestion, and nothing else. Food must never become a source of nagging. |

---

## 10. Testing obligations

| Property | Assertion |
|----------|-----------|
| Per-person cost | `Σ per-person shares == total_cost_paise` exactly, for any total and 1–30 participants |
| Determinism | The same library, ratings, history and date always produce the same two suggestions, in the same order |
| Independence | A meal can be created, read and deleted with no expense in the database, and an expense with no meal |
| No coupling | Voiding an expense linked to a meal leaves the meal intact, and vice versa |
| Individual override | A person who dislikes an item is never shown a meal containing it, while the Home's own ranking is unchanged |
| Cold start | Fewer than five recorded meals produces the honest message, never a fabricated score |
| Dedup | Four spellings of the same dish offer a match rather than creating four entries, and nothing merges without confirmation |
| AI containment | With AI returning a library duplicate, a disliked item, a named restaurant, or one suggestion instead of two, the AI half is dropped and the library half still renders |
| No AI writes | Across the suite, no `meals`, `expenses` or `food_library` row has an AI-authored origin |
| Budget context | A Home over its food budget ranks cheaper library meals above expensive ones, with all other terms equal |
| Restriction filter | A food carrying an item restricted for the person being served is absent from the candidate set at every score, including a score high enough to top the list with the filter removed |
| Restriction is not a weight | Raising every other term to its maximum never surfaces a restricted food; a property test over random weights and ratings asserts this |
| Empty is allowed | With every candidate restricted for someone present, the recommender returns zero suggestions and the honest message, and does not call AI |
| Unknown composition | A restaurant food with no recorded items is excluded for a member with an `allergy`-severity restriction |
| Allergy blocks the write | Recording a meal containing an allergen for one of its participants is refused with `FOOD_RESTRICTION_VIOLATION`; removing that participant lets it save |
| Restriction confidentiality | No Insights response, digest, export or Home-wide notification contains another member's restrictions |
| Matching limit | Textual containment matches both directions and is case- and punctuation-insensitive; it does **not** match synonyms, and a test asserts that so the limit stays known |

---

## 11. Planned meals

**New in 2.0**, carrying FD-20. A suggestion, or any library meal, may be placed
on a future date so the Calendar shows what the Home intends to eat.

**A planned meal is an intention, not a record.** That distinction is the whole
of this section, and it is what keeps the recommender honest:

- It creates no cost, no expense, no participants and no preference signal.
- It appears on the Calendar (S-52) and on Today for its date, marked as an
  intention and visually distinct from a meal that was eaten.
- It appears in **no** food history, no Insights view, and **no recommender
  input**. A plan is not evidence of what the Home eats; treating it as evidence
  would let a plan nobody cooked raise a meal's score and get it suggested again.
- Its `name` is snapshotted, so editing the library entry afterwards does not
  rewrite what the Home planned.

**Confirming it as eaten** is what creates the `meals` row. From that moment
every ordinary rule in this document applies in full: participants, per-person
cost, the library offer, the preference vote, the optional expense link. Before
that moment there is nothing to link money to, and the attempt is refused
(BR-218).

An unconfirmed plan whose date has passed is dropped from the Calendar and never
becomes history. The member who placed it is asked once, the evening of the day
(N-57), and never chased again. A Home that plans and does not confirm loses
nothing except the plan — which is the correct outcome, because the alternative
is a food history full of meals nobody ate.

**Data model:** `meal_plans` table (see [04-DATABASE.md](04-DATABASE.md)).
**API:** `/api/food/plans` (see [05-API-SPEC.md](05-API-SPEC.md)).
**UI:** the Plan it action on S-43, and the day view of S-52.

---

## 12. Recipe instructions

Meals and foods may carry optional `recipe_instructions` — plain-text cooking
steps. This is not a full recipe editor; it is the minimum needed to answer
"how do I make this again."

**Rules:**
- Recipe instructions are optional on both `meals` and `foods` (library).
- When a meal is saved to the library, `recipe_instructions` is carried over
  if present.
- Recipe instructions are displayed in meal detail view (S-44) and food
  library detail (S-45).
- No structured ingredient parsing, no step numbering enforcement, no
  photo-per-step. Plain text only.

---

## 13. Shopping list

The shopping list bridges meal planning and grocery purchasing. It is not a
standalone module; it derives from meals and the pantry.

**Generation:**
- A shopping list can be generated from upcoming meal plans (next 7 days) and
  existing pantry items.
- Each meal plan item produces shopping items: ingredients not already in the
  pantry.
- Items include name, quantity, unit, and estimated price (from the meal's
  cost data).

**Behaviour:**
- Members can check off items; the list updates in real time for all members.
- Items can be shared across members so the person shopping sees what others
  have already marked.
- Checked-off items persist for the week and are archived at week end.
- Items can be linked back to the meal that generated them.

**Data model:** `shopping_items` table (see [04-DATABASE.md](04-DATABASE.md)).
RLS isolates by `house_id`.

**UI:** Screen S-53 (see [08-UI-UX-SPEC.md](08-UI-UX-SPEC.md)).
