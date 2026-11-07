# syntax=docker/dockerfile:1
#
# One Dockerfile, three images. Build from the repository root:
#   docker build --target api     -t sadrulemail/rwa-api .
#   docker build --target indexer -t sadrulemail/rwa-indexer .
#   docker build --target web     -t sadrulemail/rwa-web .
#
# Contract addresses come from packages/contracts (generated from contracts/deployments), so rebuild
# after deploying to a new chain. NEXT_PUBLIC_* values are compiled into the web bundle: pass them as
# build arguments when the browser reaches the API or the chain somewhere other than localhost.

ARG NODE_IMAGE=node:22.23.4-alpine3.24

# ---------------------------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
RUN npm install -g pnpm@10.34.9 && npm cache clean --force
WORKDIR /repo

# Install every workspace dependency once; the manifests change less often than the code.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/indexer/package.json apps/indexer/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS source
COPY . .
RUN pnpm --filter @rwa/contracts build

# ---------------------------------------------------------------------------------------------------
# API: NestJS build, then a production-only copy of the package and its workspace dependencies.
FROM source AS api-build
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm --filter @rwa/api build \
 && pnpm --filter @rwa/api deploy --prod --legacy /out \
 && rm -rf /out/src /out/*.spec.* /out/.env.example

FROM ${NODE_IMAGE} AS api
ARG VERSION=dev
LABEL org.opencontainers.image.title="rwa-api" \
      org.opencontainers.image.description="RWA platform API: wallet sign-in, KYC review, audit trail and read models" \
      org.opencontainers.image.source="https://github.com/sadrulemail/rwa-tokenization-platform" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}"
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY --from=api-build --chown=node:node /out ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/health" || exit 1
CMD ["node", "dist/main.js"]

# ---------------------------------------------------------------------------------------------------
# Indexer: Ponder loads its TypeScript config at start-up, so the image keeps the sources.
FROM source AS indexer-build
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm --filter @rwa/indexer deploy --prod --legacy /out

FROM ${NODE_IMAGE} AS indexer
ARG VERSION=dev
LABEL org.opencontainers.image.title="rwa-indexer" \
      org.opencontainers.image.description="RWA platform indexer: contract events to PostgreSQL (Ponder)" \
      org.opencontainers.image.source="https://github.com/sadrulemail/rwa-tokenization-platform" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}"
ENV NODE_ENV=production DATABASE_SCHEMA=indexer_live VIEWS_SCHEMA=indexer PORT=42069
WORKDIR /app
# Ponder writes its build cache (.ponder/) and generated types next to the config.
RUN chown node:node /app
COPY --from=indexer-build --chown=node:node /out ./
USER node
EXPOSE 42069
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=10 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/health" || exit 1
# Tables live in DATABASE_SCHEMA; the API reads them through views in VIEWS_SCHEMA.
CMD ["sh", "-c", "exec node_modules/.bin/ponder start --port \"$PORT\" --schema \"$DATABASE_SCHEMA\" --views-schema \"$VIEWS_SCHEMA\""]

# ---------------------------------------------------------------------------------------------------
# Web: Next.js standalone output (server.js plus only the files it traces).
FROM source AS web-build
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_CHAIN_ID=31337
ARG NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
ARG NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
ARG NEXT_PUBLIC_LOCAL_WALLETS=true
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone \
    NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_CHAIN_ID=${NEXT_PUBLIC_CHAIN_ID} \
    NEXT_PUBLIC_RPC_URL=${NEXT_PUBLIC_RPC_URL} \
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=${NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID} \
    NEXT_PUBLIC_LOCAL_WALLETS=${NEXT_PUBLIC_LOCAL_WALLETS}
RUN pnpm --filter @rwa/web build \
 && cp -r apps/web/public apps/web/.next/standalone/apps/web/public \
 && cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static

FROM ${NODE_IMAGE} AS web
ARG VERSION=dev
LABEL org.opencontainers.image.title="rwa-web" \
      org.opencontainers.image.description="RWA platform investor portal and operations console (Next.js)" \
      org.opencontainers.image.source="https://github.com/sadrulemail/rwa-tokenization-platform" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}"
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=web-build --chown=node:node /repo/apps/web/.next/standalone ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/" || exit 1
CMD ["node", "apps/web/server.js"]
