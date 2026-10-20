# Worker, jobs, alerts and health — operations notes

## The worker

The API process runs **no** scheduler. Every periodic job and every outbox
consumer runs in the worker:

```
cd services/api
python -m app.worker                 # run until SIGTERM / Ctrl+C
python -m app.worker --once          # one pass over what is due, then exit
python -m app.worker --list          # jobs, state, last outcome, failures
python -m app.worker --trigger CODE  # make a job due now
python -m app.worker --enable CODE   # turn a switched-off job back on
python -m app.worker --healthcheck   # exit 0 if the loop ticked recently (container HEALTHCHECK)
```

It needs the same env as the API (`DATABASE_URL` — the owner connection,
`APP_DATABASE_URL`, `REDIS_URL`, `EMAIL_*`/`SMTP_*`, `SENTRY_DSN`, `GIT_SHA`).
Run one or more; claims are DB-locked (`for update skip locked`), so a due job
runs once however many workers there are. Container: same image as the API,
command `python -m app.worker`, healthcheck `python -m app.worker --healthcheck`,
no ports. Stopping gives running jobs 30 s, then hands them back (due again at
once, no failure counted).

Jobs (`scheduled_jobs`, migration 0043; handlers in `app/jobs.py`):

| code | every | what |
|---|---|---|
| `fbr.outbox` | 1 min | file queued sales/returns with FBR; reap, reconcile unknown rows |
| `email.outbox` | 15 s | send queued email (`email.send` outbox rows) |
| `crm.followup_reminders` | 5 min | notify lead owners of due follow-ups |
| `pos.restock_alerts` | 1 day | tell owners what is running out |
| `ops.monitor` | 5 min | outbox-lag and stale-job alerts |
| `ops.prune` | 1 day | drop `job_runs` older than 90 days |

A job that fails `max_failures` times in a row is switched off and raises
`job.disabled`; fix the cause, then `--enable CODE`. A run is bounded by
`timeout_s`; a `running` row past its lock (its worker died) is reset by the
reaper and counted as a failure.

Adding a job: a seed row in a new migration plus a line in `jobs.HANDLERS`
(a test fails if the two disagree).

## Email

Requests never talk to SMTP: they queue an `email.send` outbox row and a
post-commit fast path tries it once; the worker retries with back-off (about
an hour), then marks it `failed` and raises `email.failed`. Rows carry no
tokens; the link's token is minted at delivery.

## Health

- `GET /health` — liveness, no I/O.
- `GET /ready` — both DB pools, Redis `PING`, and every file in the migrations
  folder applied. 503 with the failing check otherwise. Point the compose
  healthcheck and the proxy's upstream check here. The image must contain
  `infra/migrations` (or set `MIGRATIONS_DIR`), or `/ready` reports not ready.

## Logs

One JSON object per line on stdout (`LOG_FORMAT=text` for a dev terminal):
`ts, level, logger, msg, service, env, release, request_id, tenant_id,
user_id, actor_kind`, plus `method, route, status, duration_ms` on the access
line and `job_code, job_run_id` in the worker. Emails, phone numbers, CNICs,
tokens and `password=`-style values are masked; there is no query string in
the access line. Every response carries `X-Request-ID` (a well-formed client
value is kept); quote it when reporting a problem.

## Alerts

Every alert is a structured log line (`"alert": "<event>"`) and, if
`ALERT_WEBHOOK_URL` is set, a JSON POST (`text` + `alert`) — Slack, Discord,
ntfy and most uptime tools accept it. Events: `fbr.outbox_failed`,
`fbr.outbox_unknown` (the shop's owners are also notified in-app),
`job.disabled`, `job.stale`, `outbox.lag`, `email.failed`, `http.5xx_spike`,
`http.401_spike`, `http.ratelimit_spike`. Repeats are de-duplicated (outbox
lag and stale jobs hourly; spikes once per 5-minute window).

Thresholds: `ALERT_5XX_PER_5MIN` (20), `ALERT_401_PER_5MIN` (200),
`ALERT_RATELIMIT_PER_5MIN` (200), `OUTBOX_LAG_ALERT_MIN` (30).

## Rate limits

Redis-backed (Redis 7+), with an in-process fallback when Redis is down.
`X-Forwarded-For` is believed only when the direct peer is in
`TRUSTED_PROXY_CIDRS` (set it to the Caddy container network); the client is
the right-most address that isn't a trusted proxy. Limits: login 10/min/IP,
signup 5/min/IP, forgot/reset/verify/accept-invite 5 per 15 min per IP, reset
emails 3/h per address. Login attempts are reserved before the password is
checked (no parallel race). Five attempts without a success from one IP lock
that IP out of that account for 15 minutes (423 + `Retry-After`), doubling up
to 1 h — so a stranger can't lock the owner out. Past 30 attempts an hour on
one account (all IPs), attempts are slowed to one per 30 s (429). 20 failed
logins from one IP in 15 minutes throttle the IP. A password reset lifts
every lock on the account. If Redis is down, the in-process fallback never
evicts lockout/limit keys; when full it refuses new ones (429, fail closed),
and a `redis.unavailable` alert fires.

Alerts are redacted centrally (`alerts.emit`) and carry ids, codes and
exception types only — FBR and SMTP error text stays in the redacted log.
