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

/**
 * Controlador per a la gestió de les partides.
 * Tots els mètodes retornen HTTP 200 en cas d'èxit.
 */
export class GameController {
  /**
   * Crea una nova partida.
   * Retorna l'estat inicial de la partida creada.
   */
  public async createGame(_req: Request, res: Response): Promise<void> {
    const game = gameEngine.createGame();
    // Canviat de 201 a 200 per requeriment del frontend
    res.status(200).json({
      success: true,
      gameState: gameEngine.getPublicState(game.id)
    });
  }

  /**
   * Permet a un jugador unir-se a una partida existent.
   */
  public async joinGame(req: Request, res: Response): Promise<void> {
    const parsed = joinSchema.parse(req.body);
    const gameId = this.getGameId(req);
    const game = await gameEngine.addPlayer(gameId, parsed.name);
    // Canviat de 201 a 200 per requeriment del frontend
    res.status(200).json({
      success: true,
      gameState: gameEngine.getPublicState(game.id)
    });
  }

  /**
   * Indica que un jugador està llest.
   */
  public async setReady(req: Request, res: Response): Promise<void> {
    const parsed = readySchema.parse(req.body);
    const gameId = this.getGameId(req);
    const game = await gameEngine.setReady(gameId, parsed.playerId);
    res.status(200).json({
      success: true,
      gameState: gameEngine.getPublicState(game.id, parsed.playerId)
    });
  }

  /**
   * Processa una pregunta d'un jugador al Mestre del Joc.
   */
  public async ask(req: Request, res: Response): Promise<void> {
    const parsed = askSchema.parse(req.body);
    const gameId = this.getGameId(req);
    const result = await gameEngine.askQuestion(gameId, parsed);

    res.status(200).json({
      success: true,
      response: result.response,
      gameState: gameEngine.getPublicState(result.game.id, parsed.playerId)
    });
  }

  /**
   * Processa una acusació realitzada per un jugador.
   */
  public async accuse(req: Request, res: Response): Promise<void> {
    const parsed = accusationSchema.parse(req.body);
    const gameId = this.getGameId(req);
    const game = await gameEngine.handleAccusation(gameId, parsed);
    res.status(200).json({
      success: true,
      gameState: gameEngine.getPublicState(game.id, parsed.playerId)
    });
  }

  /**
   * Obté l'estat públic actual d'una partida.
   */
  public async getGame(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    const requesterPlayerId = typeof req.query.playerId === 'string' ? req.query.playerId : undefined;
    const game = gameEngine.getPublicState(gameId, requesterPlayerId);
    res.status(200).json({
      success: true,
      gameState: game
    });
  }

  /**
   * Retorna la llista de participants d'una partida.
   */
  public async getPlayers(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    res.status(200).json({
      success: true,
      players: gameEngine.getParticipants(gameId)
    });
  }

  /**
   * Retorna les instruccions del joc en format text.
   */
  public async getInstructions(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    gameEngine.getPublicState(gameId);
    res.status(200).type('text/plain').send(gameEngine.getInstructions());
  }

  /**
   * Obté la narrativa d'introducció de la partida.
   */
  public async getIntro(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    res.status(200).json({
      success: true,
      intro: gameEngine.getIntro(gameId)
    });
  }

  /**
   * Retorna la solució final del cas.
   */
  public async getSolution(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    res.status(200).json({
      success: true,
      solution: gameEngine.getSolution(gameId)
    });
  }

  /**
   * Finalitza una partida en curs.
   */
  public async endGame(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    const parsed = endSchema.parse(req.body);
    const game = gameEngine.endGame(gameId, parsed.winnerPlayerId);
    res.status(200).json({
      success: true,
      gameState: gameEngine.getPublicState(game.id)
    });
  }

  /**
   * Reinicia completament una partida.
   */
  public async resetGame(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    const game = gameEngine.resetGame(gameId);
    res.status(200).json({
      success: true,
      gameState: gameEngine.getPublicState(game.id)
    });
  }

  /**
   * Retorna la llista detallada dels usuaris/jugadors.
   */
  public async getUsers(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    const game = gameEngine.getPublicState(gameId);
    res.status(200).json({
      success: true,
      players: game.players.map((p) => ({ id: p.id, name: p.name }))
    });
  }

  /**
   * Elimina un jugador de la partida.
   */
  public async deleteUser(req: Request, res: Response): Promise<void> {
    const { id: gameId, userId } = userParamsSchema.parse(req.params);
    const game = gameEngine.deletePlayer(gameId, userId);
    res.status(200).json({
      success: true,
      gameState: gameEngine.getPublicState(game.id)
    });
  }

  private getGameId(req: Request): string {
    return paramsSchema.parse(req.params).id;
  }
}
