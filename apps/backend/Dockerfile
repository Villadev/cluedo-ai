FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY libs/types/package.json ./libs/types/package.json
RUN pnpm install --frozen-lockfile=false

FROM deps AS build
COPY . .
RUN pnpm --filter @cluedo/backend prisma:generate
RUN pnpm --filter @cluedo/backend build

FROM node:20-alpine AS runtime
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/tsconfig.base.json ./
COPY --from=build /app/apps/backend ./apps/backend
COPY --from=build /app/libs/types ./libs/types
RUN pnpm install --prod --filter @cluedo/backend... --frozen-lockfile=false
EXPOSE 3000
CMD ["pnpm", "--filter", "@cluedo/backend", "start"]
