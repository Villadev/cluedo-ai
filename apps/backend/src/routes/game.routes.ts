import { Router } from 'express';
import { GameController } from '../controllers/game.controller.js';
import { asyncHandler } from '../middleware/error-handler.js';

const controller = new GameController();

export const gameRouter = Router();

gameRouter.post('/', asyncHandler((req, res) => controller.createGame(req, res)));
gameRouter.post('/:id/join', asyncHandler((req, res) => controller.joinGame(req, res)));
gameRouter.post('/:id/ready', asyncHandler((req, res) => controller.setReady(req, res)));
gameRouter.post('/:id/ask', asyncHandler((req, res) => controller.ask(req, res)));
gameRouter.post('/:id/accuse', asyncHandler((req, res) => controller.accuse(req, res)));

gameRouter.get('/:id/players', asyncHandler((req, res) => controller.getPlayers(req, res)));
gameRouter.get('/:id/instructions', asyncHandler((req, res) => controller.getInstructions(req, res)));
gameRouter.get('/:id/solution', asyncHandler((req, res) => controller.getSolution(req, res)));
gameRouter.get('/:id/intro', asyncHandler((req, res) => controller.getIntro(req, res)));
gameRouter.get('/:id', asyncHandler((req, res) => controller.getGame(req, res)));
