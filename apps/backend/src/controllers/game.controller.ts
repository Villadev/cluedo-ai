import { Request, Response } from 'express';
import { gameEngine } from '../models/dependencies.js';
import { emitPlayerJoined, emitGameStateUpdate, sendNarratorMessage } from '../websocket/socket.js';
import { successResponse } from '../utils/api-response.js';
import { Player } from '../types/game.types.js';
import { z } from 'zod';

const paramsSchema = z.object({ id: z.string().uuid() });
const joinSchema = z.object({ name: z.string().min(1) });
const accusationSchema = z.object({
  playerId: z.string().uuid(),
  accusedPlayerId: z.string().uuid(),
  weapon: z.string().min(1),
  location: z.string().min(1)
});
const roundParamsSchema = z.object({ id: z.string().uuid(), roundNumber: z.coerce.number().int().min(1) });
const playerSecretParamsSchema = z.object({ id: z.string().uuid(), playerId: z.string().uuid() });
const logEventSchema = z.object({ type: z.string().min(1), description: z.string() });
const createSchema = z.object({ maxRounds: z.number().int().min(1).optional() });
const userParamsSchema = z.object({ id: z.string().uuid(), userId: z.string().uuid() });

export class GameController {
  public async createGame(req: Request, res: Response): Promise<void> {
    const { maxRounds } = createSchema.parse(req.body || {});
    const game = gameEngine.createGame(maxRounds);
    res.status(200).json(successResponse(gameEngine.getPublicState(game.id)));
  }

  public async deleteAllGames(req: Request, res: Response): Promise<void> {
    gameEngine.deleteAllGames();
    res.status(200).json(successResponse({ message: 'Totes les partides eliminades' }));
  }

  public async joinGame(req: Request, res: Response): Promise<void> {
    const parsed = joinSchema.parse(req.body);
    const gameId = this.getGameId(req);
    const game = await gameEngine.addPlayer(gameId, parsed.name);

    const player = game.players.find(p => p.nickname === parsed.name);
    if (player) {
      emitPlayerJoined(gameId, player);
    }
    emitGameStateUpdate(gameId, gameEngine.getGameStateInfo(gameId));

    res.status(200).json(successResponse({
      playerId: player?.id,
      game: gameEngine.getPublicState(game.id, player?.id)
    }));
  }

  public async startGame(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    const game = await gameEngine.startGame(gameId);
    emitGameStateUpdate(gameId, gameEngine.getGameStateInfo(gameId));
    res.status(200).json(successResponse(gameEngine.getPublicState(game.id)));
  }

  public async playGame(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    const game = await gameEngine.playGame(gameId);
    emitGameStateUpdate(gameId, gameEngine.getGameStateInfo(gameId));
    res.status(200).json(successResponse(gameEngine.getPublicState(game.id)));
  }

  public async handleQuestion(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    const { message, playerId } = req.body;

    if (!playerId || !message) {
      res.status(400).json({ success: false, error: 'Manca playerId o missatge' });
      return;
    }

    const result = await gameEngine.askQuestion(gameId, {
      playerId,
      question: message
    });

    emitGameStateUpdate(gameId, gameEngine.getGameStateInfo(gameId));

    res.status(200).json(successResponse({
      response: result.response,
      game: gameEngine.getPublicState(result.game.id, playerId)
    }));
  }

  public async handleAccusation(req: Request, res: Response): Promise<void> {
    const parsed = accusationSchema.parse(req.body);
    const gameId = this.getGameId(req);
    const result = await gameEngine.makeAccusation(gameId, parsed);
    const game = result.game;

    const player = game.players.find((p: Player) => p.id === parsed.playerId);
    const accusedPlayer = game.players.find((p: Player) => p.id === parsed.accusedPlayerId);
    if (player && accusedPlayer) {
      sendNarratorMessage(gameId, `${player.nickname} ha acusat a ${accusedPlayer.nickname}.`);
    }

    if (game.state !== 'FINISHED') {
       await gameEngine.nextTurn(gameId);
    }
    emitGameStateUpdate(gameId, gameEngine.getGameStateInfo(gameId));

    const isCorrect = game.winnerPlayerId === parsed.playerId;

    res.status(200).json(successResponse({
      correct: isCorrect,
      penaltyRounds: isCorrect ? 0 : 2,
      game: gameEngine.getPublicState(game.id, parsed.playerId)
    }));
  }

  public async getOptions(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    res.status(200).json(successResponse(gameEngine.getOptions(gameId)));
  }

  public async getGame(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    const requesterPlayerId = typeof req.query.playerId === 'string' ? req.query.playerId : undefined;
    const game = gameEngine.getPublicState(gameId, requesterPlayerId);
    res.status(200).json(successResponse(game));
  }

  public async getState(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    res.status(200).json(successResponse(gameEngine.getGameStateInfo(gameId)));
  }

  public async debug(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    res.status(200).json(successResponse(gameEngine.getDebugData(gameId)));
  }

  public async timeline(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    res.status(200).json(successResponse(gameEngine.getTimeline(gameId)));
  }

  public async getChat(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    res.status(200).json(successResponse(gameEngine.getChatHistory(gameId)));
  }

  public async getQuestions(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    res.status(200).json(successResponse(gameEngine.getQuestionHistory(gameId)));
  }

  public async getInstructions(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    res.status(200).json(successResponse(gameEngine.getInstructions()));
  }

  public async getIntro(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    res.status(200).json(successResponse({ intro: gameEngine.getIntro(gameId) }));
  }

  public async getCluesByRound(req: Request, res: Response): Promise<void> {
    const { id: gameId, roundNumber } = roundParamsSchema.parse(req.params);
    const clues = gameEngine.getCluesForRound(gameId, roundNumber);
    res.status(200).json(successResponse({ round: roundNumber, clues }));
  }

  public async getPlayerSecret(req: Request, res: Response): Promise<void> {
    const { id: gameId, playerId } = playerSecretParamsSchema.parse(req.params);
    const secret = gameEngine.getPlayerSecret(gameId, playerId);
    res.status(200).json(successResponse({ secret }));
  }

  public async logTimelineEvent(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    const { type, description } = logEventSchema.parse(req.body);
    gameEngine.logTimelineEvent(gameId, type, description);
    res.status(200).json(successResponse({ message: 'Event registrat' }));
  }

  public async getSolution(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    res.status(200).json(successResponse(gameEngine.getSolution(gameId)));
  }

  public async forceNextRound(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    const game = await gameEngine.forceNextRound(gameId);
    emitGameStateUpdate(gameId, gameEngine.getGameStateInfo(gameId));
    res.status(200).json(successResponse({
      gameState: gameEngine.getPublicState(game.id)
    }));
  }

  public async resetGame(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    const game = gameEngine.resetGame(gameId);
    emitGameStateUpdate(gameId, gameEngine.getGameStateInfo(gameId));
    res.status(200).json(successResponse({
      gameState: gameEngine.getPublicState(game.id)
    }));
  }

  public async getPlayers(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    res.status(200).json(successResponse(gameEngine.getParticipants(gameId)));
  }

  public async getUsers(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    const game = gameEngine.getPublicState(gameId);
    res.status(200).json(successResponse({
      players: game.players.map((p) => ({ id: p.id, nickname: p.nickname }))
    }));
  }

  public async deleteUser(req: Request, res: Response): Promise<void> {
    const { id: gameId, userId } = userParamsSchema.parse(req.params);
    const game = gameEngine.deletePlayer(gameId, userId);
    emitGameStateUpdate(gameId, gameEngine.getGameStateInfo(gameId));
    res.status(200).json(successResponse({
      gameState: gameEngine.getPublicState(game.id)
    }));
  }

  private getGameId(req: Request): string {
    return paramsSchema.parse(req.params).id;
  }

  public async listAllGames(req: Request, res: Response): Promise<void> {
    const games = gameEngine.listAllGames();
    res.status(200).json(successResponse(games));
  }
}
