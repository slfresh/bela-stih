# The Bela game server, containerised.
#
# Build context is the REPO ROOT (the server consumes the workspace packages
# as raw TypeScript, run through tsx — the same way it runs in development,
# so there is no separate compile step to drift):
#
#   docker build -f apps/server/Dockerfile -t bela-server .
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Manifests first, so dependency layers cache across source-only changes.
COPY package.json package-lock.json tsconfig.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/engine/package.json packages/engine/
COPY packages/bots/package.json packages/bots/
COPY packages/table/package.json packages/table/
COPY apps/server/package.json apps/server/

# `install` rather than `ci`: only the server's slice of the workspace tree is
# present, and install reconciles that subset against the lock instead of
# refusing. Versions still come from package-lock.json.
RUN npm install --omit=dev --no-audit --no-fund

# Sources. Raw TS on purpose — tsx runs it directly.
COPY packages/shared-types packages/shared-types
COPY packages/engine packages/engine
COPY packages/bots packages/bots
COPY packages/table packages/table
COPY apps/server apps/server

EXPOSE 2567
USER node
CMD ["npx", "tsx", "apps/server/src/index.ts"]
