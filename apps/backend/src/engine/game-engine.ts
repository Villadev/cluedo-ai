import { AIService } from '../services/AIService.js';
import { GameStoreService } from '../services/game-store.service.js';
import { CaseOrchestratorService } from '../services/case-orchestrator.service.js';
import {
  Game,
  GameState,
  GameStates,
  Player,
  Character,
  ChatMessage,
  Clue,
  ClueType,
  Turn,
  Question,
  AskQuestionInput,
  AccusationInput,
  PublicGameView,
  PublicPlayerView,
  PublicClueView,
  TimelineEvent,
  Difficulty,
  WinnerType,
  GameSolution,
  AIServiceClue,
  GameResult,
  GenerationPhases
} from '../types/game.types.js';
import { generateId, nowIso } from '../utils/id.js';
import { HttpError } from '../utils/http-error.js';
import { errorLogger } from '../utils/error-logger.js';
import { WEAPONS, LOCATIONS } from '../config/game-options.js';

const MAX_PLAYERS = 17;
const MIN_SUSPECTS = 4;

export class GameEngine {
  private onSystemEvent?: (gameId: string, message: string, type?: ChatMessage['type'], roundNumber?: number, sequenceId?: number) => void;
  private onGameStateChange?: (gameId: string, state: GameState) => void;
  private orchestrator: CaseOrchestratorService;

  constructor(
    private readonly store: GameStoreService,
    private readonly aiService: AIService
  ) {
    this.orchestrator = new CaseOrchestratorService(aiService, store);
  }

  public setSystemEventListener(listener: (gameId: string, message: string, type?: ChatMessage['type'], roundNumber?: number, sequenceId?: number) => void): void {
    this.onSystemEvent = listener;
  }

  public setGameStateChangeListener(listener: (gameId: string, state: GameState) => void): void {
    this.onGameStateChange = listener;
  }

  private emitStateChange(gameId: string, state: GameState): void {
    if (this.onGameStateChange) {
      this.onGameStateChange(gameId, state);
    }
  }

  public createGame(maxRounds: number = 5): Game {
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
      maxRounds,
      tensionLevel: 0,
      difficulty: 'hard',
      winnerPlayerId: null,
      winnerType: null,
      timeline: [],
      chatHistory: [],
      questionHistory: [],
      nextSequenceId: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      generationPhase: GenerationPhases.IDLE
    };

    this.store.save(game);
    return game;
  }

  public async addPlayer(gameId: string, nickname: string): Promise<Game> {
    const game = this.getGameOrThrow(gameId);
    if (game.state === GameStates.GENERATING) {
      throw new Error("No es poden afegir jugadors mentre s'està generant el cas.");
    }
    if (game.state !== GameStates.LOBBY) {
      throw new Error("La partida no està en fase de registre.");
    }

    if (game.players.length >= MAX_PLAYERS) {
      throw new Error("S'ha assolit el límit de jugadors.");
    }

    const player: Player = {
      id: generateId(),
      nickname,
      characterId: null,
      isReady: false,
      isEliminated: false,
      hasAccused: false,
      askedThisRound: false,
      accusedThisRound: false,
      accusationCooldown: 0,
      type: "real"
    };

    game.players.push(player);
    game.updatedAt = nowIso();
    this.store.save(game);

    this.recordTimelineEvent(game, {
      type: 'PLAYER_JOIN',
      playerId: player.id,
      description: `Jugador afegit: ${nickname}`
    });

    return game;
  }

  public async startGame(gameId: string): Promise<Game> {
    const game = this.getGameOrThrow(gameId);

    if (game.state !== GameStates.LOBBY) {
      throw new Error("La partida ja ha començat.");
    }

    if (game.players.length < 2) {
      throw new Error("Es necessiten almenys 2 jugadors reals.");
    }

    if (game.players.length < MIN_SUSPECTS) {
      const npcCount = MIN_SUSPECTS - game.players.length;
      for (let i = 0; i < npcCount; i++) {
        const npc: Player = {
          id: generateId(),
          nickname: `Sospitós ${i + 1}`,
          characterId: null,
          isReady: true,
          isEliminated: false,
          hasAccused: false,
          askedThisRound: false,
          accusedThisRound: false,
          accusationCooldown: 0,
          type: "npc"
        };
        game.players.push(npc);
      }
    }

    game.state = GameStates.GENERATING;
    game.generationPhase = GenerationPhases.SKELETON;
    game.generationStepStartedAt = Date.now();
    game.generationAttempts = 1;
    game.generationError = undefined;
    this.emitStateChange(gameId, game.state);
    this.store.save(game);

    // Generation is async
    this.orchestrator.generateCase(gameId).catch(err => {
        console.error("[GAME ENGINE] Async generation error:", err);
    });

    return game;
  }

  public async playGame(gameId: string): Promise<Game> {
    const game = this.getGameOrThrow(gameId);
    if (game.state !== GameStates.PLAYER_INFO) {
      throw new Error("La partida no està en fase de revelació de personatges.");
    }

    game.state = GameStates.PLAYING;
    game.roundNumber = 1;
    game.updatedAt = nowIso();

    const firstRealPlayerIndex = game.players.findIndex(p => p.type === 'real');
    game.currentTurnIndex = firstRealPlayerIndex >= 0 ? firstRealPlayerIndex : 0;

    this.recordTimelineEvent(game, {
      type: 'STATE_CHANGE',
      description: "L'investigació ha començat."
    });

    // Save game state BEFORE revealing clues to avoid overwriting async clue persistence
    this.store.save(game);

    this.emitStateChange(game.id, game.state);

    // Reveal Round 1 clues when playing actually starts
    await this.revealCluesForRound(game, 1);

    return game;
  }

  public getGame(gameId: string, playerId?: string): PublicGameView {
    const game = this.getGameOrThrow(gameId);
    return this.getPublicState(gameId, playerId);
  }

  public getPublicState(gameId: string, playerId?: string): PublicGameView {
    const game = this.getGameOrThrow(gameId);
    const player = playerId ? game.players.find(p => p.id === playerId) : undefined;

    return {
      id: game.id,
      state: game.state,
      players: game.players.map(p => ({
        id: p.id,
        nickname: p.nickname,
        character: p.id === playerId || game.state === GameStates.FINISHED
          ? game.characters.find(c => c.id === p.characterId)
          : undefined,
        isReady: p.isReady,
        isEliminated: p.isEliminated,
        hasAccused: p.hasAccused,
        askedThisRound: p.askedThisRound,
        accusedThisRound: p.accusedThisRound,
        accusationCooldown: p.accusationCooldown,
        isAssassin: p.characterId === game.assassinCharacterId,
        type: p.type
      })),
      clues: game.clues
        .filter(c => c.roundNumber <= game.roundNumber)
        .map(c => ({
          id: c.id,
          text: c.text,
          type: c.type,
          roundNumber: c.roundNumber,
          createdAt: c.createdAt
        })),
      currentTurnPlayerId: game.players[game.currentTurnIndex]?.id || null,
      roundNumber: game.roundNumber,
      maxRounds: game.maxRounds,
      tensionLevel: game.tensionLevel,
      difficulty: game.difficulty,
      winnerPlayerId: game.winnerPlayerId,
      winnerType: game.winnerType,
      createdAt: game.createdAt,
      updatedAt: game.updatedAt,
      nextSequenceId: game.nextSequenceId,
      generationPhase: game.generationPhase,
      generationStepStartedAt: game.generationStepStartedAt,
      generationAttempts: game.generationAttempts,
      generationError: game.generationError
    };
  }

  public getChatHistory(gameId: string): ChatMessage[] {
    const game = this.getGameOrThrow(gameId);
    return game.chatHistory;
  }

  public recordChatMessage(gameId: string, message: ChatMessage): void {
    const game = this.getGameOrThrow(gameId);

    // Check for duplicates
    if (message.sequenceId !== undefined) {
        const exists = game.chatHistory.some(m => m.sequenceId === message.sequenceId && m.type === message.type);
        if (exists) return;
    }

    this.store.appendChatMessage(gameId, message);
  }

  public async askQuestion(gameId: string, input: AskQuestionInput): Promise<{ game: Game, response: string }> {
    const game = this.getGameOrThrow(gameId);
    const player = this.getPlayerOrThrow(game, input.playerId);

    if (game.state !== GameStates.PLAYING) {
      throw new Error('La partida no està en curs');
    }



    this.assertActivePlayer(player);

    if (player.askedThisRound) {
      throw new Error('Ja has fet una pregunta en aquesta ronda');
    }

    const character = game.characters.find(c => c.id === player.characterId);
    const publicStateStr = JSON.stringify(this.getPublicState(game.id, player.id));

    const aiResult = await this.aiService.respondToQuestion(publicStateStr, input.question, game.difficulty);

    const questionMsg: ChatMessage = {
      type: 'player',
      playerId: player.id,
      playerName: player.nickname,
      message: input.question,
      timestamp: Date.now(),
      roundNumber: game.roundNumber,
      sequenceId: game.nextSequenceId++
    };
    game.chatHistory.push(questionMsg);

    const narratorMsg: ChatMessage = {
      type: 'narrator',
      playerName: 'Narrador 🕵️‍♂️',
      message: aiResult.response,
      timestamp: Date.now(),
      roundNumber: game.roundNumber,
      sequenceId: game.nextSequenceId++
    };
    game.chatHistory.push(narratorMsg);

    player.askedThisRound = true;
    game.updatedAt = nowIso();
    this.store.save(game);

    return { game, response: aiResult.response };
  }

  public async makeAccusation(gameId: string, input: AccusationInput): Promise<{ game: Game, success: boolean }> {
    const game = this.getGameOrThrow(gameId);
    const player = this.getPlayerOrThrow(game, input.playerId);

    if (game.state !== GameStates.PLAYING) {
      throw new Error('La partida no està en curs');
    }



    this.assertActivePlayer(player);

    if (player.accusedThisRound) {
      throw new Error('Ja has fet una acusació en aquesta ronda');
    }

    if (player.accusationCooldown > 0) {
      throw new Error(`Has d'esperar ${player.accusationCooldown} rondes per tornar a acusar`);
    }

    const isCorrect =
      input.accusedPlayerId === game.murder?.killerPlayerId &&
      input.weapon.toLowerCase() === game.murder?.weapon.toLowerCase() &&
      input.location.toLowerCase() === game.murder?.location.toLowerCase();

    if (isCorrect) {
      game.state = GameStates.FINISHED;
      game.winnerPlayerId = player.id;
      game.winnerType = 'INVESTIGATORS';

      const msg = `¡Felicitats! En ${player.nickname} ha resolt el cas. L'assassí era ${game.solution?.assassin}.`;
      this.recordTimelineEvent(game, {
        type: 'GAME_END',
        playerId: player.id,
        description: msg
      });

      if (this.onSystemEvent) {
        this.onSystemEvent(game.id, msg, undefined, game.roundNumber, game.nextSequenceId++);
      }
      this.emitStateChange(game.id, game.state);
    } else {
      player.accusationCooldown = 2;
      player.accusedThisRound = true;

      const msg = `L'acusació d'en ${player.nickname} ha estat incorrecta. Haurà d'esperar 2 rondes.`;
      this.recordTimelineEvent(game, {
        type: 'ACCUSATION',
        playerId: player.id,
        success: false,
        description: msg
      });

      if (this.onSystemEvent) {
        this.onSystemEvent(game.id, msg, undefined, game.roundNumber, game.nextSequenceId++);
      }
    }

    game.updatedAt = nowIso();
    this.store.save(game);

    await this.nextTurn(gameId);

    return { game, success: isCorrect };
  }

  public removePlayer(gameId: string, playerId: string): Game {
    const game = this.getGameOrThrow(gameId);
    game.players = game.players.filter(p => p.id !== playerId);
    game.updatedAt = nowIso();
    this.store.save(game);
    return game;
  }

  public async nextTurn(gameId: string): Promise<void> {
    const game = this.getGameOrThrow(gameId);
    if (game.state === GameStates.FINISHED) return;

    const realPlayers = game.players.filter(p => p.type === 'real');
    const allPlayersActed = realPlayers.every((p) => p.askedThisRound || p.accusedThisRound || p.isEliminated);

    if (allPlayersActed) {
      await this.advanceRound(game);
      this.store.save(game);
    } else {
      let nextIndex = game.currentTurnIndex;
      let count = 0;
      do {
        nextIndex = (nextIndex + 1) % game.players.length;
        count++;
      } while (
        (game.players[nextIndex]?.type === 'npc' ||
        game.players[nextIndex]?.isEliminated ||
        game.players[nextIndex]?.askedThisRound ||
        game.players[nextIndex]?.accusedThisRound) &&
        count < game.players.length
      );
      game.currentTurnIndex = nextIndex;
    }

    game.updatedAt = nowIso();
    this.store.save(game);
  }

  private async revealCluesForRound(game: Game, roundNumber: number): Promise<void> {
    const roundClues = game.clues.filter(c => c.roundNumber === roundNumber);
    if (roundClues.length === 0) {
      console.log(`[ROUND START] No clues found to reveal for round ${roundNumber}`);
      return;
    }

    console.log(`Revealing ${roundClues.length} clues for round ${roundNumber}`);

    const publicStateStr = JSON.stringify(this.getPublicState(game.id));

    for (const clue of roundClues) {
      try {
        const narrative = await this.aiService.generateClueNarration(publicStateStr, clue.text, game.difficulty);
        console.log(`[CLUE GENERATED]`, narrative);

        if (this.onSystemEvent) {
          console.log(`[CLUE ENQUEUED]`);
          this.onSystemEvent(game.id, narrative, 'clue', game.roundNumber, game.nextSequenceId++);
        }

        const safeText = clue.text || 'Pista no disponible temporalment';
        this.recordTimelineEvent(game, {
          type: 'CLUE',
          roundNumber: clue.roundNumber,
          text: safeText,
          isTrue: clue.isTrue,
          description: `Pista revelada: ${safeText}`
        });
      } catch (error) {
        console.error("Error generating clue narration:", error);
        if (this.onSystemEvent) {
          const fallbackText = clue.text || 'Pista no disponible temporalment';
          console.log(`[CLUE GENERATED] (fallback)`, fallbackText);
          console.log(`[CLUE ENQUEUED]`);
          this.onSystemEvent(game.id, fallbackText, 'clue', game.roundNumber, game.nextSequenceId++);
        }
      }
    }
  }

  public updateDifficulty(gameId: string, difficulty: Difficulty): Game {
    const game = this.getGameOrThrow(gameId);
    if (game.state !== 'LOBBY') {
       throw new Error("Només es pot canviar la dificultat a la sala d'espera");
    }

    game.difficulty = difficulty;
    game.updatedAt = nowIso();

    this.recordTimelineEvent(game, {
      type: 'DIFFICULTY_CHANGED',
      description: `S'ha canviat la dificultat a: ${difficulty}`
    });

    this.store.save(game);
    return game;
  }

  public getOptions(gameId: string): { weapons: string[], locations: string[] } {
    return {
      weapons: WEAPONS,
      locations: LOCATIONS
    };
  }

  public getParticipants(gameId: string): PublicPlayerView[] {
    const game = this.getGameOrThrow(gameId);
    return game.players.map(p => ({
      id: p.id,
      nickname: p.nickname,
      character: game.characters.find(c => c.id === p.characterId),
      isReady: p.isReady,
      isEliminated: p.isEliminated,
      hasAccused: p.hasAccused,
      askedThisRound: p.askedThisRound,
      accusedThisRound: p.accusedThisRound,
      accusationCooldown: p.accusationCooldown,
      isAssassin: p.characterId === game.assassinCharacterId,
      type: p.type
    }));
  }

  public getInstructions(): string {
    return this.aiService.getInstructionsContext();
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
      throw new Error('Partida no trobada');
    }
    if (game.maxRounds === undefined) {
      game.maxRounds = 5;
    }
    if (game.winnerType === undefined) {
      game.winnerType = null;
    }
    if (game.difficulty === undefined) {
      game.difficulty = 'hard';
    }
    return game;
  }

  private getPlayerOrThrow(game: Game, playerId: string): Player {
    const player = game.players.find((entry) => entry.id === playerId);
    if (!player) {
      throw new Error('Jugador no trobat');
    }
    return player;
  }

  private getCurrentTurnPlayer(game: Game): Player | undefined {
    return game.players[game.currentTurnIndex];
  }

  private assertActivePlayer(player: Player): void {
    if (player.isEliminated) {
      throw new Error('Un jugador eliminat no pot actuar');
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
      nextSequenceId: game.nextSequenceId,
      state: game.state,
      generationPhase: game.generationPhase,
      generationError: game.generationError,
      generationAttempts: game.generationAttempts,
      errors: errorLogger.getLogs()
    };
  }

  public getTimeline(gameId: string): TimelineEvent[] {
    const game = this.getGameOrThrow(gameId);
    return [...game.timeline].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  private validateGameStateTransition(currentState: string, nextState: string): void {
    const allowedTransitions: Record<string, string[]> = {
      [GameStates.LOBBY]: [GameStates.PLAYER_INFO, GameStates.LOBBY, GameStates.GENERATING],
      [GameStates.GENERATING]: [GameStates.PLAYER_INFO, GameStates.LOBBY],
      [GameStates.PLAYER_INFO]: [GameStates.PLAYING, GameStates.LOBBY],
      [GameStates.PLAYING]: [GameStates.FINISHED, GameStates.LOBBY],
      [GameStates.FINISHED]: [GameStates.LOBBY]
    };
  }

  private recordTimelineEvent(game: Game, event: Omit<TimelineEvent, 'timestamp'>): void {
    game.timeline.push({
      ...event,
      timestamp: nowIso()
    });
  }

  private getGameResult(game: Game): GameResult | undefined {
    if (!game.solution) {
      return undefined;
    }

    return {
      winner: game.winnerType || 'ASSASSIN', // Fallback for debug view
      killer: game.solution.assassin,
      weapon: game.solution.weapon,
      location: game.solution.location,
      finalNarrative: game.solution.finalNarrative
    };
  }

  public async forceNextRound(gameId: string): Promise<Game> {
    const game = this.getGameOrThrow(gameId);
    if (game.state !== GameStates.PLAYING) {
      throw new Error('Només es pot forçar la ronda si la partida està en curs');
    }
    await this.advanceRound(game);
    this.store.save(game);
    return game;
  }

  private async advanceRound(game: Game): Promise<void> {
    if (game.roundNumber >= game.maxRounds) {
      game.state = GameStates.FINISHED;
      game.winnerType = 'ASSASSIN';
      game.updatedAt = nowIso();

      const msg = "El temps s'ha acabat. L'assassí ha aconseguit escapar.";
      this.recordTimelineEvent(game, {
        type: 'GAME_END',
        description: msg
      });

      if (this.onSystemEvent) {
        this.onSystemEvent(game.id, msg, undefined, game.roundNumber, game.nextSequenceId++);
      }
      this.emitStateChange(game.id, game.state);
      return;
    }

    game.roundNumber += 1;
    game.tensionLevel = Math.min(100, game.tensionLevel + 10);

    const msg = `Comença la ronda ${game.roundNumber}.`;
    console.log("[ROUND START DETECTED]", game.roundNumber);
    this.recordTimelineEvent(game, {
      type: 'ROUND_START',
      roundNumber: game.roundNumber,
      description: `Ronda ${game.roundNumber} iniciada`
    });

    if (this.onSystemEvent) {
      this.onSystemEvent(game.id, msg, undefined, game.roundNumber, game.nextSequenceId++);
    }

    // Save game state BEFORE revealing clues to avoid overwriting async clue persistence
    this.store.save(game);

    await this.revealCluesForRound(game, game.roundNumber);

    game.players.forEach((p) => {
      p.askedThisRound = false;
      p.accusedThisRound = false;
      if (p.accusationCooldown > 0) {
        p.accusationCooldown -= 1;
      }
    });

    const firstRealPlayerIndex = game.players.findIndex(p => p.type === 'real');
    game.currentTurnIndex = firstRealPlayerIndex >= 0 ? firstRealPlayerIndex : 0;
    game.updatedAt = nowIso();
    this.store.save(game);
  }

  public getGameStateInfo(gameId: string): any {
    const game = this.getGameOrThrow(gameId);
    return {
      gameId: game.id,
      state: game.state,
      status: game.state,
      playersCount: game.players.length,
      charactersCount: game.characters.length,
      roundNumber: game.roundNumber,
      nextSequenceId: game.nextSequenceId,
      maxRounds: game.maxRounds,
      difficulty: game.difficulty,
      winnerType: game.winnerType,
      result: this.getGameResult(game),
      generationPhase: game.generationPhase,
      generationError: game.generationError,
      playerStatus: game.players.filter(p => p.type === 'real').map(p => ({
        nickname: p.nickname,
        askedThisRound: p.askedThisRound
      }))
    };
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
        text: c.text,
        isTrue: c.isTrue
      }));
  }
  public listAllGames(): Game[] { return this.store.list(); }

  public getQuestionHistory(gameId: string): Question[] {
    const game = this.getGameOrThrow(gameId);
    return game.questionHistory;
  }

  public getPlayerSecret(gameId: string, playerId: string): string {
    const game = this.getGameOrThrow(gameId);
    const player = this.getPlayerOrThrow(game, playerId);
    const character = game.characters.find(c => c.id === player.characterId);
    if (!character) {
      throw new Error('Personatge no trobat');
    }
    return character.secret;
  }

  public getIntro(gameId: string): string | null {
    const game = this.getGameOrThrow(gameId);
    return game.introNarrative;
  }

  public logTimelineEvent(gameId: string, type: string, description: string): void {
    const game = this.getGameOrThrow(gameId);
    this.recordTimelineEvent(game, {
      type: type as any,
      description
    });
    this.store.save(game);
  }

  public deleteAllGames(): void {
    this.store.clear();
  }

  public resetGame(gameId: string): Game {
    const game = this.getGameOrThrow(gameId);
    game.state = GameStates.LOBBY;
    game.players = [];
    game.characters = [];
    game.clues = [];
    game.turns = [];
    game.chatHistory = [];
    game.questionHistory = [];
    game.timeline = [];
    game.murder = null;
    game.introNarrative = null;
    game.solution = null;
    game.winnerPlayerId = null;
    game.winnerType = null;
    game.roundNumber = 1;
    game.currentTurnIndex = 0;
    game.tensionLevel = 0;
    game.nextSequenceId = 1;
    game.updatedAt = nowIso();
    game.generationPhase = GenerationPhases.IDLE;
    game.generationError = undefined;

    this.store.save(game);
    this.emitStateChange(gameId, game.state);
    return game;
  }

  public deletePlayer(gameId: string, playerId: string): Game {
    return this.removePlayer(gameId, playerId);
  }
}
