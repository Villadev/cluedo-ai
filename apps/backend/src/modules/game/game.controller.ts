import type { Request, Response } from 'express';
import { GameService } from './game.service.js';

const gameService = new GameService();

export class GameController {
  public async getState(_req: Request, res: Response): Promise<void> {
    try {
      const state = await gameService.getState();
      res.status(200).json(state);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unexpected error';
      res.status(500).json({ message });
    }
  }

  public async startGame(_req: Request, res: Response): Promise<void> {
    try {
      const state = await gameService.startGame();
      res.status(200).json(state);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unexpected error';
      res.status(400).json({ message });
    }
  }

  public async finishGame(_req: Request, res: Response): Promise<void> {
    try {
      const state = await gameService.finishGame();
      res.status(200).json(state);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unexpected error';
      res.status(400).json({ message });
    }
  }
}
