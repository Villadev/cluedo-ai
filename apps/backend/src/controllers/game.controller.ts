import { Request, Response } from 'express';
import { z } from 'zod';
import { gameEngine } from '../models/dependencies.js';
import { successResponse } from '../utils/api-response.js';
import { emitGameStateUpdate, emitPlayerJoined, emitGameStarted, sendNarratorMessage } from '../websocket/socket.js';

const createSchema = z.object({
  maxRounds: z.number().int().min(1).max(20).optional().default(5)
});

const joinSchema = z.object({
  name: z.string().trim().min(2).max(50)
});

const askSchema = z.object({
  playerId: z.string().uuid(),
  question: z.string().trim().min(3).max(1000)
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
   * @openapi
   * /game:
   *   post:
   *     summary: Crea una nova partida.
   *     responses:
   *       200:
   *         description: Partida creada.
   */
  public async createGame(req: Request, res: Response): Promise<void> {
    const { maxRounds } = createSchema.parse(req.body || {});
    const game = gameEngine.createGame(maxRounds);
    res.status(200).json(successResponse(gameEngine.getPublicState(game.id)));
  }

  /**
   * @openapi
   * /game/{id}/join:
   *   post:
   *     summary: Permet a un jugador unir-se a una partida.
   *     responses:
   *       200:
   *         description: Jugador unit.
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
    emitGameStateUpdate(gameId, gameEngine.getGameStateInfo(gameId));

    res.status(200).json(successResponse(gameEngine.getPublicState(game.id)));
  }

  /**
   * @openapi
   * /game/{id}/start:
   *   post:
   *     summary: Inicia la partida generant el cas i la narrativa.
   *     responses:
   *       200:
   *         description: Partida iniciada.
   */
  public async startGame(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    const game = await gameEngine.startGame(gameId);

    // WS Emit
    const state = gameEngine.getPublicState(game.id);
    emitGameStarted(gameId, state);
    emitGameStateUpdate(gameId, gameEngine.getGameStateInfo(gameId));
    sendNarratorMessage(gameId, 'La partida ha començat.');

    res.status(200).json(successResponse(state));
  }

  /**
   * @openapi
   * /game/{id}/play:
   *   post:
   *     summary: Començar a jugar la partida (canvi d'estat de PLAYER_INFO a PLAYING).
   *     responses:
   *       200:
   *         description: Partida jugant.
   */
  public async startPlaying(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    const game = await gameEngine.startPlaying(gameId);

    // WS Emit
    emitGameStateUpdate(gameId, gameEngine.getGameStateInfo(gameId));

    res.status(200).json(successResponse(gameEngine.getPublicState(game.id)));
  }

  /**
   * @openapi
   * /game/{id}/ask:
   *   post:
   *     summary: Realitza una pregunta al mestre del joc.
   *     responses:
   *       200:
   *         description: Pregunta realitzada.
   */
  public async ask(req: Request, res: Response): Promise<void> {
    const parsed = askSchema.parse(req.body);
    const gameId = this.getGameId(req);
    const result = await gameEngine.askQuestion(gameId, parsed);

    await gameEngine.nextTurn(gameId);
    res.status(200).json(successResponse({
      response: result.response,
      game: gameEngine.getPublicState(result.game.id, parsed.playerId)
    }));
  }

  /**
   * @openapi
   * /game/{id}/accuse:
   *   post:
   *     summary: Realitza una acusació per intentar guanyar la partida.
   *     responses:
   *       200:
   *         description: Acusació realitzada.
   */
  public async accuse(req: Request, res: Response): Promise<void> {
    const parsed = accusationSchema.parse(req.body);
    const gameId = this.getGameId(req);
    const game = await gameEngine.handleAccusation(gameId, parsed);

    const player = game.players.find(p => p.id === parsed.playerId);
    const accusedPlayer = game.players.find(p => p.id === parsed.accusedPlayerId);
    if (player && accusedPlayer) {
      sendNarratorMessage(gameId, `${player.nickname} ha acusat a ${accusedPlayer.nickname}.`);
    }

    // WS Emit
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

  /**
   * @openapi
   * /game/{id}/options:
   *   get:
   *     summary: Retorna les opcions d'armes i llocs per a l'acusació.
   *     responses:
   *       200:
   *         description: Opcions retornades.
   */
  public async getOptions(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    res.status(200).json(successResponse(gameEngine.getOptions(gameId)));
  }

  /**
   * @openapi
   * /game/{id}:
   *   get:
   *     summary: Retorna l'estat de la partida.
   *     responses:
   *       200:
   *         description: Estat retornat.
   */
  public async getGame(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    const requesterPlayerId = typeof req.query.playerId === 'string' ? req.query.playerId : undefined;
    const game = gameEngine.getPublicState(gameId, requesterPlayerId);
    res.status(200).json(successResponse(game));
  }

  /**
   * @openapi
   * /game/{id}/state:
   *   get:
   *     summary: Retorna informació resumida de l'estat de la partida per a polling.
   *     responses:
   *       200:
   *         description: Estat retornat.
   */
  public async getState(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    res.status(200).json(successResponse(gameEngine.getGameStateInfo(gameId)));
  }

  /**
   * @openapi
   * /game/{id}/debug:
   *   get:
   *     summary: Retorna l'estat complet per a depuració.
   *     responses:
   *       200:
   *         description: Dades de debug retornades.
   */
  public async debug(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    res.status(200).json(successResponse(gameEngine.getDebugData(gameId)));
  }

  /**
   * @openapi
   * /game/{id}/timeline:
   *   get:
   *     summary: Retorna l'historial d'esdeveniments de la partida.
   *     responses:
   *       200:
   *         description: Timeline retornat.
   */
  public async timeline(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    res.status(200).json(successResponse(gameEngine.getTimeline(gameId)));
  }

  /**
   * @openapi
   * /game/{id}/chat:
   *   get:
   *     summary: Retorna l'historial del xat de la partida.
   *     responses:
   *       200:
   *         description: Chat retornat.
   */
  public async getChat(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    res.status(200).json(successResponse(gameEngine.getChatHistory(gameId)));
  }

  /**
   * @openapi
   * /game/{id}/questions:
   *   get:
   *     summary: Retorna l'historial de preguntes de la partida.
   *     responses:
   *       200:
   *         description: Preguntes retornades.
   */
  public async getQuestions(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    res.status(200).json(successResponse(gameEngine.getQuestionHistory(gameId)));
  }

  /**
   * @openapi
   * /game/{id}/players:
   *   get:
   *     summary: Retorna la llista de participants de la partida.
   *     responses:
   *       200:
   *         description: Jugadors retornats.
   */
  public async getPlayers(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    res.status(200).json(successResponse(gameEngine.getParticipants(gameId)));
  }

  /**
   * @openapi
   * /game/{id}/instructions:
   *   get:
   *     summary: Retorna les instruccions del joc.
   *     responses:
   *       200:
   *         description: Instruccions retornades.
   */
  public async getInstructions(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    gameEngine.getPublicState(gameId);
    res.status(200).json(successResponse(gameEngine.getInstructions()));
  }

  /**
   * @openapi
   * /game/{id}/intro:
   *   get:
   *     summary: Retorna la introducció narrativa de la partida.
   *     responses:
   *       200:
   *         description: Intro retornada.
   */
  public async getIntro(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    res.status(200).json(successResponse({ intro: gameEngine.getIntro(gameId) }));
  }

  /**
   * @openapi
   * /game/{id}/clues/round/{roundNumber}:
   *   get:
   *     summary: Retorna la llista de pistes per a una ronda específica.
   *     responses:
   *       200:
   *         description: Pistes retornades.
   */
  public async getCluesByRound(req: Request, res: Response): Promise<void> {
    const { id: gameId, roundNumber } = roundParamsSchema.parse(req.params);
    const clues = gameEngine.getCluesForRound(gameId, roundNumber);
    res.status(200).json(successResponse({ round: roundNumber, clues }));
  }

  /**
   * @openapi
   * /game/{id}/players/{playerId}/secret:
   *   get:
   *     summary: Retorna la informació secreta d'un jugador.
   *     responses:
   *       200:
   *         description: Secret retornat.
   */
  public async getPlayerSecret(req: Request, res: Response): Promise<void> {
    const { id: gameId, playerId } = playerSecretParamsSchema.parse(req.params);
    const secret = gameEngine.getPlayerSecret(gameId, playerId);
    res.status(200).json(successResponse({ secret }));
  }

  /**
   * @openapi
   * /game/{id}/timeline/log:
   *   post:
   *     summary: Registra un esdeveniment personalitzat al timeline.
   *     responses:
   *       200:
   *         description: Event registrat.
   */
  public async logTimelineEvent(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    const { type, description } = logEventSchema.parse(req.body);
    gameEngine.logTimelineEvent(gameId, type, description);
    res.status(200).json(successResponse({ message: 'Event registrat' }));
  }

  /**
   * @openapi
   * /game/{id}/solution:
   *   get:
   *     summary: Retorna la solució de la partida.
   *     responses:
   *       200:
   *         description: Solució retornada.
   */
  public async getSolution(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    res.status(200).json(successResponse(gameEngine.getSolution(gameId)));
  }

  /**
   * @openapi
   * /game/{id}/force-next-round:
   *   post:
   *     summary: Força l'avançament a la següent ronda.
   *     responses:
   *       200:
   *         description: Ronda avançada.
   */
  public async forceNextRound(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    const game = await gameEngine.forceNextRound(gameId);

    // WS Emit
    emitGameStateUpdate(gameId, gameEngine.getGameStateInfo(gameId));

    res.status(200).json(successResponse({
      gameState: gameEngine.getPublicState(game.id)
    }));
  }

  /**
   * @openapi
   * /game/{id}/end:
   *   post:
   *     summary: Finalitza una partida en curs.
   *     responses:
   *       200:
   *         description: Partida finalitzada.
   */
  public async endGame(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    const parsed = endSchema.parse(req.body);
    const game = gameEngine.endGame(gameId, parsed.winnerPlayerId);

    // WS Emit
    emitGameStateUpdate(gameId, gameEngine.getGameStateInfo(gameId));

    res.status(200).json(successResponse({
      gameState: gameEngine.getPublicState(game.id)
    }));
  }

  /**
   * @openapi
   * /game/{id}/reset:
   *   post:
   *     summary: Reinicia completament una partida.
   *     responses:
   *       200:
   *         description: Partida reiniciada.
   */
  public async resetGame(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    const game = gameEngine.resetGame(gameId);

    // WS Emit
    emitGameStateUpdate(gameId, gameEngine.getGameStateInfo(gameId));

    res.status(200).json(successResponse({
      gameState: gameEngine.getPublicState(game.id)
    }));
  }

  /**
   * @openapi
   * /game/{id}/users:
   *   get:
   *     summary: Retorna la llista de jugadors actuals.
   *     responses:
   *       200:
   *         description: Usuaris retornats.
   */
  public async getUsers(req: Request, res: Response): Promise<void> {
    const gameId = this.getGameId(req);
    const game = gameEngine.getPublicState(gameId);
    res.status(200).json(successResponse({
      players: game.players.map((p) => ({ id: p.id, nickname: p.nickname }))
    }));
  }

  /**
   * @openapi
   * /game/{id}/users/{userId}:
   *   delete:
   *     summary: Elimina un jugador de la partida.
   *     responses:
   *       200:
   *         description: Usuari eliminat.
   */
  public async deleteUser(req: Request, res: Response): Promise<void> {
    const { id: gameId, userId } = userParamsSchema.parse(req.params);
    const game = gameEngine.deletePlayer(gameId, userId);

    // WS Emit
    emitGameStateUpdate(gameId, gameEngine.getGameStateInfo(gameId));

    res.status(200).json(successResponse({
      gameState: gameEngine.getPublicState(game.id)
    }));
  }

  private getGameId(req: Request): string {
    return paramsSchema.parse(req.params).id;
  }

}
