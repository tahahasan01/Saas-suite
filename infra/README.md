# infra

Everything that runs Business OS outside a developer laptop.

| Path | What |
| --- | --- |
| `docker/docker-compose.yml` | Dev only: Postgres, Redis, Mailpit with published ports |
| `docker/docker-compose.prod.yml` | Production stack for one VPS: caddy, web, api, migrate, worker, postgres, redis, backup |
| `docker/docker-compose.prodcheck.yml` | Local rehearsal overlay: an S3 stand-in, Caddy's internal CA, high ports |
| `docker/prod.env.example` | Every production setting, as placeholders |
| `caddy/` | Edge proxy image (Caddy with the Cloudflare DNS module) and `Caddyfile` |
| `backup/` | Postgres image with the backup tools, the scripts, and the **restore runbook** |
| `deploy/` | **First deploy on a fresh Ubuntu 24.04 VPS** |
| `migrations/` | Raw-SQL migrations, applied in order by `services/api/scripts/migrate.py` |

The images are built from the repo root: `services/api/Dockerfile`,
`apps/web/Dockerfile`, `infra/caddy/Dockerfile`, `infra/backup/Dockerfile`.

## Images

- **API** (`services/api/Dockerfile`). `python:3.12-slim`, runs as uid 10001,
  `HEALTHCHECK` on `/health`. Its dependencies come only from
  `services/api/requirements.lock`, which pins exact versions with sha256 hashes,
  installed with `pip --require-hashes --no-deps`. A wheel that was swapped or
  tampered with fails the build. After you edit `requirements.txt`, run
  `sh services/api/scripts/lock_deps.sh`. It resolves inside a Linux
  container, so platform-only wheels such as uvloop are locked correctly.
  `tests/core/test_dependency_lock.py` fails until you run it. Test tools are in
  `requirements-dev.txt` and are not in the image. The image sets
  `ENV=production`, so the startup guard is armed by default.
- **Web** (`apps/web/Dockerfile`). Next `output: "standalone"` on
  `node:20-slim`, running as the `node` user. `NEXT_PUBLIC_*` values are
  inlined into the bundle at build time, so they are build args.
- **Postgres** (`infra/backup/Dockerfile`). The same pgvector image as dev,
  pinned by digest, plus `age`, `rclone` and `curl`.
- **Caddy** (`infra/caddy/Dockerfile`). Caddy 2.10.2 with `caddy-dns/cloudflare`.

The API healthcheck uses `/health` (liveness). Once Phase 2E adds `/ready`
(DB, Redis and migration level), switch the API `HEALTHCHECK` and the compose
dependency to it (gate O1).

## Edge (Caddy + Cloudflare)

- TLS comes from Let's Encrypt through the **DNS-01** challenge, using a
  Cloudflare API token. When Cloudflare proxies the origin (orange cloud), the
  HTTP and TLS challenges don't reach it reliably. DNS-01 always does. Set
  Cloudflare SSL mode to **Full (strict)**.
- **Real client IP.** Caddy reads `CF-Connecting-IP`, but only when the TCP
  peer is in Cloudflare's published ranges (`trusted_proxies`). From anyone
  else, the header is ignored. Caddy then *replaces* `X-Forwarded-For` with
  that client IP, and uvicorn trusts `X-Forwarded-For` only from the compose
  subnet (`FORWARDED_ALLOW_IPS`). A forged header can't fake an IP (checked
  in the rehearsal). Re-check the ranges against https://www.cloudflare.com/ips/
  every quarter.
- The body limit is 5 MB at the edge (P1-8). The app enforces its own limits
  (1 MiB JSON, 5 MiB CSV; S12).
- **Headers.** Both hosts get HSTS (2 years, `includeSubDomains`; add `preload`
  only once you decide to submit the domain), `nosniff`, `X-Frame-Options:
  DENY`, and no `Server` header. The API host also gets
  `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` and
  `Referrer-Policy: no-referrer`. The API sets the same set itself
  (`app/secheaders.py`, tested in `tests/core/test_security_headers.py`), so a
  request that bypasses the proxy is covered too. The page CSP for the web app
  belongs to `next.config` (another Phase 2A item). The edge only forbids
  framing there.

## Cookies and CSRF (gate I5, S8)

**Cookie.** `bos_session` is an opaque random token. Only its SHA-256 is
stored. It is set `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` whenever
`ENV=production` (verified through the rehearsal stack). It's a host-only
cookie, with no `Domain` attribute, so it's never sent to sibling subdomains.

**Topology.** The target is D-51: the browser talks only to its own origin,
and `https://app.<domain>/api/*` is rewritten by Next to the internal
`http://api:4000`. The cookie is then first-party and same-origin, and the
production CORS allowlist can be empty. Until that rewrite lands, the web
calls `https://api.<domain>` directly. `app.` and `api.` are on one registrable
domain, so they're **same-site**: `SameSite=Lax` cookies flow on the
credentialed `fetch`, and CORS allows only `WEB_ORIGIN` with credentials. Both
setups are safe. Don't split app and API across two registrable domains.

**CSRF.** The strategy has three layers:

1. `SameSite=Lax` stops the browser from attaching the session to cross-site
   subrequests (POST forms, fetch, iframes). Only top-level GET navigations
   carry it, and GET never changes state in this API.
2. JSON endpoints parse a body only when it's sent as `application/json`.
   FastAPI rejects a `text/plain` or form-encoded body with 422. A cross-site
   page can only send JSON through `fetch`, which triggers a CORS preflight,
   and the preflight fails for any origin outside `WEB_ORIGIN`. The multipart
   CSV imports are the exception: they rely on layer 1 until layer 3 lands.
3. TR-SEC-41 (Phase 2, middleware): unsafe methods require an `Origin` (or
   `Referer`) that matches the allowlist, plus an `X-BOS-CSRF: 1` header.
   Webhooks are exempt and authenticated by signature.

Layers 1 and 2 are in place today. Layer 3 is the remaining hardening item
and needs no token store.

## Secrets (gate S10, S14, P1-15; runbook §13.2)

Secrets live only in `/opt/business-os/prod.env` on the server (chmod 600)
and in the founder's password manager. They're never in images, compose
files, migrations or logs. (TR-SEC-53's SOPS+age and Docker `*_FILE` secrets
are the next step and use the same variable names.)

**Startup guard** (`app/startup_guard.py`). With `ENV=production`, the API
exits with code 78 before it serves anything if:

- `DATABASE_URL` or `APP_DATABASE_URL` has no password,
- or uses a known/default one (`change_me_in_prod`, `app_user_pw`,
  `devpassword` and others),
- or uses one shorter than 16 characters,
- or `BOS_DATA_KEYS` is missing, invalid, or the public dev key.

The message names the setting, never its value. The worker (Phase 2B) must
call `startup_guard.enforce(settings)` at boot as well.
`crypto.default_ring()` also raises in production rather than fall back to
the dev key, and `scripts/encrypt_credentials.py` runs the guard first.
`SESSION_SECRET` is gone: sessions are random tokens stored hashed, so nothing
is signed (P1-15).

**app_user password.** Migrations no longer contain it. `0001` creates the
role without one, and `scripts/migrate.py` sets it on every run from the
password in `APP_DATABASE_URL`. It sends a SCRAM verifier computed in Python,
so the plaintext never appears in SQL or a statement log. In compose, that's
`APP_DB_PASSWORD`, and the one-shot `migrate` service applies it before the
API starts. Databases migrated before this change already have their password
and are unaffected. The ledger skips `0001`/`0006`, and the next migrate run
simply re-sets the password from env. Note that roles are cluster-wide:
running migrate against a shared dev cluster sets app_user's password for
every database on it.

**Rotating the app_user password:**

1. Generate a new password: `openssl rand -hex 24`.
2. Put it in `APP_DB_PASSWORD` in `prod.env`.
3. Run `docker compose … run --rm migrate`. The role now has the new password.
   Connections already open keep working, but new ones need the new password.
4. Run `docker compose … up -d api worker`, which restarts with the new URL.
   The gap between steps 3 and 4 is seconds. Open pool connections survive it.
5. Verify: `/health` is green and a login works.

Rotate the owner (`POSTGRES_PASSWORD`) the same way: `alter role businessos
password …` in psql, then update `prod.env`, then
`up -d api worker backup migrate`.

**Credential encryption (S14, TR-SEC-50).** Third-party credentials stored per
tenant use envelope encryption (`app/crypto.py`). Today that's the FBR bearer
token. Billing stores no gateway credentials yet, and WhatsApp/payment keys
are platform-level env vars.

- Each value gets a fresh AES-256-GCM data key.
- That data key is wrapped with a master key from `BOS_DATA_KEYS`. The master
  key is never in the DB or its backups.
- The AAD binds each value to `tenant_id|table|column`, so a ciphertext pasted
  into another row fails to decrypt.

Migration `0046` adds `fbr_settings.token_enc` and a `NOT VALID` check that
the old `token` column is empty. The `migrate` service then runs
`scripts/encrypt_credentials.py`, which encrypts any legacy plaintext,
decrypts each value back to compare, and validates the constraint (§7.5).
`--verify`, `--rekey` and `--rollback` cover the rest of the lifecycle. A
later migration drops the empty `token` column once production has been
verified. Take a backup before the first deploy that includes 0046.

**Rotating the data key:**

1. Add a new key to `BOS_DATA_KEYS`, e.g. `{"k1":"…","k2":"…"}`.
2. Set `BOS_DATA_KEY_ACTIVE=k2`.
3. Run `up -d`. New writes now use k2.
4. Run `docker compose … run --rm migrate python -m scripts.encrypt_credentials --rekey`.
5. Run `--verify` until it reports nothing under k1, then remove k1 from the
   env.

If the active key is lost, every tenant has to re-enter their FBR token. Keep
an offline copy (see `deploy/README.md`).

**Inventory to rotate** (§13.2):

- Owner and app_user DB passwords
- `REDIS_PASSWORD`
- `BOS_DATA_KEYS`
- SMTP credentials
- `SENTRY_DSN`
- `ANTHROPIC_API_KEY`
- `CLOUDFLARE_API_TOKEN`
- R2 keys (`BACKUP_S3_*`)
- The age backup keypair (rare: new recipients encrypt new backups; keep old
  identities until their backups expire)
- Later: WhatsApp and payment keys

## Environment variables added in Phase 2 (infra)

| Name | Where | Purpose | Example placeholder |
| --- | --- | --- | --- |
| `ENV` | api | `production` arms the guard, Secure cookies, HSTS, and hides /docs (`NODE_ENV` still read as a fallback) | `production` |
| `BOS_DATA_KEYS` | api, migrate | Master key ring, JSON `{id: base64(32 bytes)}` | `{"k1":"<base64>"}` |
| `BOS_DATA_KEY_ACTIVE` | api, migrate | Key id used for new writes | `k1` |
| `APP_DOMAIN` / `API_DOMAIN` | caddy, web, api | Public hostnames | `app.example.com` / `api.example.com` |
| `ACME_EMAIL` | caddy | Let's Encrypt account | `ops@example.com` |
| `CADDY_TLS` | caddy | `cloudflare` (prod) or `internal` (local rehearsal) | `cloudflare` |
| `CLOUDFLARE_API_TOKEN` | caddy | DNS-01 challenge (Zone:DNS:Edit) | `replace-me` |
| `POSTGRES_USER` / `POSTGRES_DB` / `POSTGRES_PASSWORD` | postgres, api, backup | Owner role and database | `businessos` / `businessos` / `<hex24>` |
| `APP_DB_PASSWORD` | api, migrate | app_user password, set by migrate | `<hex24>` |
| `REDIS_PASSWORD` | redis, api | Redis `requirepass` | `<hex24>` |
| `FORWARDED_ALLOW_IPS` | api | Proxies trusted for X-Forwarded-For (compose sets the subnet) | `172.30.0.0/24` |
| `COMPOSE_SUBNET` | compose | Fixed internal network | `172.30.0.0/24` |
| `NEXT_PUBLIC_API_URL` | web (build) | API base the browser calls (becomes `/api` with D-51) | `https://api.example.com` |
| `API_INTERNAL_URL` | web | Upstream for the `/api` rewrite | `http://api:4000` |
| `BACKUP_S3_ENDPOINT` | postgres, backup | S3 endpoint (R2 default) | `https://<account_id>.r2.cloudflarestorage.com` |
| `BACKUP_S3_BUCKET` | postgres, backup | Bucket | `business-os-backups` |
| `BACKUP_S3_ACCESS_KEY_ID` / `BACKUP_S3_SECRET_ACCESS_KEY` | postgres, backup | Bucket-scoped token | `replace-me` |
| `BACKUP_S3_REGION` | postgres, backup | `auto` for R2 | `auto` |
| `BACKUP_S3_PROVIDER` | postgres, backup | rclone provider: `Cloudflare`, `Wasabi`, `Other` (B2) | `Cloudflare` |
| `BACKUP_PREFIX` | postgres, backup | Folder inside the bucket | `business-os` |
| `BACKUP_AGE_RECIPIENTS` | postgres, backup | age **public** keys that backups are encrypted to | `age1… age1…` |
| `BACKUP_AGE_IDENTITY_FILE` | restore host only | age **private** key file for restores | `/keys/backup-identity.txt` |
| `BACKUP_TIME_UTC` | backup | Nightly run time | `21:30` |
| `BACKUP_HEALTHCHECK_URL` | backup | Optional dead-man's-switch ping | `https://hc-ping.com/<uuid>` |
| `BACKUP_KEEP_DAILY` / `_WEEKLY` / `_MONTHLY`, `BACKUP_PITR_DAYS`, `BACKUP_ARCHIVE_MODE`, `BACKUP_DATABASES` | backup | Retention and archiving overrides | `7` / `4` / `12`, `35`, `on`, `businessos` |
| `CADDY_HTTP_PORT` / `CADDY_HTTPS_PORT`, `IMAGE_TAG` | compose | Published ports (rehearsal only) and image tag | `80` / `443`, `latest` |

`SESSION_SECRET` has been removed.

## Rehearse the production stack locally

```sh
# throwaway env with random secrets + an age keypair, kept outside the repo
docker compose -p bos-prodcheck -f infra/docker/docker-compose.prod.yml \
  -f infra/docker/docker-compose.prodcheck.yml --env-file /path/check.env up -d --build
curl -sk --resolve api.localhost:18443:127.0.0.1 https://api.localhost:18443/health -D -
docker compose -p bos-prodcheck -f … down -v
```

In the rehearsal, set `CADDY_TLS=internal`, `APP_DOMAIN=app.localhost`,
`API_DOMAIN=api.localhost`, `BACKUP_S3_ENDPOINT=http://s3:9000` and
`BACKUP_S3_PROVIDER=Other`, then create the bucket once with
`rclone mkdir offsite:<bucket>` inside the backup container.
