import { env } from './config/env.js';
import { createApp } from './app.js';

const bootstrap = (): void => {
  const app = createApp();

  app.listen(env.PORT, () => {
    process.stdout.write(`Backend listening on port ${env.PORT}\n`);
  });
};

bootstrap();
