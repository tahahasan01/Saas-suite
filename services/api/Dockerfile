# syntax=docker/dockerfile:1
# Business OS API image (gate I1). Build from the REPO ROOT — it needs
# infra/migrations as well as services/api:
#   docker build -f services/api/Dockerfile -t business-os-api .
#
# - Dependencies come only from requirements.lock: exact versions, sha256
#   hashes, installed with --require-hashes --no-deps (re-lock with
#   services/api/scripts/lock_deps.sh). Test tools are not in the image.
# - Runs as an unprivileged user (uid 10001) with a read-only app tree.
# - ENV=production by default, so the startup guard is armed: the container
#   exits at boot on default passwords or a missing BOS_DATA_KEYS.

ARG PYTHON_IMAGE=python:3.12-slim-bookworm

FROM ${PYTHON_IMAGE} AS deps
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_CACHE_DIR=1
RUN python -m venv /opt/venv
COPY services/api/requirements.lock /tmp/requirements.lock
RUN /opt/venv/bin/pip install --require-hashes --no-deps -r /tmp/requirements.lock

FROM ${PYTHON_IMAGE}
ENV PATH=/opt/venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ENV=production \
    API_PORT=4000
RUN groupadd --system --gid 10001 app \
 && useradd --system --uid 10001 --gid app --home-dir /srv --shell /usr/sbin/nologin app
COPY --from=deps /opt/venv /opt/venv
# Same layout as the repo, so scripts/migrate.py finds ../../infra/migrations.
WORKDIR /srv/services/api
COPY infra/migrations /srv/infra/migrations
COPY services/api/app ./app
COPY services/api/scripts ./scripts
USER app
EXPOSE 4000
# Liveness only. Swap to /ready once it exists (Phase 2E, gate O1).
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=3 \
  CMD ["python", "-c", "import sys,urllib.request as u; sys.exit(0 if u.urlopen('http://127.0.0.1:4000/health', timeout=4).status == 200 else 1)"]
# One worker: the in-process rate limiter and scheduler are not multi-process
# safe until Phase 2B moves them to Redis and the worker container.
# Forwarded headers are trusted only from FORWARDED_ALLOW_IPS (the proxy's
# network, set in docker-compose.prod.yml), never from the internet.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${API_PORT} --proxy-headers --forwarded-allow-ips \"${FORWARDED_ALLOW_IPS:-127.0.0.1}\" --no-server-header"]
