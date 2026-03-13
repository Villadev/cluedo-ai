import type { Request, Response } from 'express';
import { z } from 'zod';
import { gameEngine } from '../models/dependencies.js';
import { successResponse } from '../utils/api-response.js';
import {
  emitGameStateUpdated,
  emitPlayerJoined,
  emitGameStarted
} from '../websocket/socket.js';

const joinSchema = z.object({
  name: z.string().trim().min(2).max(50)
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

const roundParamsSchema = z.object({
  id: z.string().uuid(),
  roundNumber: z.string().transform(val => parseInt(val, 10))
});

const playerSecretParamsSchema = z.object({
  id: z.string().uuid(),
  playerId: z.string().uuid()
});

const logEventSchema = z.object({
  type: z.enum(['PLAYER_JOIN', 'CHARACTER_ASSIGNED', 'ROUND_START', 'QUESTION', 'CLUE', 'ACCUSATION', 'GAME_END', 'STATE_CHANGE', 'TTS_PLAYED', 'CLUE_ROUND_REVEALED', 'PLAYER_SECRET_ASSIGNED']),
  description: z.string().min(1)
});

export class GameController {
  /**
   * Crea una nova partida.
   */
  public async createGame(_req: Request, res: Response): Promise<void> {
    const game = gameEngine.createGame();
    res.status(200).json(successResponse(gameEngine.getPublicState(game.id)));
  }

  /**
   * Permet a un jugador unir-se a una partida.
   */
  public async joinGame(req: Request, res: Response): Promise<void> {
    const parsed = joinSchema.parse(req.body);
    const gameId = this.getGameId(req);
    const game = await gameEngine.addPlayer(gameId, parsed.name);

    // WS Emit
    const player = game.players.find(p => p.nickname === parsed.name);
    if (player) {
      emitPlayerJoined(gameId, player);
    }
    emitGameStateUpdated(gameId, gameEngine.getPublicState(game.id));

    res.status(200).json(successResponse(gameEngine.getPublicState(game.id)));
  }

  /**
   * Inicia la partida generant el cas i la narrativa.
   */
  public async startGame(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    const game = await gameEngine.startGame(gameId);

    // WS Emit
    const state = gameEngine.getPublicState(game.id);
    emitGameStarted(gameId, state);
    emitGameStateUpdated(gameId, state);

    res.status(200).json(successResponse(state));
  }

  /**
   * Comença a jugar la partida (canvi d'estat de READY a PLAYING).
   */
  public async startPlaying(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    const game = await gameEngine.startPlaying(gameId);

    // WS Emit
    emitGameStateUpdated(gameId, gameEngine.getPublicState(game.id));

    res.status(200).json(successResponse(gameEngine.getPublicState(game.id)));
  }

  /**
   * Realitza una pregunta al mestre del joc.
   */
  public async ask(req: Request, res: Response): Promise<void> {
    const parsed = askSchema.parse(req.body);
    const gameId = this.getGameId(req);
    const result = await gameEngine.askQuestion(gameId, parsed);

    // WS Emit is handled by the socket question event if coming from WS,
    // but for REST API we should also emit if needed.
    // Actually, the requirements say to fix the WS communication.

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

    // WS Emit
    emitGameStateUpdated(gameId, gameEngine.getPublicState(game.id));

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
   * Retorna informació resumida de l'estat de la partida per a polling.
   */
  public async getState(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    res.status(200).json(successResponse(gameEngine.getGameStateInfo(gameId)));
  }

  /**
   * Retorna l'estat complet per a depuració.
   */
  public async debug(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    res.status(200).json(successResponse(gameEngine.getDebugData(gameId)));
  }

  /**
   * Retorna l'historial d'esdeveniments de la partida.
   */
  public async timeline(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    res.status(200).json(successResponse(gameEngine.getTimeline(gameId)));
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
   * Retorna la llista de pistes per a una ronda específica.
   */
  public async getCluesByRound(req: Request, res: Response): Promise<void> {
    const { id: gameId, roundNumber } = roundParamsSchema.parse(req.params);
    const clues = gameEngine.getCluesForRound(gameId, roundNumber);
    res.status(200).json(successResponse({ round: roundNumber, clues }));
  }

  /**
   * Retorna la informació secreta d'un jugador.
   */
  public async getPlayerSecret(req: Request, res: Response): Promise<void> {
    const { id: gameId, playerId } = playerSecretParamsSchema.parse(req.params);
    const secret = gameEngine.getPlayerSecret(gameId, playerId);
    res.status(200).json(successResponse({ secret }));
  }

  /**
   * Registra un esdeveniment personalitzat al timeline.
   */
  public async logTimelineEvent(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    const { type, description } = logEventSchema.parse(req.body);
    gameEngine.logTimelineEvent(gameId, type, description);
    res.status(200).json(successResponse({ message: 'Event registrat' }));
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

    // WS Emit
    emitGameStateUpdated(gameId, gameEngine.getPublicState(game.id));

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

    // WS Emit
    emitGameStateUpdated(gameId, gameEngine.getPublicState(game.id));

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
      players: game.players.map((p) => ({ id: p.id, nickname: p.nickname }))
    }));
  }

  /**
   * Elimina un jugador de la partida.
   */
  public async deleteUser(req: Request, res: Response): Promise<void> {
    const { id: gameId, userId } = userParamsSchema.parse(req.params);
    const game = gameEngine.deletePlayer(gameId, userId);

    // WS Emit
    emitGameStateUpdated(gameId, gameEngine.getPublicState(game.id));

    res.status(200).json(successResponse({
      gameState: gameEngine.getPublicState(game.id)
    }));
  }

  private getGameId(req: Request): string {
    return paramsSchema.parse(req.params).id;
  }

}
