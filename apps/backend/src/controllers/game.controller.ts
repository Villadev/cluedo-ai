import type { Request, Response } from 'express';
import { z } from 'zod';
import { gameEngine } from '../models/dependencies.js';

const joinSchema = z.object({
  name: z.string().trim().min(2).max(50)
});

const readySchema = z.object({
  playerId: z.string().uuid()
});

const askSchema = z.object({
  playerId: z.string().uuid(),
  question: z.string().trim().min(3).max(500)
});

const accusationSchema = z.object({
  playerId: z.string().uuid(),
  accusedPlayerId: z.string().uuid(),
  weapon: z.string().trim().min(2).max(100),
  location: z.string().trim().min(2).max(100)
});

const paramsSchema = z.object({
  id: z.string().uuid()
});

export class GameController {
  public async createGame(_req: Request, res: Response): Promise<void> {
    const game = gameEngine.createGame();
    res.status(201).json(gameEngine.getPublicState(game.id));
  }

  public async joinGame(req: Request, res: Response): Promise<void> {
    const parsed = joinSchema.parse(req.body);
    const gameId = this.getGameId(req);
    const game = await gameEngine.addPlayer(gameId, parsed.name);
    res.status(201).json(gameEngine.getPublicState(game.id));
  }

  public async setReady(req: Request, res: Response): Promise<void> {
    const parsed = readySchema.parse(req.body);
    const gameId = this.getGameId(req);
    const game = await gameEngine.setReady(gameId, parsed.playerId);
    res.status(200).json(gameEngine.getPublicState(game.id, parsed.playerId));
  }

  public async ask(req: Request, res: Response): Promise<void> {
    const parsed = askSchema.parse(req.body);
    const gameId = this.getGameId(req);
    const result = await gameEngine.askQuestion(gameId, parsed);

    res.status(200).json({
      response: result.response,
      game: gameEngine.getPublicState(result.game.id, parsed.playerId)
    });
  }

  public async accuse(req: Request, res: Response): Promise<void> {
    const parsed = accusationSchema.parse(req.body);
    const gameId = this.getGameId(req);
    const game = await gameEngine.handleAccusation(gameId, parsed);
    res.status(200).json(gameEngine.getPublicState(game.id, parsed.playerId));
  }

  public async getGame(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    const requesterPlayerId = typeof req.query.playerId === 'string' ? req.query.playerId : undefined;
    const game = gameEngine.getPublicState(gameId, requesterPlayerId);
    res.status(200).json(game);
  }

  public async getPlayers(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    res.status(200).json(gameEngine.getParticipants(gameId));
  }

  public async getInstructions(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    gameEngine.getPublicState(gameId);
    res.status(200).type('text/plain').send(gameEngine.getInstructions());
  }

  public async getIntro(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    res.status(200).json({ intro: gameEngine.getIntro(gameId) });
  }

  public async getSolution(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    res.status(200).json(gameEngine.getSolution(gameId));
  }

  private getGameId(req: Request): string {
    return paramsSchema.parse(req.params).id;
  }

}
