/**
 * The three demo homes.
 *
 * One house cannot show this product. Nearly every screen branches on the
 * household's shape — points or rota, split or pot, shared or family — and a
 * single demo house only ever lit one side of each branch. These three between
 * them reach all of them, and `demo` belongs to all three, so the Home switcher
 * has somewhere to switch to.
 *
 * Shapes chosen so that each home is the *only* one that can show something:
 *
 *   anna-nagar  points + split   standing, settle-up, penalties, a game layer
 *   velachery   rota   + pot     the screens that hide themselves, plus a
 *                               reserve and expected contributions
 *   sharma      family + pot     dependents, guardians, family governance
 */

/**
 * Every account the demo creates. `email` is derived, never typed: a demo
 * inbox is a fiction and nobody should be tempted to confirm one.
 */
export const PEOPLE = {
  demo: { name: "Ravi Kumar", upi: "ravi@okhdfc", canCook: true },
  kumar: { name: "Kumar S", upi: "kumar@okaxis", canCook: true },
  vinoth: { name: "Vinoth R", upi: "vinoth@oksbi", canCook: false },
  suresh: { name: "Suresh M", upi: null, canCook: false },
  arun: { name: "Arun P", upi: "arun@okicici", canCook: true },
  deepak: { name: "Deepak V", upi: null, canCook: false },
  manoj: { name: "Manoj K", upi: "manoj@okhdfc", canCook: false },
  sathish: { name: "Sathish B", upi: null, canCook: false },

  priya: { name: "Priya N", upi: "priya@okaxis", canCook: true },
  naveen: { name: "Naveen G", upi: "naveen@oksbi", canCook: false },
  divya: { name: "Divya S", upi: "divya@okhdfc", canCook: true },

  rajesh: { name: "Rajesh Sharma", upi: "rajesh@okhdfc", canCook: false },
  meena: { name: "Meena Sharma", upi: "meena@okaxis", canCook: true },
  anil: { name: "Anil Sharma", upi: null, canCook: false },
  kavya: { name: "Kavya Sharma", upi: "kavya@oksbi", canCook: true },
};

export function emailOf(username) {
  return `${username}@houseos.dev`;
}

export const HOMES = [
  {
    key: "anna-nagar",
    name: "Anna Nagar Boys",
    homeType: "shared",
    inviteCode: "DEMO24",
    // Fixed so a reseeded demo keeps the same URL, and whatever link you
    // pasted into a chat last week still opens.
    inviteToken: "demo-invite-anna-nagar",
    address: "12 Second Street, Anna Nagar",
    place: { country_code: "IN", state: "Tamil Nadu", city: "Chennai", area: "Anna Nagar" },
    timezone: "Asia/Kolkata",
    settings: {
      money_mode: "split",
      effort_mode: "points",
      penalty_enabled: true,
      penalty_rate_paise: 500,
      confirmation_policy: "size_aware",
      game_layer_enabled: true,
      daily_budget_paise: 180000,
      expense_approval_threshold_paise: 200000,
    },
    // The one home whose governance is deliberately strict, so the quorum maths
    // on a Critical decision has something to fail against.
    governance: { critical_member_rule: "proportion", critical_member_value: 60 },
    roster: [
      { username: "demo", role: "admin" },
      { username: "kumar", role: "co_admin" },
      { username: "vinoth", role: "member" },
      { username: "suresh", role: "member" },
      { username: "arun", role: "member" },
      { username: "deepak", role: "member", residency: "weekday_only" },
      { username: "manoj", role: "member" },
      { username: "sathish", role: "member", residency: "weekend_only" },
    ],
    // Somebody waiting at the door, so the join queue is not theoretical.
    applicant: { username: "priya", message: "Moving to Anna Nagar next month — Kumar knows me." },
    rooms: [
      { name: "Front room", capacity: 3, rentPaise: 900_000 },
      { name: "Middle room", capacity: 3, rentPaise: 900_000 },
      { name: "Back room", capacity: 2, rentPaise: 700_000 },
    ],
    occupancy: [0, 0, 0, 1, 1, 1, 2, 2],
    rentPaise: 2_500_000,
    cuisine: "tamil",
  },

  {
    key: "velachery",
    name: "Velachery Flat",
    homeType: "shared",
    inviteCode: "VELA24",
    inviteToken: "demo-invite-velachery",
    address: "4B Rajaji Street, Velachery",
    place: { country_code: "IN", state: "Tamil Nadu", city: "Chennai", area: "Velachery" },
    timezone: "Asia/Kolkata",
    settings: {
      money_mode: "pot",
      effort_mode: "rota",
      penalty_enabled: false,
      penalty_rate_paise: 0,
      confirmation_policy: "single",
      game_layer_enabled: false,
      daily_budget_paise: 90000,
      expense_approval_threshold_paise: 100000,
    },
    governance: { critical_member_rule: "count", critical_member_value: 3 },
    roster: [
      { username: "priya", role: "admin" },
      { username: "naveen", role: "co_admin" },
      { username: "demo", role: "member" },
      { username: "divya", role: "member" },
    ],
    rooms: [
      { name: "Bedroom A", capacity: 2, rentPaise: 1_200_000 },
      { name: "Bedroom B", capacity: 2, rentPaise: 1_000_000 },
    ],
    occupancy: [0, 0, 1, 1],
    rentPaise: 2_200_000,
    cuisine: "mixed",
    // Only a pot household has these two, so only this one seeds them.
    pot: {
      monthlyContributionPaise: 800_000,
      reserve: { name: "Deposit and repairs", openingPaise: 1_500_000 },
    },
  },

  {
    key: "sharma",
    name: "Sharma Family",
    homeType: "family",
    inviteCode: "FAM24",
    inviteToken: "demo-invite-sharma",
    address: "27 Lake View Road, Jayanagar",
    place: { country_code: "IN", state: "Karnataka", city: "Bengaluru", area: "Jayanagar" },
    timezone: "Asia/Kolkata",
    settings: {
      money_mode: "pot",
      effort_mode: "points",
      penalty_enabled: false,
      penalty_rate_paise: 0,
      confirmation_policy: "off",
      game_layer_enabled: true,
      daily_budget_paise: 120000,
      expense_approval_threshold_paise: 500_000,
    },
    // A family does not put every decision to a vote; the co-admin requirement
    // is what makes the Critical path here different from Anna Nagar's.
    governance: { critical_member_rule: "count", critical_member_value: 2 },
    roster: [
      { username: "rajesh", role: "admin" },
      { username: "meena", role: "co_admin" },
      { username: "anil", role: "member" },
      { username: "kavya", role: "member" },
      { username: "demo", role: "member", residency: "weekend_only" },
    ],
    dependents: [
      { name: "Aarav Sharma", guardian: "rajesh", doesChores: true },
      { name: "Diya Sharma", guardian: "meena", doesChores: true },
    ],
    rooms: [
      { name: "Master bedroom", capacity: 2, rentPaise: 0 },
      { name: "Children's room", capacity: 2, rentPaise: 0 },
      { name: "Guest room", capacity: 3, rentPaise: 0 },
    ],
    // Parents in the master bedroom, the two children in their own room, the
    // three other adults in the guest room. Room capacity is asserted by the
    // database, so this has to add up rather than look plausible.
    occupancy: [0, 0, 2, 2, 2],
    dependentOccupancy: [1, 1],
    rentPaise: 0,
    cuisine: "north",
    // A family pot too, but a larger one and with a fund behind it rather than
    // a deposit — the same two tables, a different story on the screen.
    pot: {
      monthlyContributionPaise: 1_000_000,
      reserve: { name: "House fund", openingPaise: 2_500_000 },
    },
  },
];

export function homeByKey(key) {
  const home = HOMES.find((row) => row.key === key);
  if (!home) throw new Error(`No such home: ${key}. Known: ${HOMES.map((h) => h.key).join(", ")}`);
  return home;
}
