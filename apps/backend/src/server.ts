import { createServer } from 'node:http';
import { GameStatus as PrismaGameStatus } from '@prisma/client';
import { env } from './config/env.js';
import { prisma } from './database/prisma.js';
import { createApp } from './app.js';
import { initSocket } from './websocket/socket.js';

const MAIN_GAME_ID = 'MAIN_GAME';

const bootstrap = async (): Promise<void> => {
  const app = createApp();
  const httpServer = createServer(app);

  initSocket(httpServer);

  await prisma.game.upsert({
    where: { id: MAIN_GAME_ID },
    update: {},
    create: { id: MAIN_GAME_ID, status: PrismaGameStatus.WAITING }
  });

  httpServer.listen(env.PORT, () => {
    process.stdout.write(`Backend listening on port ${env.PORT}\n`);
  });
};

bootstrap().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Failed to bootstrap server';
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
