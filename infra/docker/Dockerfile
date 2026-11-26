# syntax=docker/dockerfile:1.7
# MotoAI — Multi-stage Docker build (pnpm monorepo + Next.js 15)

# ---- Base ----
FROM node:20-alpine AS base
RUN apk add --no-cache curl
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# ---- Dependencies ----
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY packages/core/package.json packages/core/
COPY packages/agent/package.json packages/agent/
COPY packages/channel/package.json packages/channel/
COPY modules/catalog/package.json modules/catalog/
COPY modules/pricing/package.json modules/pricing/
COPY modules/ingestion/package.json modules/ingestion/
COPY modules/customers/package.json modules/customers/
COPY modules/leads/package.json modules/leads/
COPY modules/handoff/package.json modules/handoff/
COPY modules/analytics/package.json modules/analytics/
COPY app/package.json app/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile --network-concurrency=4 --fetch-retries=5

# ---- Dev (optional volume-mounted development) ----
FROM deps AS dev
COPY . .
ENV NODE_ENV=development
EXPOSE 3000
CMD ["pnpm", "--filter", "@motoai/app", "dev"]

# ---- Build ----
FROM deps AS build
COPY . .
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PHASE=phase-production-build
RUN pnpm --filter @motoai/app build

# ---- Production ----
FROM node:20-alpine AS production
RUN apk add --no-cache curl
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Copy workspace manifests, node_modules, built app, and runtime packages/modules
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/modules ./modules
COPY --from=build /app/app/package.json ./app/
COPY --from=build /app/app/next.config.ts ./app/
COPY --from=build /app/app/node_modules ./app/node_modules
COPY --from=build /app/app/public ./app/public
COPY --from=build /app/app/.next ./app/.next

# Non-root user
RUN addgroup -g 1001 -S motoai && adduser -S motoai -u 1001 && chown -R motoai:motoai /app/app/.next
USER motoai

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -sf http://localhost:3000/api/health || exit 1

CMD ["pnpm", "--filter", "@motoai/app", "start"]
