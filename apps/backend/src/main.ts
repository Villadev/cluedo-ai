import { env } from './config/env.js';
import { createApp } from './app.js';

const bootstrap = (): void => {
  const app = createApp();

  app.listen(env.PORT, () => {
    console.log("[SERVER] Backend started");
    console.log("[SERVER] Environment validated");
    process.stdout.write(`Backend listening on port ${env.PORT}\n`);
  });
};

bootstrap();
