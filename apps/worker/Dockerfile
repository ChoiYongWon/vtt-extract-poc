FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/worker/package.json ./apps/worker/package.json
COPY apps/worker/tsconfig.json ./apps/worker/tsconfig.json
COPY apps/worker/src ./apps/worker/src
COPY packages/types/package.json ./packages/types/package.json
COPY packages/types/tsconfig.json ./packages/types/tsconfig.json
COPY packages/types/src ./packages/types/src

RUN pnpm install --filter @vtt/worker... --frozen-lockfile=false
RUN pnpm --filter @vtt/worker build

CMD ["node", "apps/worker/dist/apps/worker/src/index.js"]
