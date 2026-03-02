import { createServer } from 'node:http';
import { Role } from '@cluedo/types';
import { createApp } from './app.js';
import { env } from './config/env.js';

const bootstrap = (): void => {
  const app = createApp();
  const httpServer = createServer(app);

  httpServer.listen(env.PORT, () => {
    process.stdout.write(
      `Backend listening on port ${env.PORT}. Default role: ${Role.PLAYER}\n`
    );
  });
};

bootstrap();
