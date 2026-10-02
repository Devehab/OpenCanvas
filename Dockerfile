# syntax=docker/dockerfile:1.7
#
# OpenCanvas web app — multi-stage build producing a small, non-root image
# that runs the Next.js standalone server.
#
#   docker build -t opencanvas .
#   docker run -p 3000:3000 opencanvas
#
# Override the base image (e.g. a registry mirror) with
#   --build-arg NODE_IMAGE=mirror.gcr.io/library/node:22-bookworm-slim

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

# 1. Dependencies — cached until a manifest or the lockfile changes.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/renderer/package.json packages/renderer/
COPY packages/editor/package.json packages/editor/
COPY packages/export/package.json packages/export/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store

# 2. Build — produces apps/web/.next/standalone (server + traced dependencies).
FROM deps AS build
COPY . .
RUN pnpm --filter @opencanvas/web build

# 3. Runtime — only the standalone server, static assets and public files.
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/web/server.js"]
