# syntax=docker/dockerfile:1
# Business OS web image (gate I2). Build from the REPO ROOT — npm workspaces
# need the root lockfile and packages/types:
#   docker build -f apps/web/Dockerfile -t business-os-web .
#
# next.config.mjs sets output: "standalone", so the runtime stage carries only
# server.js and the node_modules it actually traces — no dev deps, no source.
#
# NEXT_PUBLIC_* values are inlined into the client bundle at build time, so
# they are build args, not runtime env. API_INTERNAL_URL is for the
# same-origin /api rewrite (D-51), which Next also resolves at build time.

ARG NODE_IMAGE=node:20-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/types/package.json packages/types/
RUN npm ci --workspace @business-os/web --include-workspace-root --no-audit --no-fund

FROM ${NODE_IMAGE} AS build
WORKDIR /repo
ARG NEXT_PUBLIC_API_URL=/api
ARG API_INTERNAL_URL=http://api:4000
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    API_INTERNAL_URL=${API_INTERNAL_URL}
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
