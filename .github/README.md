# CI, security scans and deploys

| Workflow | When | What fails it |
|---|---|---|
| `ci.yml` → **workflows** | every PR | a `uses:` not pinned to a 40-hex commit SHA (`.github/scripts/check-action-pins.sh`; local `./` actions excepted), or an actionlint finding |
| `ci.yml` → **backend** | every PR, push to `main` | `ruff check`, `mypy` (strict on new modules — `services/api/pyproject.toml`; `tests/core/test_mypy_strict.py` fails if a new module isn't listed), `pytest` on Postgres 16 + pgvector (after `scripts.migrate`) with Redis |
| `ci.yml` → **contract** | every PR | `packages/api-client` differs from what `npm run api-client:generate` produces from the FastAPI schema |
| `ci.yml` → **web** | every PR | ESLint errors, `tsc`, Vitest, `next build` |
| `ci.yml` → **e2e-smoke** | every PR | Playwright `smoke.spec.ts` (log in → POS sale → receipt) and `security-headers.spec.ts` against a CI-started API (:4000) and production web build (:3000) |
| `security.yml` | every PR, push to `main`, Mondays 03:17 UTC | `pip-audit` on `requirements.txt`, `npm audit --audit-level=high`, `gitleaks` over the full history (`.gitleaks.toml`) |
| `docker.yml` | every PR | the API / web image doesn't build, or Trivy finds a fixable HIGH/CRITICAL. Skips with a warning while a Dockerfile doesn't exist yet |
| `deploy.yml` | tag `vX.Y.Z` → staging; manual run → production | see below |

**Supply chain.** Every third-party action is pinned to a full commit SHA with the
version as a comment (`uses: docker/login-action@<sha> # v3.7.0`), container images
run from workflows are pinned by digest, and `.github/dependabot.yml` opens weekly
update PRs for actions, npm, pip and Docker. Workflows default to
`permissions: contents: read`; only deploy's image job gets `packages: write`.
To bump a pin by hand: `git ls-remote https://github.com/<owner>/<repo> refs/tags/<tag>`
(the `^{}` line for an annotated tag).

Lint warnings don't fail CI (yet): the logical-CSS rule is at `warn` until the
existing physical classes (`ml-`, `pr-`, `left-`, `text-left`…) are migrated, then
it becomes `error`.

## Releasing

1. `git tag v0.3.0 && git push origin v0.3.0` → images are built, Trivy-gated, pushed to
   GHCR as `ghcr.io/<owner>/<repo>-{api,web,caddy,postgres}:v0.3.0` (lowercased), and deployed to **staging**:
   pull → `scripts.migrate` → `up -d` → `scripts.seed_staging` (demo tenant wired to the
   FBR/PRAL **sandbox**) → `/api/health` smoke.
2. Check staging (14 §10). Then **Actions → Deploy → Run workflow**, enter the tag. The
   `production` environment's required reviewer approves; the same images are deployed.
   Production never builds anything: it only runs a tag that went through staging.

## GitHub settings the founder must create

**Environments** (Settings → Environments):

- `staging` — no reviewers.
- `production` — **Required reviewers** (the manual promote gate), and "Deployment
  branches and tags" limited to `v*` tags.

**Secrets, per environment** (same names in `staging` and `production`, different values):

| Secret | What |
|---|---|
| `DEPLOY_HOST` | the server's hostname or IP |
| `DEPLOY_USER` | SSH user in the `docker` group (no root) |
| `DEPLOY_SSH_KEY` | that user's private key (ed25519), deploy-only |
| `DEPLOY_KNOWN_HOSTS` | `ssh-keyscan -t ed25519 <host>` output, verified out of band — pins the host key |

**Secrets, `staging` only** (FBR sandbox, I9 — never production credentials):

| Secret | What |
|---|---|
| `STAGING_OWNER_EMAIL`, `STAGING_OWNER_PASSWORD` | the seeded demo tenant's owner login |
| `FBR_SANDBOX_TOKEN` | the PRAL **sandbox** bearer token from the IRIS/e.fbr.gov.pk sandbox registration |
| `FBR_SANDBOX_NTN` | the seller NTN/CNIC registered with the sandbox (7 or 13 digits) |
| `FBR_SANDBOX_BUSINESS_NAME`, `FBR_SANDBOX_PROVINCE`, `FBR_SANDBOX_ADDRESS` | the seller identity on that registration |

Without `FBR_SANDBOX_TOKEN` the seed leaves FBR off; the seed always sets the
environment to `sandbox`, whatever the token, and refuses to run with `NODE_ENV=production`.

**Variables, per environment**: `STAGING_URL` / `PRODUCTION_URL` (e.g. `https://staging.businessos.pk`).

`GITHUB_TOKEN` (automatic) pushes and pulls GHCR images; no extra registry secret is needed.

## The host

Once per server, by hand (the workflow never writes app secrets):

- Docker + compose plugin; the deploy user in the `docker` group.
- `/opt/business-os/.env` with the stack's settings and secrets (template:
  `infra/docker/prod.env.example`; runbook: `infra/deploy/README.md`), mode 600. It sets
  `IMAGE_PREFIX=ghcr.io/<owner>/<repo>` (lowercase), which the compose file uses.
- The deploy copies `infra/docker/docker-compose.prod.yml` there each release. Its images
  are `${IMAGE_PREFIX}-{api,web,caddy,postgres}:${IMAGE_TAG}`, and its `api` service runs
  `python -m scripts.migrate` / `scripts.seed_staging`. The `worker` service (same image,
  `python -m app.worker`) runs every scheduled job; the API runs none.
- The web image needs `API_ORIGIN` as a **build** arg (it's baked into the `/api`
  rewrite); the workflows pass `http://api:4000`. Caddy routes `/api/*` on the app host
  straight to the API container with the prefix stripped (`handle_path /api/*` in
  `infra/caddy/Caddyfile`), so the rewrite is only a fallback. The API believes
  `X-Forwarded-For` only from the compose subnet (`TRUSTED_PROXY_CIDRS` =
  `COMPOSE_SUBNET`, and uvicorn's `FORWARDED_ALLOW_IPS`).
