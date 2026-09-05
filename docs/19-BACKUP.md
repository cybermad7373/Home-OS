# 19 — Backups

**Written:** 2026-09-06
**Applies to:** the hosted project on the Supabase free tier

[18-GO-LIVE.md](18-GO-LIVE.md) section 6 left this open: *"No monitoring and no
backup policy has been chosen. Supabase takes daily backups on paid plans; on
the free tier it does not."* Monitoring is decided in D-89. This decides the
other half.

**The plan is the free tier, so there are no automatic backups.** Everything
below exists because of that one sentence. On a paid plan most of this becomes
a fallback rather than the primary, and section 6 says what changes.

---

## 1. What is being protected, and from what

| Threat | What actually happens | What saves you |
|---|---|---|
| A bad migration | A column or a table is dropped and the data with it | A dump from before the push |
| A bad delete | Somebody with a service-role key runs an `UPDATE` or `DELETE` without a `WHERE` | A dump from before it |
| The project is paused or removed | The free tier pauses after 7 days of inactivity, and a paused project can be restored — but an *organisation* deleted for any reason is gone | A dump held somewhere that is not Supabase |
| The account is lost | Password, email, provider outage | A dump held somewhere that is not Supabase |

Two of the four are only survivable if a copy exists **outside** Supabase. That
is the whole reason this is a script rather than a dashboard setting.

**What is not covered here:** files in Storage — receipts and chore photos.
`pg_dump` copies the `storage.objects` rows and not the bytes they point at, so
a restore brings back a receipt list with broken links. Section 5 says what to
do about that; it is deliberately a separate, smaller problem, because the
records that carry the money are all in Postgres.

---

## 2. Taking one

```bash
# The hosted project
SUPABASE_DB_URL='postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres' npm run backup

# The local stack, to rehearse the whole thing without touching anything real
LOCAL_DB_URL="$(npx supabase status -o json | jq -r .DB_URL)" npm run backup -- --local
```

The connection string is on the Supabase dashboard under **Settings →
Database**. It contains the database password: put it in the environment of
whatever runs the job, never in a file in this repository, and never in a
command that a shell history will keep.

Two files land in `BACKUP_DIR` (default `./backups`, which `.gitignore`
excludes):

```
houseos-2026-09-06T02-00-11.schema.sql    every table, function, policy, trigger
houseos-2026-09-06T02-00-11.data.sql      every row
```

Separate, because they fail differently and restore differently. A schema that
will not load is a broken deploy; data that will not load is a broken restore;
and knowing which one you have is half the work.

Every run checks its own output and refuses to report success on a file that
does not end the way a finished dump ends. `BACKUP_KEEP` (default 14) is how
many runs are kept locally before the oldest is pruned.

### On a schedule

Any scheduler works — the script is one command that exits non-zero on failure.

**A Linux host, nightly at 02:00:**

```cron
0 2 * * *  cd /srv/houseos && SUPABASE_DB_URL='…' npm run backup >> /var/log/houseos-backup.log 2>&1
```

**GitHub Actions**, if the repository is private and the dump is pushed to
object storage rather than kept as an artifact — an artifact on a public
repository is every household's records, downloadable.

**Windows Task Scheduler**, if the machine that runs it is reliably on. It
mostly is not, which is the usual reason a laptop-based backup policy quietly
stops running in March.

---

## 3. Where the files go

**A dump is the entire product's household data in one file.** Every name,
every expense, every note somebody typed about their own household. Treat it
exactly like the database it came from.

- **Encrypted at rest, off this machine.** Object storage with a lifecycle rule
  (Backblaze B2, Cloudflare R2, S3), or an encrypted archive on a machine that
  is not the one running the app.
- **Never in git.** `backups/` is in `.gitignore`; that is a seatbelt, not a
  policy.
- **Never attached to an issue, a message or a support ticket.**
- **Not only on one laptop.** The threat that ends a project is the one that
  takes the laptop and the database in the same week.

Keep 30 daily copies and 12 monthly ones, or whatever the storage bill
supports. The number matters far less than the location.

---

## 4. Restoring

**Never restore into the live project.** A restore is how a bad day becomes an
irreversible one. Restore into a *new* project, look at it, and repoint the app
only when what you are looking at is right.

```bash
# 1. A new, empty project. Then, against its connection string:
psql "$NEW_DB_URL" -f houseos-<stamp>.schema.sql
psql "$NEW_DB_URL" -f houseos-<stamp>.data.sql

# 2. Look at it before trusting it.
psql "$NEW_DB_URL" -c "select count(*) from houses;"
psql "$NEW_DB_URL" -c "select count(*) from expenses;"
psql "$NEW_DB_URL" -c "select sum(amount_paise) from expenses;"
```

Then, and only then:

1. Deploy the Edge Functions to the new project and set their secrets — the
   dump does not carry either (`18-GO-LIVE.md` section 2.2 and 4).
2. `LLM_KEY_ENCRYPTION_KEY` must be **the same value as before**, or every
   household's stored provider key becomes unopenable. It is not in the dump.
3. Point the web host's environment at the new project and redeploy.
4. Work through the smoke test in `18-GO-LIVE.md` section 5.

### Rehearse it

A backup nobody has restored is a belief, not a backup. **Restore into a
scratch project once a quarter**, run the three counts above, and write the
date somewhere. The failure this catches is not a corrupt file — it is the
step nobody knew was missing until the day it mattered, which on this system is
usually the encryption key or the Edge Function secrets.

---

## 5. Storage files

`receipts` and `chore-photos` are private buckets. `pg_dump` carries their
metadata and not their contents.

The cheapest sufficient answer, given what these are: **accept the loss and say
so.** A receipt photo is corroboration of an expense whose amount, payer, date
and splits are all in Postgres and all restored. The ledger is intact without
it.

If that is not acceptable, sync the buckets on the same schedule as the dump —
the Supabase Storage S3 endpoint works with `rclone` and `aws s3 sync`, and the
credentials are on the dashboard under **Settings → Storage**. Whichever is
chosen, write down which, because "we thought the other one covered it" is how
both end up uncovered.

---

## 6. If the plan changes to paid

Supabase takes daily backups on a paid plan, with point-in-time recovery
available above that. When that happens:

- The dashboard's backup becomes the primary, and this script becomes the
  off-Supabase copy — which is still worth having, because a provider-side
  backup does not survive losing the account.
- The cadence here can drop to weekly.
- Section 4 does not change. A restore still goes into a new project, and the
  quarterly rehearsal is still the only thing that proves any of it works.
