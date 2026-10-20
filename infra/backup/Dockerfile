# syntax=docker/dockerfile:1
# Postgres 16 + pgvector, with the backup toolchain baked in (gate I7):
#   age     client-side encryption to public keys (decryption key off-server)
#   rclone  any S3-compatible bucket (Cloudflare R2 default; B2, Wasabi …)
# Used twice in docker-compose.prod.yml: as `postgres` (archive_command ships
# WAL off-site) and as `backup` (nightly pg_dump, weekly base backup,
# retention). Build from the repo root:
#   docker build -f infra/backup/Dockerfile -t business-os-postgres .

# Same image as dev (infra/docker/docker-compose.yml), pinned by digest.
ARG PG_IMAGE=pgvector/pgvector:pg16@sha256:7b822b0aac60967beb1ea5e576b8602c94c300a157d187f385ae3e0da199b90a
ARG RCLONE_IMAGE=rclone/rclone:1.71.2

FROM ${RCLONE_IMAGE} AS rclone

FROM ${PG_IMAGE}
RUN apt-get update \
 && apt-get install -y --no-install-recommends age curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=rclone /usr/local/bin/rclone /usr/local/bin/rclone
COPY infra/backup/bin/ /usr/local/bin/
COPY infra/backup/pg_hba.conf /etc/postgresql/pg_hba.conf
# Scripts may be checked out with CRLF on Windows; bash would choke on \r.
RUN sed -i 's/\r$//' /usr/local/bin/bos-* /etc/postgresql/pg_hba.conf \
 && chmod 755 /usr/local/bin/bos-* \
 && chmod 644 /etc/postgresql/pg_hba.conf
