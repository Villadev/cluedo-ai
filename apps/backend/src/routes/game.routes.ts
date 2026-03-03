import { Router } from 'express';
import { GameController } from '../controllers/game.controller.js';
import { asyncHandler } from '../middleware/error-handler.js';

const controller = new GameController();

export const gameRouter = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     CreateGameResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         state:
 *           type: string
 *     JoinGameRequest:
 *       type: object
 *       required: [name]
 *       properties:
 *         name:
 *           type: string
 *     ReadyRequest:
 *       type: object
 *       required: [playerId]
 *       properties:
 *         playerId:
 *           type: string
 *           format: uuid
 *     AskRequest:
 *       type: object
 *       required: [playerId, question]
 *       properties:
 *         playerId:
 *           type: string
 *           format: uuid
 *         question:
 *           type: string
 *     AccuseRequest:
 *       type: object
 *       required: [playerId, accusedPlayerId, weapon, location]
 *       properties:
 *         playerId:
 *           type: string
 *           format: uuid
 *         accusedPlayerId:
 *           type: string
 *           format: uuid
 *         weapon:
 *           type: string
 *         location:
 *           type: string
 */

/**
 * @swagger
 * /game:
 *   post:
 *     summary: Creates a new game in LOBBY state.
 *     tags: [Game]
 *     responses:
 *       201:
 *         description: Game created.
 */
gameRouter.post('/', asyncHandler((req, res) => controller.createGame(req, res)));

/**
 * @swagger
 * /game/{id}/join:
 *   post:
 *     summary: Adds a player to a lobby game.
 *     tags: [Game]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/JoinGameRequest'
 *     responses:
 *       201:
 *         description: Player added.
 */
gameRouter.post('/:id/join', asyncHandler((req, res) => controller.joinGame(req, res)));

/**
 * @swagger
 * /game/{id}/ready:
 *   post:
 *     summary: Marks player as ready and auto-starts when all are ready.
 *     tags: [Game]
 */
gameRouter.post('/:id/ready', asyncHandler((req, res) => controller.setReady(req, res)));

/**
 * @swagger
 * /game/{id}/ask:
 *   post:
 *     summary: Ask a question during IN_PROGRESS turn.
 *     tags: [Game]
 */
gameRouter.post('/:id/ask', asyncHandler((req, res) => controller.ask(req, res)));

/**
 * @swagger
 * /game/{id}/accuse:
 *   post:
 *     summary: Submit an accusation during ACCUSATION_PHASE.
 *     tags: [Game]
 */
gameRouter.post('/:id/accuse', asyncHandler((req, res) => controller.accuse(req, res)));

/**
 * @swagger
 * /game/{id}:
 *   get:
 *     summary: Returns the public game state.
 *     tags: [Game]
 */
gameRouter.get('/:id', asyncHandler((req, res) => controller.getGame(req, res)));
