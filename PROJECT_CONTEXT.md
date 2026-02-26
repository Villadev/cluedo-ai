# Cluedo AI - Project Context

This repository is a pnpm monorepo with one backend and two Angular frontends.

## Global rules

- Single active game only (`MAIN_GAME`).
- 3-15 players.
- Players join only while game is `WAITING`.
- Exactly one card is assigned per player on game start.
- State transitions: `WAITING -> STARTED -> FINISHED`.
- Backend is the single source of truth.
- Real-time communication is done through Socket.IO.

## Workspace layout

- `apps/backend`: Express + Prisma + Socket.IO backend.
- `apps/player-ui`: Player-facing Angular app.
- `apps/master-ui`: Master dashboard Angular app.
- `libs/types`: Shared strict domain types consumed by all apps.
