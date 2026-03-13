import { createServer } from 'node:http';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { initSocket } from './websocket/socket.js';

const bootstrap = (): void => {
  const app = createApp();
  const server = createServer(app);

  // Initialize Socket.IO
  initSocket(server);

  server.listen(env.PORT, () => {
    console.log("[SERVER] Backend started with Socket.IO");
    console.log("[SERVER] Environment validated");
    process.stdout.write(`Backend listening on port ${env.PORT}\n`);
  });
};

bootstrap();
