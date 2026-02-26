import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { corsOrigins } from './config/env.js';
import { gameRouter } from './modules/game/game.routes.js';
import { playerRouter } from './modules/player/player.routes.js';

export const createApp = () => {
  const app = express();

  app.use(
    cors({
      origin: corsOrigins
    })
  );
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api/game', gameRouter);
  app.use('/api/players', playerRouter);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    res.status(500).json({ message });
  });

  return app;
};
