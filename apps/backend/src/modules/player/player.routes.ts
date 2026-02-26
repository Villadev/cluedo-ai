import { Router } from 'express';
import { PlayerController } from './player.controller.js';

const playerController = new PlayerController();

export const playerRouter = Router();

playerRouter.get('/', (req, res) => playerController.list(req, res));
playerRouter.post('/join', (req, res) => playerController.join(req, res));
