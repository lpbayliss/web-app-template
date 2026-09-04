# syntax=docker/dockerfile:1.7
#
# Stages:
#   deps       install all dependencies from the lockfile (cached by pnpm store)
#   build      compile client + server
#   dev        everything installed, source bind-mounted (compose `app` service / devcontainer)
#   prod-deps  production dependencies only
#   prod       prod-deps + dist, non-root, tini as PID 1
#
# Build:   docker build -t web-app-template --build-arg APP_VERSION=$(node -p "require('./package.json').version") .
# Run:     docker run --rm -p 3000:3000 --env-file .env web-app-template
# Worker:  docker run --rm --env-file .env web-app-template node --import ./dist/server/instrumentation.js dist/server/worker.js
# Migrate: docker run --rm --env-file .env web-app-template node dist/server/migrate.js

ARG NODE_VERSION=26
ARG PNPM_VERSION=11.12.0

# ---------------------------------------------------------------- base
FROM node:${NODE_VERSION}-alpine AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN apk add --no-cache tini && npm install -g pnpm@${PNPM_VERSION} && pnpm config set store-dir /pnpm/store
WORKDIR /app

# ---------------------------------------------------------------- deps
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

# ---------------------------------------------------------------- build
FROM deps AS build
COPY . .
RUN pnpm build

# ---------------------------------------------------------------- dev
FROM deps AS dev
ENV NODE_ENV=development
EXPOSE 3000 5173 6006
CMD ["pnpm", "dev"]

# ---------------------------------------------------------------- prod-deps
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Strip devDependencies from the manifest first: a plain `--prod` install keeps optional peers that
# resolve to root devDependencies (vitest, typescript, drizzle-kit ...). Versions still come from the
# lockfile; only dev-only subtrees disappear, which halves the image.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));delete p.devDependencies;delete p.scripts.prepare;fs.writeFileSync('package.json',JSON.stringify(p))" \
    && pnpm install --prod --ignore-scripts --no-frozen-lockfile

# ---------------------------------------------------------------- prod
FROM node:${NODE_VERSION}-alpine AS prod
ARG APP_VERSION=0.0.0
ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    PORT=3000 \
    HOST=0.0.0.0 \
    NODE_OPTIONS=--enable-source-maps
RUN apk add --no-cache tini
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/healthz || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--import", "./dist/server/instrumentation.js", "dist/server/main.js"]
