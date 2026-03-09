import cors from 'cors';
import express from 'express';
import { corsOrigins } from './config/env.js';
import { swaggerSpec } from './config/swagger.js';
import { errorHandler } from './middleware/error-handler.js';
import { gameRouter } from './routes/game.routes.js';
import { successResponse } from './utils/api-response.js';

const swaggerUi = require('swagger-ui-express');

export const createApp = () => {
  const app = express();

  app.use(
    cors({
      origin: corsOrigins
    })
  );
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json(successResponse({ status: 'ok' }));
  });

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.use('/game', gameRouter);

  app.use(errorHandler);
  return app;
};
