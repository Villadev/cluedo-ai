import { Router } from 'express';
import { GameController } from './game.controller.js';

const gameController = new GameController();

export const gameRouter = Router();

/**
 * @swagger
 * /api/game/state:
 *   get:
 *     summary: Retorna l'estat actual de la partida
 *     tags: [Game]
 *     responses:
 *       200:
 *         description: Estat de la partida
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
gameRouter.get('/state', (req, res) => gameController.getState(req, res));

/**
 * @swagger
 * /api/game/start:
 *   post:
 *     summary: Inicia una partida
 *     tags: [Game]
 *     responses:
 *       200:
 *         description: Partida iniciada
 */
gameRouter.post('/start', (req, res) => gameController.startGame(req, res));

/**
 * @swagger
 * /api/game/finish:
 *   post:
 *     summary: Finalitza la partida activa
 *     tags: [Game]
 *     responses:
 *       200:
 *         description: Partida finalitzada
 */
gameRouter.post('/finish', (req, res) => gameController.finishGame(req, res));
