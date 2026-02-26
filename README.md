# cluedo-ai

Monorepo project for a real-time Cluedo game with one backend and two Angular frontends.

## Tech stack

- pnpm workspaces
- Backend: Node.js 20, Express, Prisma, SQLite, Socket.IO, TypeScript strict
- Frontends: Angular (player-ui, master-ui), TypeScript strict
- Shared contracts: `@cluedo/types`

## Workspace layout

- `apps/backend`
- `apps/player-ui`
- `apps/master-ui`
- `libs/types`

## Install

```bash
pnpm install
```

## Prisma migrate and seed

```bash
pnpm --filter @cluedo/backend prisma:migrate
pnpm --filter @cluedo/backend prisma:seed
```

## Run backend

```bash
pnpm --filter @cluedo/backend dev
```

Backend runs on `http://localhost:3000` by default.

## Run Angular apps

Player UI:

```bash
pnpm --filter @cluedo/player-ui start
```

Master UI:

```bash
pnpm --filter @cluedo/master-ui start
```

- Player UI default: `http://localhost:4200`
- Master UI default: `http://localhost:4300`

## Build all workspaces

```bash
pnpm build
```

## Docker local reference

```bash
docker compose up --build
```

`docker-compose.yml` is optional and intended for local development.

## Railway deployment steps

1. Create a Railway project and connect this repository.
2. Create three Railway services pointing to:
   - `apps/backend`
   - `apps/player-ui`
   - `apps/master-ui`
3. For backend, set environment variables:
   - `PORT=3000`
   - `CORS_ORIGIN=<player-ui-url>,<master-ui-url>`
4. Run one-time backend release commands:
   - `pnpm --filter @cluedo/backend prisma:migrate`
   - `pnpm --filter @cluedo/backend prisma:seed`
5. Deploy each service using its app Dockerfile.

## Game rules enforced by backend

- Only one active game (`MAIN_GAME`)
- 3 to 15 players
- Join allowed only in `WAITING`
- Start allowed only with at least 3 players
- Each player receives exactly one random card on start
- Valid state flow: `WAITING -> STARTED -> FINISHED`
- Real-time events:
  - `player_joined`
  - `game_started`
  - `player_assigned_card`
  - `game_state_updated`
