/**
 * Seeds three demo homes with real data, so the app can be looked at rather
 * than imagined.
 *
 *   node scripts/seed-demo.mjs                 # create or top up all three
 *   node scripts/seed-demo.mjs --reset         # delete them and start over
 *   node scripts/seed-demo.mjs --only=sharma   # one home
 *   node scripts/seed-demo.mjs --verify        # report coverage, write nothing
 *
 * Reads `.env.local` and uses the service-role key, so it never runs in a
 * browser and refuses a non-local stack unless told otherwise out loud.
 *
 * Why three homes: nearly every screen in this app branches on the household's
 * shape, and a single demo house only ever lit one side of each branch. The
 * three here are points/split, rota/pot and family/pot, and `demo` belongs to
 * all of them.
 */
import { APP_URL, PASSWORD, admin } from "./seed/env.mjs";
import { HOMES, PEOPLE, homeByKey } from "./seed/profiles.mjs";
import { deleteAccounts, ensureAccounts } from "./seed/accounts.mjs";
import { createHome, deleteHome, findHome } from "./seed/home.mjs";
import {
  seedAbsences,
  seedAnnouncements,
  seedAvailability,
  seedGuests,
} from "./seed/people.mjs";
import { seedMoney } from "./seed/money.mjs";
import { seedChores } from "./seed/chores.mjs";
import { seedFood } from "./seed/food.mjs";
import { seedGovernance } from "./seed/governance.mjs";
import { seedRules } from "./seed/rules.mjs";
import { seedComms } from "./seed/comms.mjs";
import { seedAiCredentials } from "./seed/ai.mjs";
import { report } from "./seed/verify.mjs";
import { addDays, periodOf, todayIn } from "./seed/util.mjs";

const args = process.argv.slice(2);
const reset = args.includes("--reset");
const verifyOnly = args.includes("--verify");
const only = args.find((arg) => arg.startsWith("--only="))?.split("=")[1];

const homes = only ? [homeByKey(only)] : HOMES;

function step(message) {
  process.stdout.write(`  ${message}\n`);
}

async function seedOne(home) {
  const today = todayIn(home.timezone);
  const joined = addDays(today, -95);
  const thisPeriod = periodOf(today);

  console.log(`\n${home.name}  (${home.homeType} · ${home.settings.effort_mode} · ${home.settings.money_mode})`);

  const usernames = [
    ...home.roster.map((entry) => entry.username),
    ...(home.applicant ? [home.applicant.username] : []),
  ];
  step("accounts");
  const accountIds = await ensureAccounts(usernames);

  step("home, members and rooms");
  const context = await createHome(home, accountIds, joined);
  context.today = today;
  context.joined = joined;
  context.period = thisPeriod;
  context.home = home;
  context.accountIds = accountIds;

  step("availability and away days");
  await seedAvailability(context.houseId, context.memberIds, today);
  await seedAbsences(context.houseId, context.memberIds, today);

  step("guests");
  context.guestId = await seedGuests(context.houseId, context.memberIds, today);

  step("money");
  await seedMoney(context);

  step("chores");
  await seedChores(context);

  step("food");
  await seedFood(context);

  step("rules");
  await seedRules(context);

  step("decisions");
  await seedGovernance(context);

  step("announcements and notifications");
  await seedAnnouncements(context.houseId, context.memberIds, today);
  await seedComms(context);

  step("AI credentials");
  await seedAiCredentials(context);

  return context;
}

async function main() {
  if (verifyOnly) {
    await report(homes);
    return;
  }

  if (reset) {
    console.log("Removing the existing demo homes…");
    for (const home of HOMES) {
      const existing = await findHome(home.name);
      if (existing) await deleteHome(existing);
    }
    await deleteAccounts(Object.keys(PEOPLE));
  }

  const built = [];
  for (const home of homes) {
    const existing = await findHome(home.name);
    if (existing) {
      console.log(`\n${home.name} already exists. Re-run with --reset to rebuild it.`);
      continue;
    }
    built.push(await seedOne(home));
  }

  if (built.length > 0) {
    console.log(`
Demo ready.

  Sign in     demo  /  ${PASSWORD}
  Others      ${Object.keys(PEOPLE).filter((name) => name !== "demo").join(", ")}
              same password

  Homes       ${HOMES.map((home) => `${home.name}  ${APP_URL}/join/${home.inviteToken}`).join("\n              ")}

  \`demo\` is a member of all three, so the Home switcher has something to switch.
`);
  }

  await report(homes);
}

main()
  .then(async () => {
    await admin.auth.signOut().catch(() => {});
  })
  .catch((error) => {
    console.error(`\n${error.message}\n`);
    if (process.env.SEED_DEBUG) console.error(error);
    process.exit(1);
  });
