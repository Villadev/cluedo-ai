import type { Request, Response } from 'express';
import { z } from 'zod';
import { gameEngine } from '../models/dependencies.js';
import { successResponse } from '../utils/api-response.js';

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

const endSchema = z.object({
  winnerPlayerId: z.string().uuid().optional()
});

const userParamsSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid()
});

const paramsSchema = z.object({
  id: z.string().uuid()
});

export class GameController {
  /**
   * Crea una nova partida.
   */
  public async createGame(_req: Request, res: Response): Promise<void> {
    const game = await gameEngine.createGame();
    res.status(200).json(successResponse(gameEngine.getPublicState(game.id)));
  }

  /**
   * Inicia la partida generant el cas i la narrativa.
   */
  public async startGame(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    const game = await gameEngine.startGame(gameId);
    res.status(200).json(successResponse(gameEngine.getPublicState(game.id)));
  }

  /**
   * Realitza una pregunta al mestre del joc.
   */
  public async ask(req: Request, res: Response): Promise<void> {
    const parsed = askSchema.parse(req.body);
    const gameId = this.getGameId(req);
    const result = await gameEngine.askQuestion(gameId, parsed);

    res.status(200).json(successResponse({
      response: result.response,
      game: gameEngine.getPublicState(result.game.id, parsed.playerId)
    }));
  }

  /**
   * Realitza una acusació per intentar guanyar la partida.
   */
  public async accuse(req: Request, res: Response): Promise<void> {
    const parsed = accusationSchema.parse(req.body);
    const gameId = this.getGameId(req);
    const game = await gameEngine.handleAccusation(gameId, parsed);
    res.status(200).json(successResponse(gameEngine.getPublicState(game.id, parsed.playerId)));
  }

  /**
   * Retorna l'estat actual de la partida.
   */
  public async getGame(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    const requesterPlayerId = typeof req.query.playerId === 'string' ? req.query.playerId : undefined;
    const game = gameEngine.getPublicState(gameId, requesterPlayerId);
    res.status(200).json(successResponse(game));
  }

  /**
   * Retorna la llista de participants de la partida.
   */
  public async getPlayers(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    res.status(200).json(successResponse(gameEngine.getParticipants(gameId)));
  }

  /**
   * Retorna les instruccions del joc.
   */
  public async getInstructions(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    gameEngine.getPublicState(gameId);
    res.status(200).json(successResponse(gameEngine.getInstructions()));
  }

  /**
   * Retorna la introducció narrativa de la partida.
   */
  public async getIntro(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    res.status(200).json(successResponse({ intro: gameEngine.getIntro(gameId) }));
  }

  /**
   * Retorna la solució de la partida.
   */
  public async getSolution(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    res.status(200).json(successResponse(gameEngine.getSolution(gameId)));
  }

  /**
   * Finalitza una partida en curs.
   */
  public async endGame(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    const parsed = endSchema.parse(req.body);
    const game = gameEngine.endGame(gameId, parsed.winnerPlayerId);
    res.status(200).json(successResponse({
      gameState: gameEngine.getPublicState(game.id)
    }));
  }

  /**
   * Reinicia completament una partida.
   */
  public async resetGame(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    const game = gameEngine.resetGame(gameId);
    res.status(200).json(successResponse({
      gameState: gameEngine.getPublicState(game.id)
    }));
  }

  /**
   * Retorna la llista de jugadors actuals.
   */
  public async getUsers(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    const game = gameEngine.getPublicState(gameId);
    res.status(200).json(successResponse({
      players: game.players.map((p) => ({ id: p.id, name: p.name }))
    }));
  }

  /**
   * Elimina un jugador de la partida.
   */
  public async deleteUser(req: Request, res: Response): Promise<void> {
    const { id: gameId, userId } = userParamsSchema.parse(req.params);
    const game = gameEngine.deletePlayer(gameId, userId);
    res.status(200).json(successResponse({
      gameState: gameEngine.getPublicState(game.id)
    }));
  }

  private getGameId(req: Request): string {
    return paramsSchema.parse(req.params).id;
  }

}
