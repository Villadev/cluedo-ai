import { createServer } from 'node:http';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { GameService } from './modules/game/game.service.js';
import { initSocket } from './websocket/socket.js';

const bootstrap = async (): Promise<void> => {
  const app = createApp();
  const httpServer = createServer(app);

  initSocket(httpServer);

  new GameService().ensureMainGame();

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
