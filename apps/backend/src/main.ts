import { createServer } from 'node:http';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { initSocket, emitSystemChatMessage } from './websocket/socket.js';
import { gameEngine } from './models/dependencies.js';

const bootstrap = (): void => {
  const app = createApp();
  const server = createServer(app);

  // Initialize Socket.IO
  initSocket(server);

  // Wire up game engine events to websocket
  gameEngine.setSystemEventListener((gameId, message) => {
    emitSystemChatMessage(gameId, message);
  });

  server.listen(env.PORT, () => {
    console.log("[SERVER] Backend started with Socket.IO");
    console.log("[SERVER] Environment validated");
    process.stdout.write(`Backend listening on port ${env.PORT}\n`);
  });
};

bootstrap();
