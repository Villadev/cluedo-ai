FROM node:20-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY . .

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @cluedo/backend build

WORKDIR /app/apps/backend

EXPOSE 3000

CMD ["node", "dist/main.js"]
