import { Router } from 'express';
import { PlayerController } from './player.controller.js';

const playerController = new PlayerController();

export const playerRouter = Router();

/**
 * @swagger
 * /api/players:
 *   get:
 *     summary: Retorna tots els jugadors
 *     tags: [Players]
 *     responses:
 *       200:
 *         description: Llista de jugadors
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 */
playerRouter.get('/', (req, res) => playerController.list(req, res));

/**
 * @swagger
 * /api/players/join:
 *   post:
 *     summary: Afegeix un jugador a la partida
 *     tags: [Players]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Jugador creat correctament
 *       400:
 *         description: Dades de jugador invàlides
 */
playerRouter.post('/join', (req, res) => playerController.join(req, res));
