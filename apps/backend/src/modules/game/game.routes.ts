import { Router } from 'express';
import { GameController } from './game.controller.js';

const gameController = new GameController();

export const gameRouter = Router();

gameRouter.get('/state', (req, res) => gameController.getState(req, res));
gameRouter.post('/start', (req, res) => gameController.startGame(req, res));
gameRouter.post('/finish', (req, res) => gameController.finishGame(req, res));
