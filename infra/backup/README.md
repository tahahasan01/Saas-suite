# Backups and restore (gate I7, O6; runbook §13.1)

## What runs

| What | When | Where (under `$BACKUP_PREFIX/` in the bucket) | Kept |
| --- | --- | --- | --- |
| WAL archive: every 16 MB segment, or every 5 min when quiet (`archive_timeout=300`) | continuously, by Postgres `archive_command` → `bos-wal-archive` | `wal/<segment>.gz.age` | 35 days |
| Logical dump (`pg_dump -Fc`) + roles (`pg_dumpall --globals-only`, no passwords) | nightly 21:30 UTC (02:30 PKT), `backup` container → `bos-nightly` | `daily/YYYY-MM-DD/` | 7 |
| Weekly copy of Sunday's dump | Sunday | `weekly/YYYY-MM-DD/` | 4 |
| Monthly copy of the 1st's dump | 1st of the month | `monthly/YYYY-MM-DD/` | 12 |
| Physical base backup (`pg_basebackup`), the starting point for PITR | Sunday | `base/<stamp>/base.tar.gz.age` | 35 days |

**Retention statement (for L3):** you can restore to any point in the last
28 days or more (weekly base backup + WAL, kept 35 days). Beyond that, one
copy per day for 7 days, one per week for 4 weeks, and one per month for 12
months. Nothing older than 12 months is kept. A tenant's deleted data
disappears from backups within 12 months at most.

Storage is any S3-compatible bucket. The default is **Cloudflare R2**
(endpoint `https://<account_id>.r2.cloudflarestorage.com`, region `auto`).
Backblaze B2 (`BACKUP_S3_PROVIDER=Other`) and Wasabi (`Wasabi`) work by
changing env vars only. The scripts use rclone configured entirely from env,
and write nothing to disk.

Three settings are recommended in the R2 dashboard:

- A **bucket lock rule** of 35 days, so a stolen server token can't delete
  recent backups.
- An API token scoped to this bucket only.
- A billing alert.

## Encryption and key custody

Everything is encrypted on the server **before** upload, with
[age](https://age-encryption.org) to *public* keys (`BACKUP_AGE_RECIPIENTS`).
A public key can encrypt but not decrypt. So the production server, its
admins, the bucket provider, and anyone who steals the R2 token all hold
backups none of them can read. The private keys never touch the server.

Make two keypairs on your own computer (`age-keygen -o founder.txt`, and
again for `escrow.txt`). Each file holds the private key plus a
`# public key: age1…` line. Put both public keys in `BACKUP_AGE_RECIPIENTS`.
Any one private key can decrypt.

| Key | Held by | Where |
| --- | --- | --- |
| Founder | Founder | Password manager (secure note), plus an offline copy (USB or paper) in a safe |
| Escrow | A trusted second person, or a bank locker | Sealed envelope. Opened only if the founder is unreachable |

**If both private keys are lost, every backup is unreadable.** Check once a
quarter that both still decrypt a recent backup. The monthly drill uses one
of them.

On a restore host, write the identity to a file (`BACKUP_AGE_IDENTITY_FILE`),
use it, then `shred -u` it when the drill is done.

## Monitoring

- `bos-nightly` pings `BACKUP_HEALTHCHECK_URL` on success and `…/fail` on
  failure, e.g. a free healthchecks.io check with a 26-hour grace period. A
  night with no ping alerts the founder.
- WAL archiving: run
  `select archived_count, failed_count, last_failed_wal from pg_stat_archiver`.
  A rising `failed_count` means segments are piling up in `pg_wal` (disk!).
  Phase 2E alerts on it.

## Restore runbook

Never restore over production in a drill. Use a separate machine or VM: a
throwaway Hostinger VPS, or a laptop with Docker.

**Prepare the restore host.**

1. Clone the repo.
2. Build the image:
   `docker build -f infra/backup/Dockerfile -t business-os-postgres .`
3. Create an env file with the same `BACKUP_S3_*` values as production. Use a
   **read-only** R2 token if you have one.
4. Save the age private key to `./identity.txt`.

```sh
docker network create bos-restore
docker run -d --name restore-pg --network bos-restore \
  -e POSTGRES_USER=businessos -e POSTGRES_PASSWORD="$(openssl rand -hex 24)" \
  --env-file restore.env -e BACKUP_AGE_IDENTITY_FILE=/keys/id.txt \
  -v "$PWD/identity.txt:/keys/id.txt:ro" business-os-postgres
```

### A. Last night's dump (simplest, RPO up to 24 h)

```sh
# 1. roles first (a new cluster has none; ownership of the ai_v_* views needs ai_view_owner)
docker exec -u postgres restore-pg bash -c '. bos-backup-lib.sh;
  d=$(rclone lsf --dirs-only $REMOTE/daily | sort | tail -n1);
  rclone cat $REMOTE/daily/${d}globals.sql.age | decrypt | psql -U businessos -d postgres'
# 2. the database, into a NEW name (refuses an existing one)
docker exec -u postgres -e PGHOST=/var/run/postgresql -e PGUSER=businessos -e PGDATABASE=postgres \
  restore-pg bos-restore-dump latest businessos_restore     # or weekly/2026-10-18, monthly/…
```

### B. Point in time (RPO up to 5 min)

Pick the target time (for example, just before the bad import), then:

```sh
docker run -d --name pitr --user postgres --env-file restore.env \
  -e BACKUP_AGE_IDENTITY_FILE=/keys/id.txt -v "$PWD/identity.txt:/keys/id.txt:ro" \
  -v pitr-data:/var/lib/postgresql/data business-os-postgres bash -c '
    P=/var/lib/postgresql/data/pitr; mkdir -p $P
    bos-pitr-prepare latest "2026-10-20 09:00:00+05" $P
    exec postgres -D $P -c hba_file=/etc/postgresql/pg_hba.conf'
docker exec pitr psql -U businessos -c "select pg_is_in_recovery(), pg_get_wal_replay_pause_state()"
# -> t | paused  : inspect the data, then  select pg_promote();
```

Use a base backup taken *before* the target time. `latest` is right unless
the target is older than last Sunday's base backup; in that case pass that
base's stamp (`rclone lsf $REMOTE/base`).

### Verify (every restore, drill or real)

1. `select count(*), max(version) from schema_migrations` equals the release
   level.
2. Row counts of key tables match the source or monitoring snapshot.
   `select sum(total_minor) from pos_sales where created_at::date = <yesterday>`
   matches the reporting snapshot.
3. `services/api/tests/core/test_rls.py` and `test_grants.py` are green against
   the restored database (run them through `with_db.py <db>` or with
   `DATABASE_URL`/`APP_DATABASE_URL` pointed at it).
4. Bring the API up against it and log in as the internal tenant. FBR tokens
   decrypt only if `BOS_DATA_KEYS` is the production one. Keep a copy of that
   key with the age keys.
5. Write down the timings (fetch, decrypt, restore, replay, verify) in the
   drill log below.
6. Remove the restore containers and volumes and `shred -u identity.txt`.

### Real incident (production lost or corrupted)

1. Freeze writes: `bos stop api worker`, and put up the maintenance page.
2. Restore to a **new** Postgres (path B to the last good minute, or path A).
3. Point the stack at it (new volume or new server), then run `bos up -d`.
   The `migrate` service brings it to the current release and sets the
   app_user password from env.
4. Replay outbox rows created after the target time, if they can be
   recovered from logs.
5. Tell affected tenants which window of data needs re-entry.

## Restore drill log

**Monthly drill, recurring.** First working Monday of each month, about 45
minutes, run by the founder. Do a path A restore on a throwaway host, plus a
path B restore once a quarter. Then fill in a row below. Add it to the
calendar as a recurring event now.

| Date | Path | Data size | Fetch | Decrypt | Restore / replay | Verify | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-10-20 | A: dump to same dev cluster | 13.4 MB, 39 tables, 3,167 rows, migration 0046 | 0 s | 0 s | 191 s † | 16 s: every table count equal, migrations equal, Σ pos_sales equal (8,000,000), 40/40 FBR tokens still encrypted; test_rls + test_grants 89 passed on the restored db | pass |
| 2026-10-20 | A: dump to a fresh, isolated cluster | same | 1 s | 0 s | 2 s globals + 29 s restore | migrations 0046 (39), 800 sales, `ai_v_*` still owned by `ai_view_owner` | pass |
| 2026-10-20 | B: PITR, base + WAL to a time between two inserts | same | (included) | (included) | 7 s to `paused` at target | exactly the pre-target row present, the post-target row absent | pass |

† The first drill ran on the developer laptop (Docker Desktop on Windows)
against a dev Postgres shared with parallel test suites. Every statement
crossed the host-gateway hop. The isolated-cluster row is the realistic
figure.

Making the first dump (`bos-nightly`: dump, encrypt, upload) took 23 s for
this database.

**What this means at today's size:**

- **RPO:** ≤ 5 min with WAL archiving (`archive_timeout=300`), 24 h with
  dumps alone.
- **RTO:** under 1 minute of compute. Realistically 30–60 minutes including
  provisioning a host, fetching keys, and verification.

**Targets** (§13.1): RPO 5 min, RTO 2 h. Revisit when the database passes
roughly 5 GB. Restore time grows about linearly with size, and index builds
dominate.
