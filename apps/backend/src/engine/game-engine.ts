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
  PublicCharacterView,
  AIServiceClue,
  FullCase,
  ChatMessage,
  Question
} from '../types/game.types.js';
import { GameStates } from '../types/game.types.js';
import { HttpError } from '../utils/http-error.js';
import { generateId, nowIso } from '../utils/id.js';

const MAX_PLAYERS = 17;

// We need a way to emit system messages from the engine
// but to avoid circular dependencies we might need a listener or a simpler approach.
// For now, let's assume the controller handles the high-level events.
// But some events like "New Round" or "Clue Revealed" happen inside nextTurn.

export class GameEngine {
  private onSystemEvent?: (gameId: string, message: string) => void;

  constructor(
    private readonly store: GameStoreService,
    private readonly aiService: AIService
  ) {}

  public setSystemEventListener(listener: (gameId: string, message: string) => void): void {
    this.onSystemEvent = listener;
  }

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
      chatHistory: [],
      questionHistory: [],
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
    this.validateGameStateTransition(game.state, GameStates.READY);

    if (game.players.length < 2) {
      throw new HttpError(400, 'Es necessiten almenys 2 jugadors per començar');
    }

    console.log("[GAME STATE] LOBBY → READY (Generant cas...)");

    const fullCase = await this.aiService.generateFullCase(game.players.length);

    game.murder = {
      killerPlayerId: '', // To be assigned
      weapon: fullCase.weapon,
      location: fullCase.location,
      victim: fullCase.victim,
      crimeWindow: fullCase.crimeWindow
    };

    game.introNarrative = fullCase.introductionNarrative;
    game.solution = {
      assassin: fullCase.assassin,
      weapon: fullCase.weapon,
      location: fullCase.location,
      victimName: fullCase.victim,
      finalNarrative: fullCase.solutionNarrative
    };

    game.characters = fullCase.characters.map((c) => ({
      ...c,
      id: generateId(),
      isAssassin: c.name === fullCase.assassin
    }));

    const assassinCharacter = game.characters.find(c => c.isAssassin);
    if (assassinCharacter) {
       game.assassinCharacterId = assassinCharacter.id;
    }

    const shuffledCharacters = this.shuffle(game.characters);
    game.players.forEach((player, index) => {
      const character = shuffledCharacters[index];
      if (character) {
        player.characterId = character.id;
        if (character.id === game.assassinCharacterId) {
          game.murder!.killerPlayerId = player.id;
        }
      }
    });

    game.clues = [
      ...fullCase.clues.round1.map(c => ({ ...c, id: generateId(), isTrue: true, roundNumber: 1, createdAt: nowIso() })),
      ...fullCase.clues.round2.map(c => ({ ...c, id: generateId(), isTrue: true, roundNumber: 2, createdAt: nowIso() })),
      ...fullCase.clues.round3.map(c => ({ ...c, id: generateId(), isTrue: true, roundNumber: 3, createdAt: nowIso() })),
      ...fullCase.clues.round4.map(c => ({ ...c, id: generateId(), isTrue: true, roundNumber: 4, createdAt: nowIso() }))
    ];

    game.state = GameStates.READY;
    game.updatedAt = nowIso();
    this.store.save(game);

    return game;
  }

  public async startPlaying(gameId: string): Promise<Game> {
    const game = this.getGameOrThrow(gameId);
    this.validateGameStateTransition(game.state, GameStates.PLAYING);

    game.state = GameStates.PLAYING;
    game.updatedAt = nowIso();

    this.recordTimelineEvent(game, {
      type: 'STATE_CHANGE',
      description: 'La investigació ha començat oficialment.'
    });

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

    const response = await this.aiService.respondToQuestion(
      JSON.stringify(this.getPublicState(game.id, player.id)),
      input.question
    );

    game.turns.push({
      id: generateId(),
      playerId: player.id,
      question: input.question,
      answer: response,
      createdAt: nowIso()
    });

    player.askedThisRound = true;

    const timestamp = Date.now();
    game.questionHistory.push({
      playerId: player.id,
      playerName: player.nickname,
      question: input.question,
      timestamp,
      roundNumber: game.roundNumber
    });

    // Record in chat history
    game.chatHistory.push({
      type: 'player',
      playerId: player.id,
      playerName: player.nickname,
      message: input.question,
      timestamp
    });

    game.chatHistory.push({
      type: 'narrator',
      playerName: 'Narrador 🕵️',
      message: response,
      timestamp: Date.now()
    });

    this.recordTimelineEvent(game, {
      type: 'QUESTION',
      playerId: player.id,
      text: input.question,
      description: `${player.nickname} ha fet una pregunta.`
    });

    await this.nextTurn(game);
    this.store.save(game);
    return { response, game };
  }

  public async handleAccusation(gameId: string, input: AccusationInput): Promise<Game> {
    const game = this.getGameOrThrow(gameId);
    const player = this.getPlayerOrThrow(game, input.playerId);
    this.assertActivePlayer(player);

    if (player.hasAccused && player.accusationCooldown > 0) {
      throw new HttpError(409, `Has d'esperar ${player.accusationCooldown} rondes per tornar a acusar`);
    }

    const accusedPlayer = this.getPlayerOrThrow(game, input.accusedPlayerId);
    const accusedCharacter = game.characters.find(c => c.id === accusedPlayer.characterId);

    const isCorrect =
      accusedCharacter?.id === game.assassinCharacterId &&
      input.weapon.toLowerCase().includes(game.murder?.weapon.toLowerCase() || '') &&
      input.location.toLowerCase().includes(game.murder?.location.toLowerCase() || '');

    player.hasAccused = true;
    player.accusedThisRound = true;

    this.recordTimelineEvent(game, {
      type: 'ACCUSATION',
      playerId: player.id,
      targetCharacterId: accusedCharacter?.id,
      success: isCorrect,
      description: `${player.nickname} ha acusat a ${accusedCharacter?.name || 'algú'}.`
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
        const isAssassin = character?.id === game.assassinCharacterId;

        const publicCharacter: PublicCharacterView | undefined = character ? {
          id: character.id,
          name: character.name,
          profession: character.profession,
          description: character.description,
          personality: character.personality,
          possibleMotive: character.possibleMotive,
          secret: canSeePrivateInfo ? character.secret : '???',
          secretKnowledge: canSeePrivateInfo ? character.secretKnowledge : '???',
          coartada: character.coartada,
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
          accusationCooldown: player.accusationCooldown,
          isAssassin: canSeePrivateInfo ? isAssassin : false
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

  public getCluesForRound(gameId: string, roundNumber: number): AIServiceClue[] {
    const game = this.getGameOrThrow(gameId);
    return game.clues
      .filter(c => c.roundNumber === roundNumber)
      .map(c => ({
        type: c.type,
        text: c.text
      }));
  }

  public getPlayerSecret(gameId: string, playerId: string): string {
    const game = this.getGameOrThrow(gameId);
    const player = this.getPlayerOrThrow(game, playerId);
    const character = game.characters.find(c => c.id === player.characterId);
    if (!character) {
      throw new HttpError(404, 'Personatge no trobat per a aquest jugador');
    }
    return character.secretKnowledge;
  }

  public logTimelineEvent(gameId: string, type: TimelineEvent['type'], description: string): void {
    const game = this.getGameOrThrow(gameId);
    this.recordTimelineEvent(game, {
      type,
      description
    });
    this.store.save(game);
  }

  public recordChatMessage(gameId: string, message: ChatMessage): void {
    const game = this.getGameOrThrow(gameId);
    game.chatHistory.push(message);
    this.store.save(game);
  }

  public getChatHistory(gameId: string): ChatMessage[] {
    const game = this.getGameOrThrow(gameId);
    return game.chatHistory;
  }

  public getQuestionHistory(gameId: string): Question[] {
    const game = this.getGameOrThrow(gameId);
    return [...game.questionHistory].sort((a, b) => b.timestamp - a.timestamp);
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
    game.chatHistory = [];
    game.questionHistory = [];
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

      const msg = `Comença la ronda ${game.roundNumber}.`;
      console.log("Starting round:", game.roundNumber);
      this.recordTimelineEvent(game, {
        type: 'ROUND_START',
        roundNumber: game.roundNumber,
        description: `Ronda ${game.roundNumber} iniciada`
      });

      if (this.onSystemEvent) {
        this.onSystemEvent(game.id, msg);
      }

      // Reveal clues for the new round
      const cluesMapping: Record<number, string> = {
        2: 'testimonis',
        3: 'evidències físiques',
        4: 'contradiccions'
      };
      const theme = cluesMapping[game.roundNumber];
      if (theme) {
        const clueMsg = `S'ha revelat una nova pista (${theme}).`;
        this.recordTimelineEvent(game, {
          type: 'CLUE_ROUND_REVEALED',
          roundNumber: game.roundNumber,
          description: `S'han revelat els ${theme} de la Ronda ${game.roundNumber}.`
        });
        if (this.onSystemEvent) {
           this.onSystemEvent(game.id, clueMsg);
        }
      }

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
