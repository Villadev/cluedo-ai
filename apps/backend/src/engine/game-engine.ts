import { AIService } from '../services/AIService.js';
import { GameStoreService } from '../services/game-store.service.js';
import { errorLogger } from '../utils/error-logger.js';
import type {
  AccusationInput,
  AskQuestionInput,
  Clue,
  Game,
  GameSolution,
  Player,
  Character,
  TimelineEvent,
  PublicGameView,
  PublicParticipant,
  PublicCharacterView
} from '../types/game.types.js';
import { GameStates } from '../types/game.types.js';
import { HttpError } from '../utils/http-error.js';
import { generateId, nowIso } from '../utils/id.js';

const MAX_PLAYERS = 17;

export class GameEngine {
  constructor(
    private readonly store: GameStoreService,
    private readonly aiService: AIService
  ) {}

  public createGame(): Game {
    const timestamp = nowIso();
    const game: Game = {
      id: generateId(),
      state: 'LOBBY',
      players: [],
      characters: [],
      assassinCharacterId: null,
      murder: null,
      introNarrative: null,
      solution: null,
      clues: [],
      turns: [],
      currentTurnIndex: 0,
      roundNumber: 1,
      tensionLevel: 0,
      winnerPlayerId: null,
      timeline: [],
      createdAt: timestamp,
      updatedAt: timestamp
    };

    console.log("[GAME STATE] NEW → LOBBY");
    this.recordTimelineEvent(game, {
      type: 'STATE_CHANGE',
      description: 'Partida creada i inicialitzada en la sala d\'espera.'
    });

    this.store.save(game);
    return game;
  }

  public async addPlayer(gameId: string, nickname: string): Promise<Game> {
    const game = this.getGameOrThrow(gameId);
    if (game.state !== 'LOBBY') {
      throw new HttpError(409, 'Només es poden unir jugadors durant la sala d\'espera');
    }

    if (game.players.length >= MAX_PLAYERS) {
      throw new HttpError(400, 'La partida està plena');
    }

    const player: Player = {
      id: generateId(),
      nickname,
      characterId: null,
      isReady: true,
      isEliminated: false,
      hasAccused: false,
      askedThisRound: false,
      accusedThisRound: false,
      accusationCooldown: 0
    };

    game.players.push(player);

    console.log("Player joined:", nickname);
    this.recordTimelineEvent(game, {
      type: 'PLAYER_JOIN',
      playerId: player.id,
      description: `El jugador ${nickname} s'ha unit a la partida.`
    });

    game.updatedAt = nowIso();
    this.store.save(game);
    return game;
  }

  public async startGame(gameId: string): Promise<Game> {
    const game = this.getGameOrThrow(gameId);
    console.log("[GAME START] Preparing game", gameId);

    try {
      this.validateGameStateTransition(game.state, GameStates.READY);

      if (game.players.length < 2) {
        throw new HttpError(400, 'Es necessiten almenys 2 jugadors per començar');
      }

      game.state = GameStates.READY;

      this.recordTimelineEvent(game, {
        type: 'STATE_CHANGE',
        description: 'CASE_GENERATION_STARTED'
      });

      console.log("[AI] Case generation started");

      // Generar cas complet
      let fullCase;
      try {
        this.recordTimelineEvent(game, {
          type: 'STATE_CHANGE',
          description: 'OPENAI_REQUEST_CASE'
        });

        fullCase = await this.aiService.generateFullCase(game.players.length);

        this.recordTimelineEvent(game, {
          type: 'STATE_CHANGE',
          description: 'OPENAI_RESPONSE_RECEIVED'
        });

        console.log("[AI] Case generation completed");
      } catch (aiError: any) {
        console.error("[AI ERROR]", aiError);
        this.recordTimelineEvent(game, {
          type: 'STATE_CHANGE',
          description: 'OPENAI_ERROR'
        });
        this.recordTimelineEvent(game, {
          type: 'STATE_CHANGE',
          description: 'CASE_GENERATION_FAILED'
        });
        throw aiError;
      }

      // Mapejar personatges de la IA a l'estructura del joc
      game.characters = fullCase.characters.map(c => ({
        id: generateId(),
        name: c.name,
        profession: c.profession,
        description: c.description,
        personality: c.personality,
        possibleMotive: c.possibleMotive,
        secret: c.secret,
        coartada: c.coartada,
        rumor: c.rumor,
        relationships: c.relationships,
        tensions: c.tensions,
        isAssassin: c.name === fullCase.assassin
      }));

      // Si l'assassí no s'ha trobat pel nom (rar), n'assignem un
      if (!game.characters.some(c => c.isAssassin)) {
        game.characters[0]!.isAssassin = true;
      }

      const assassinChar = game.characters.find(c => c.isAssassin)!;
      game.assassinCharacterId = assassinChar.id;

      // Assignar personatges als jugadors
      const shuffledCharacters = this.shuffle([...game.characters]);
      game.players.forEach((player, index) => {
        const assignedChar = shuffledCharacters[index % shuffledCharacters.length]!;
        player.characterId = assignedChar.id;
        this.recordTimelineEvent(game, {
          type: 'CHARACTER_ASSIGNED',
          playerId: player.id,
          characterId: assignedChar.id,
          description: `A ${player.nickname} se li ha assignat el personatge: ${assignedChar.name}`
        });
      });

      // Configurar el crim
      const killerPlayer = game.players.find(p => p.characterId === game.assassinCharacterId);
      game.murder = {
        killerPlayerId: killerPlayer?.id || 'IA',
        weapon: fullCase.weapon,
        location: fullCase.location,
        victim: fullCase.victim
      };

      // Narrativa
      game.introNarrative = fullCase.introductionNarrative;
      game.solution = {
        assassin: assassinChar.name,
        weapon: fullCase.weapon,
        location: fullCase.location,
        victimName: fullCase.victim,
        finalNarrative: fullCase.solutionNarrative
      };

      // Pistes
      game.clues = fullCase.clues.map((c, index) => ({
        id: generateId(),
        type: c.type,
        text: c.text,
        isTrue: true,
        roundNumber: Math.floor(index / game.players.length) + 1,
        createdAt: nowIso()
      }));

      this.recordTimelineEvent(game, {
        type: 'STATE_CHANGE',
        description: 'CASE_STORED'
      });

      this.recordTimelineEvent(game, {
        type: 'STATE_CHANGE',
        description: 'SOLUTION_AVAILABLE'
      });

      game.updatedAt = nowIso();
      this.store.save(game);
      return game;
    } catch (error: any) {
      game.state = GameStates.LOBBY;
      this.store.save(game);
      throw error;
    }
  }

  public async startPlaying(gameId: string): Promise<Game> {
    const game = this.getGameOrThrow(gameId);
    if (game.state !== 'READY') {
      throw new HttpError(409, 'La partida ha d\'estar en estat READY per començar a jugar');
    }

    this.validateGameStateTransition(game.state, GameStates.PLAYING);
    game.state = GameStates.PLAYING;

    this.recordTimelineEvent(game, {
      type: 'STATE_CHANGE',
      description: 'La partida ha començat. Que comenci el misteri!'
    });

    this.recordTimelineEvent(game, {
      type: 'ROUND_START',
      roundNumber: 1,
      description: 'Ronda 1 iniciada'
    });

    game.updatedAt = nowIso();
    this.store.save(game);
    return game;
  }

  public async askQuestion(gameId: string, input: AskQuestionInput): Promise<{ response: string; game: Game }> {
    const game = this.getGameOrThrow(gameId);
    if (game.state !== 'PLAYING') {
      throw new HttpError(409, 'La partida no està en curs');
    }

    const player = this.getPlayerOrThrow(game, input.playerId);
    this.assertActivePlayer(player);

    if (player.askedThisRound || player.accusedThisRound) {
      throw new HttpError(409, 'Ja has realitzat la teva acció en aquesta ronda');
    }

    const publicState = JSON.stringify(this.getPublicState(game.id));
    const response = await this.aiService.respondToQuestion(publicState, input.question);

    player.askedThisRound = true;
    game.turns.push({
      id: generateId(),
      playerId: player.id,
      question: input.question,
      answer: response,
      createdAt: nowIso()
    });

    this.recordTimelineEvent(game, {
      type: 'QUESTION',
      playerId: player.id,
      text: input.question,
      description: `${player.nickname} ha preguntat: ${input.question}`
    });

    await this.nextTurn(game);
    this.store.save(game);
    return { response, game };
  }

  public async handleAccusation(gameId: string, input: AccusationInput): Promise<Game> {
    const game = this.getGameOrThrow(gameId);
    if (game.state !== 'PLAYING') {
      throw new HttpError(409, 'La partida no està en curs');
    }

    const player = this.getPlayerOrThrow(game, input.playerId);
    this.assertActivePlayer(player);

    if (player.askedThisRound || player.accusedThisRound) {
      throw new HttpError(409, 'Ja has realitzat la teva acció en aquesta ronda');
    }

    if (player.accusationCooldown > 0) {
      throw new HttpError(409, `Has d'esperar ${player.accusationCooldown} rondes per tornar a acusar`);
    }

    const accusedPlayer = this.getPlayerOrThrow(game, input.accusedPlayerId);
    const murder = game.murder;

    if (!murder) {
      throw new HttpError(500, 'No s\'ha trobat la informació del crim');
    }

    const isCorrect =
      accusedPlayer.characterId === game.assassinCharacterId &&
      input.weapon.toLowerCase().includes(murder.weapon.toLowerCase()) &&
      input.location.toLowerCase().includes(murder.location.toLowerCase());

    player.accusedThisRound = true;
    player.hasAccused = true;

    this.recordTimelineEvent(game, {
      type: 'ACCUSATION',
      playerId: player.id,
      targetCharacterId: accusedPlayer.characterId || undefined,
      success: isCorrect,
      description: `${player.nickname} ha acusat a ${accusedPlayer.nickname}`
    });

    if (isCorrect) {
      game.state = GameStates.FINISHED;
      game.winnerPlayerId = player.id;
      this.recordTimelineEvent(game, {
        type: 'GAME_END',
        winnerPlayerId: player.id,
        description: `Enhorabona! ${player.nickname} ha resolt el cas!`
      });
    } else {
      player.accusationCooldown = 2;
      game.tensionLevel = Math.min(100, game.tensionLevel + 15);
    }

    await this.nextTurn(game);
    this.store.save(game);
    return game;
  }

  public getPublicState(gameId: string, requesterPlayerId?: string): PublicGameView {
    const game = this.getGameOrThrow(gameId);
    const currentTurnPlayer = this.getCurrentTurnPlayer(game);

    return {
      id: game.id,
      state: game.state,
      players: game.players.map((player) => {
        const character = game.characters.find((c) => c.id === player.characterId);

        const canSeePrivateInfo = requesterPlayerId === player.id || game.state === 'FINISHED';

        const publicCharacter: PublicCharacterView | undefined = character ? {
          id: character.id,
          name: character.name,
          profession: character.profession,
          description: character.description,
          personality: character.personality,
          possibleMotive: character.possibleMotive,
          secret: canSeePrivateInfo ? character.secret : '???',
          coartada: canSeePrivateInfo ? character.coartada : '???',
          rumor: character.rumor,
          relationships: character.relationships,
          tensions: character.tensions
        } : undefined;

        return {
          id: player.id,
          nickname: player.nickname,
          character: publicCharacter,
          isReady: player.isReady,
          isEliminated: player.isEliminated,
          hasAccused: player.hasAccused,
          askedThisRound: player.askedThisRound,
          accusedThisRound: player.accusedThisRound,
          accusationCooldown: player.accusationCooldown
        };
      }),
      clues: game.clues
        .filter(c => c.roundNumber <= game.roundNumber)
        .map(c => ({
          id: c.id,
          playerId: c.playerId,
          type: c.type,
          text: c.text,
          roundNumber: c.roundNumber,
          createdAt: c.createdAt
        })),
      currentTurnPlayerId: currentTurnPlayer?.id ?? null,
      roundNumber: game.roundNumber,
      tensionLevel: game.tensionLevel,
      winnerPlayerId: game.winnerPlayerId,
      createdAt: game.createdAt,
      updatedAt: game.updatedAt
    };
  }

  public getParticipants(gameId: string): PublicParticipant[] {
    const game = this.getGameOrThrow(gameId);
    return game.players.map((player) => {
      const character = game.characters.find((c) => c.id === player.characterId);
      return {
        id: player.id,
        publicCharacter: character ? character.name : 'Sospitós'
      };
    });
  }

  public getInstructions(): string {
    return this.aiService.getInstructionsContext();
  }

  public getIntro(gameId: string): string {
    const game = this.getGameOrThrow(gameId);
    if (!game.introNarrative) {
      throw new HttpError(404, 'La introducció encara no està disponible');
    }
    return game.introNarrative;
  }

  public getSolution(gameId: string): GameSolution | { message: string } {
    const game = this.getGameOrThrow(gameId);
    if (!game.solution) {
      return { message: 'La solució encara no està disponible' };
    }

    return game.solution;
  }

  public endGame(gameId: string, winnerPlayerId?: string): Game {
    const game = this.getGameOrThrow(gameId);
    this.validateGameStateTransition(game.state, GameStates.FINISHED);
    game.state = GameStates.FINISHED;
    if (winnerPlayerId) {
      game.winnerPlayerId = winnerPlayerId;
    }
    game.updatedAt = nowIso();
    this.store.save(game);
    return game;
  }

  public resetGame(gameId: string): Game {
    const game = this.getGameOrThrow(gameId);
    game.state = GameStates.LOBBY;
    game.players = [];
    game.characters = [];
    game.assassinCharacterId = null;
    game.murder = null;
    game.introNarrative = null;
    game.solution = null;
    game.clues = [];
    game.turns = [];
    game.currentTurnIndex = 0;
    game.roundNumber = 1;
    game.tensionLevel = 0;
    game.winnerPlayerId = null;
    game.timeline = [];
    game.updatedAt = nowIso();
    this.store.save(game);
    return game;
  }

  public deletePlayer(gameId: string, playerId: string): Game {
    const game = this.getGameOrThrow(gameId);
    game.players = game.players.filter((p) => p.id !== playerId);
    game.updatedAt = nowIso();
    this.store.save(game);
    return game;
  }

  private async nextTurn(game: Game): Promise<void> {
    const allPlayersActed = game.players.every((p) => p.askedThisRound || p.accusedThisRound || p.isEliminated);

    if (allPlayersActed) {
      game.roundNumber += 1;
      game.tensionLevel = Math.min(100, game.tensionLevel + 10);

      console.log("Starting round:", game.roundNumber);
      this.recordTimelineEvent(game, {
        type: 'ROUND_START',
        roundNumber: game.roundNumber,
        description: `Ronda ${game.roundNumber} iniciada`
      });

      game.players.forEach((p) => {
        p.askedThisRound = false;
        p.accusedThisRound = false;
        if (p.accusationCooldown > 0) {
          p.accusationCooldown -= 1;
        }
      });
      game.currentTurnIndex = 0;
    } else {
      let nextIndex = game.currentTurnIndex;
      let count = 0;
      do {
        nextIndex = (nextIndex + 1) % game.players.length;
        count++;
      } while (
        (game.players[nextIndex]?.isEliminated ||
        game.players[nextIndex]?.askedThisRound ||
        game.players[nextIndex]?.accusedThisRound) &&
        count < game.players.length
      );
      game.currentTurnIndex = nextIndex;
    }

    game.updatedAt = nowIso();
  }

  private shuffle<T>(array: T[]): T[] {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j] as T, newArray[i] as T];
    }
    return newArray;
  }

  private getGameOrThrow(gameId: string): Game {
    const game = this.store.getById(gameId);
    if (!game) {
      throw new HttpError(404, 'Partida no trobada');
    }
    return game;
  }

  private getPlayerOrThrow(game: Game, playerId: string): Player {
    const player = game.players.find((entry) => entry.id === playerId);
    if (!player) {
      throw new HttpError(404, 'Jugador no trobat');
    }
    return player;
  }

  private getCurrentTurnPlayer(game: Game): Player | undefined {
    return game.players[game.currentTurnIndex];
  }

  private assertActivePlayer(player: Player): void {
    if (player.isEliminated) {
      throw new HttpError(409, 'Un jugador eliminat no pot actuar');
    }
  }

  public getDebugData(gameId: string): any {
    const game = this.getGameOrThrow(gameId);
    return {
      game,
      players: game.players,
      characters: game.characters,
      clues: game.clues,
      roundNumber: game.roundNumber,
      state: game.state,
      errors: errorLogger.getLogs()
    };
  }

  public getTimeline(gameId: string): TimelineEvent[] {
    const game = this.getGameOrThrow(gameId);
    return [...game.timeline].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  private validateGameStateTransition(currentState: string, nextState: string): void {
    const allowedTransitions: Record<string, string[]> = {
      [GameStates.LOBBY]: [GameStates.READY, GameStates.LOBBY],
      [GameStates.READY]: [GameStates.PLAYING, GameStates.LOBBY],
      [GameStates.PLAYING]: [GameStates.FINISHED, GameStates.LOBBY],
      [GameStates.FINISHED]: [GameStates.LOBBY]
    };

    const allowed = allowedTransitions[currentState];
    if (!allowed || !allowed.includes(nextState)) {
      const error = new HttpError(400, `Transició d'estat no vàlida: ${currentState} -> ${nextState}`);
      errorLogger.push("STATE TRANSITION", error);
      throw error;
    }
  }

  private recordTimelineEvent(game: Game, event: Omit<TimelineEvent, 'timestamp'>): void {
    game.timeline.push({
      ...event,
      timestamp: nowIso()
    });
  }

  public getGameStateInfo(gameId: string): any {
    const game = this.getGameOrThrow(gameId);
    return {
      state: game.state,
      playersCount: game.players.length,
      charactersCount: game.characters.length,
      roundNumber: game.roundNumber
    };
  }
}
