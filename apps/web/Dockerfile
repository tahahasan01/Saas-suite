# syntax=docker/dockerfile:1
# Business OS web image (gate I2). Build from the REPO ROOT — npm workspaces
# need the root lockfile and packages/types + packages/api-client:
#   docker build -f apps/web/Dockerfile -t business-os-web .
#
# next.config.mjs sets output: "standalone", so the runtime stage carries only
# server.js and the node_modules it actually traces — no dev deps, no source.
#
# The browser calls only its own origin (/api, D-51). API_ORIGIN is where the
# /api rewrite goes; `next build` bakes it into the routes manifest, so it is a
# build arg (next.config.mjs refuses a production build without it). In
# production Caddy routes /api/* to the API directly and the rewrite is only
# the fallback. GIT_SHA tags the release.

ARG NODE_IMAGE=node:20-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/types/package.json packages/types/
COPY packages/api-client/package.json packages/api-client/
RUN npm ci --workspace @business-os/web --include-workspace-root --no-audit --no-fund

FROM ${NODE_IMAGE} AS build
WORKDIR /repo
ARG API_ORIGIN=http://api:4000
ARG GIT_SHA=""
ENV NEXT_TELEMETRY_DISABLED=1 \
    API_ORIGIN=${API_ORIGIN} \
    GIT_SHA=${GIT_SHA}
COPY --from=deps /repo/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.base.json turbo.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN npm run build --workspace @business-os/web

FROM ${NODE_IMAGE}
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
# outputFileTracingRoot is the monorepo root, so the standalone tree mirrors it.
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/login').then(r => process.exit(r.status < 500 ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "apps/web/server.js"]
