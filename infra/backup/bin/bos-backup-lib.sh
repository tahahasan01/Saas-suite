#!/usr/bin/env bash
# Shared setup for the backup scripts (sourced, not run). See infra/backup/README.md.
#
# Off-site storage is any S3-compatible bucket; Cloudflare R2 is the default.
# rclone is configured entirely from env (no config file on disk):
#   BACKUP_S3_ENDPOINT          https://<account_id>.r2.cloudflarestorage.com
#   BACKUP_S3_BUCKET            bucket name
#   BACKUP_S3_ACCESS_KEY_ID     bucket-scoped token (R2: "Object Read & Write")
#   BACKUP_S3_SECRET_ACCESS_KEY
#   BACKUP_S3_REGION            auto (R2) | us-east-1 | …
#   BACKUP_S3_PROVIDER          Cloudflare (default) | Wasabi | Other (Backblaze B2) | Minio
#   BACKUP_PREFIX               path inside the bucket (default business-os)
# Encryption (client-side, before anything leaves the server):
#   BACKUP_AGE_RECIPIENTS       age public keys ("age1…", space separated). Public
#                               keys can encrypt but not decrypt: the server can
#                               write backups it can never read back.
#   BACKUP_AGE_IDENTITY_FILE    private key file — ONLY on a restore host, never
#                               on the production server.
set -euo pipefail

log() { printf '%s [%s] %s\n' "$(date -u +%FT%TZ)" "$(basename "$0")" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET is not set}"
: "${BACKUP_S3_ENDPOINT:?BACKUP_S3_ENDPOINT is not set}"
: "${BACKUP_S3_ACCESS_KEY_ID:?BACKUP_S3_ACCESS_KEY_ID is not set}"
: "${BACKUP_S3_SECRET_ACCESS_KEY:?BACKUP_S3_SECRET_ACCESS_KEY is not set}"

export RCLONE_CONFIG_OFFSITE_TYPE=s3
export RCLONE_CONFIG_OFFSITE_PROVIDER="${BACKUP_S3_PROVIDER:-Cloudflare}"
export RCLONE_CONFIG_OFFSITE_ENDPOINT="$BACKUP_S3_ENDPOINT"
export RCLONE_CONFIG_OFFSITE_REGION="${BACKUP_S3_REGION:-auto}"
export RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID"
export RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY"
# A bucket-scoped token may not list/create buckets; never try.
export RCLONE_CONFIG_OFFSITE_NO_CHECK_BUCKET=true
export RCLONE_CONFIG_OFFSITE_FORCE_PATH_STYLE=true
export RCLONE_CONFIG=/dev/null   # env-only config; nothing written to disk
export RCLONE_STATS_LOG_LEVEL=NOTICE
REMOTE="offsite:${BACKUP_S3_BUCKET}/${BACKUP_PREFIX:-business-os}"

# Postgres connection for the dump/base-backup jobs (the sidecar talks to the
# postgres service over the internal network; nothing is published).
export PGHOST="${PGHOST:-postgres}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-${POSTGRES_USER:-businessos}}"
export PGDATABASE="${PGDATABASE:-${POSTGRES_DB:-businessos}}"
[ -n "${POSTGRES_PASSWORD:-}" ] && export PGPASSWORD="${PGPASSWORD:-$POSTGRES_PASSWORD}"

encrypt() {
  : "${BACKUP_AGE_RECIPIENTS:?BACKUP_AGE_RECIPIENTS is not set (age public keys)}"
  local args=() r
  for r in $BACKUP_AGE_RECIPIENTS; do args+=(-r "$r"); done
  age "${args[@]}"
}

decrypt() {
  : "${BACKUP_AGE_IDENTITY_FILE:?BACKUP_AGE_IDENTITY_FILE is not set (restore host only)}"
  age -d -i "$BACKUP_AGE_IDENTITY_FILE"
}

# Optional dead-man's switch (e.g. a healthchecks.io check URL): pinged on
# success, /fail on failure. A night with no ping alerts the founder.
ping_monitor() {
  [ -n "${BACKUP_HEALTHCHECK_URL:-}" ] || return 0
  curl -fsS -m 10 --retry 3 -o /dev/null "${BACKUP_HEALTHCHECK_URL}${1:-}" || log "monitor ping failed"
}
