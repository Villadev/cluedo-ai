FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

RUN corepack enable && corepack prepare pnpm@9.15.2 --activate

COPY . .

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @cluedo/backend build

WORKDIR /app/apps/backend

EXPOSE 3000

CMD ["node", "dist/main.js"]
