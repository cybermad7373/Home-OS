/**
 * The demo accounts.
 *
 * Created confirmed, because a demo that needs eight inboxes opened is not a
 * demo. Shared across homes: `demo` is one account that belongs to three
 * households, which is the only way the Home switcher has anything to do.
 */
import { admin, must, PASSWORD } from "./env.mjs";
import { emailOf, PEOPLE } from "./profiles.mjs";

/** username -> user id, for every account the three homes need. */
export async function ensureAccounts(usernames) {
  const ids = new Map();

  for (const username of usernames) {
    const person = PEOPLE[username];
    if (!person) throw new Error(`No person registered under "${username}"`);
    const email = emailOf(username);

    const existing = must(
      "select users",
      await admin.from("users").select("id").eq("email", email).maybeSingle(),
    );
    if (existing?.id) {
      ids.set(username, existing.id);
      continue;
    }

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: person.name, username },
    });
    if (error) throw new Error(`create account ${username}: ${error.message}`);
    ids.set(username, data.user.id);
  }

  // The profile row is written by a trigger on sign-up, so this is a top-up of
  // the fields that trigger cannot know: the payment handle and the username a
  // Google account would not have supplied.
  for (const [username, id] of ids) {
    await admin
      .from("users")
      .update({
        display_name: PEOPLE[username].name,
        username,
        upi_vpa: PEOPLE[username].upi,
      })
      .eq("id", id);
  }

  return ids;
}

export async function deleteAccounts(usernames) {
  for (const username of usernames) {
    const existing = must(
      "select users",
      await admin.from("users").select("id").eq("email", emailOf(username)).maybeSingle(),
    );
    if (existing?.id) await admin.auth.admin.deleteUser(existing.id);
  }
}
