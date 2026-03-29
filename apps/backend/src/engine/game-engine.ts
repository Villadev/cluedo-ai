import { AIService } from '../services/AIService.js';
import { GameStoreService } from '../services/game-store.service.js';
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
  FullCase
} from '../types/game.types.js';
import { generateId } from '../utils/id.js';
import { HttpError } from '../utils/http-error.js';
import { errorLogger } from '../utils/error-logger.js';
import { WEAPONS, LOCATIONS } from '../config/game-options.js';

const nowIso = () => new Date().toISOString();

const MAX_PLAYERS = 17;
const MIN_SUSPECTS = 4;

export class GameEngine {
  private onSystemEvent?: (gameId: string, message: string, type?: ChatMessage['type'], roundNumber?: number, sequenceId?: number) => void;
  private onGameStateChange?: (gameId: string, state: GameState) => void;

  constructor(
    private readonly store: GameStoreService,
    private readonly aiService: AIService
  ) {}

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
      updatedAt: timestamp
    };

    this.store.save(game);
    return game;
  }

  public async addPlayer(gameId: string, nickname: string): Promise<Game> {
    const game = this.getGameOrThrow(gameId);
    if (game.state === GameStates.GENERATING) {
      throw new HttpError(400, "No es poden afegir jugadors mentre s'està generant el cas.");
    }
    if (game.state !== GameStates.LOBBY) {
      throw new HttpError(400, "La partida no està en fase de registre.");
    }

    if (game.players.length >= MAX_PLAYERS) {
      throw new HttpError(400, 'La partida ja està plena');
    }

    if (game.players.some((p) => p.nickname.toLowerCase() === nickname.toLowerCase())) {
      throw new HttpError(400, 'Aquest nom ja està en ús');
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
      accusationCooldown: 0,
      type: 'real'
    };

    game.players.push(player);
    game.updatedAt = nowIso();

    this.recordTimelineEvent(game, {
      type: 'PLAYER_JOIN',
      playerId: player.id,
      description: `${player.nickname} s'ha unit a la partida`
    });

    this.store.save(game);
    return game;
  }

  public async startGame(gameId: string): Promise<Game> {
    const game = this.getGameOrThrow(gameId);
    this.validateGameStateTransition(game.state, GameStates.GENERATING);

    // Ensure minimum number of players with NPCs if needed
    const currentPlayersCount = game.players.length;
    if (currentPlayersCount < MIN_SUSPECTS) {
      const npcsNeeded = MIN_SUSPECTS - currentPlayersCount;
      console.log(`[GAME ENGINE] Adding ${npcsNeeded} NPCs to reach minimum suspect count.`);
      for (let i = 0; i < npcsNeeded; i++) {
        const npc: Player = {
          id: generateId(),
          nickname: `Investigador NPC ${i + 1}`,
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

    const totalExpectedCharacters = game.players.length;

    game.state = GameStates.GENERATING;
    this.emitStateChange(gameId, game.state);
    this.store.save(game);

    try {
      console.log(`[GAME ENGINE] Starting case generation for ${totalExpectedCharacters} players.`);
      const caseData: FullCase = await this.aiService.generateFullCase(totalExpectedCharacters, game.difficulty);

      // Pre-assignment integrity check
      if (!caseData.characters || caseData.characters.length < totalExpectedCharacters) {
         throw new Error(`Dades insuficients de personatges generades: s'esperaven ${totalExpectedCharacters}, s'han rebut ${caseData.characters?.length || 0}.`);
      }

      game.murder = {
        killerPlayerId: '', // Will assign later
        weapon: caseData.weapon,
        location: caseData.location,
        victim: caseData.victim,
        crimeWindow: caseData.crimeWindow
      };

      game.introNarrative = caseData.introductionNarrative;
      game.solution = {
        assassin: caseData.assassin,
        weapon: caseData.weapon,
        location: caseData.location,
        victimName: caseData.victim,
        finalNarrative: caseData.solutionNarrative
      };

      // Assign characters (shuffled for fairness)
      const shuffledCharactersData = this.shuffle(caseData.characters);
      const characters: Character[] = shuffledCharactersData.map((c: any) => ({
        id: generateId(),
        ...c,
        isAssassin: c.name.trim().toLowerCase() === caseData.assassin.trim().toLowerCase()
      }));

      // Map to game state
      game.characters = characters;

      // Assign to players with guaranteed loop safety
      game.players.forEach((p, i) => {
        const character = characters[i];
        if (!character) {
           throw new Error(`Error intern: No s'ha pogut trobar un personatge per al jugador ${p.nickname} (índex ${i}).`);
        }
        p.characterId = character.id;
        if (character.isAssassin) {
          game.assassinCharacterId = character.id;
          game.murder!.killerPlayerId = p.id;
          game.solution!.assassinId = p.id;
        }
      });

      // Verification: double-check NO player is left behind
      const playersWithoutCharacter = game.players.filter(p => !p.characterId);
      if (playersWithoutCharacter.length > 0) {
        const names = playersWithoutCharacter.map(p => p.nickname).join(', ');
        throw new Error(`Error d'assignació crítica: els jugadors següents no tenen personatge: ${names}`);
      }

      // Handle clues
      const allClues: Clue[] = [];
      const rounds: (keyof typeof caseData.clues)[] = ['round1', 'round2', 'round3', 'round4'];
      rounds.forEach((roundKey, index) => {
        const roundNum = index + 1;
        const cluesForRound = (caseData.clues && caseData.clues[roundKey]) || [];
        cluesForRound.forEach((c: AIServiceClue) => {
          allClues.push({
            id: generateId(),
            type: c.type,
            text: c.text,
            isTrue: c.isTrue,
            roundNumber: roundNum,
            createdAt: nowIso()
          });
        });
      });
      game.clues = allClues;

      game.state = GameStates.PLAYER_INFO;
      game.updatedAt = nowIso();
      this.store.save(game);
      this.emitStateChange(gameId, game.state);

      // Reveal first round clues immediately
      await this.revealCluesForRound(game, 1);

      return game;
    } catch (error: any) {
      console.error(`[GAME ENGINE] Fatal start error: ${error.message}`);
      game.state = GameStates.LOBBY;
      this.emitStateChange(gameId, game.state);
      this.store.save(game);
      throw error;
    }
  }

  public async startPlaying(gameId: string): Promise<Game> {
    const game = this.getGameOrThrow(gameId);
    this.validateGameStateTransition(game.state, GameStates.PLAYING);

    game.state = GameStates.PLAYING;
    game.updatedAt = nowIso();
    this.store.save(game);
    this.emitStateChange(gameId, game.state);

    return game;
  }

  public getPublicState(gameId: string, requesterPlayerId?: string): PublicGameView {
    const game = this.getGameOrThrow(gameId);

    const publicPlayers: PublicPlayerView[] = game.players.map((p) => {
      const character = game.characters.find((c) => c.id === p.characterId);
      const isSelf = p.id === requesterPlayerId;
      const isFinished = game.state === GameStates.FINISHED;

      return {
        id: p.id,
        nickname: p.nickname,
        character: character
          ? {
              id: character.id,
              name: character.name,
              profession: character.profession,
              description: character.description,
              personality: character.personality,
              possibleMotive: character.possibleMotive,
              secret: character.secret,
              secretKnowledge: character.secretKnowledge,
              coartada: character.coartada,
              rumor: character.rumor,
              relationships: character.relationships,
              tensions: character.tensions
            }
          : undefined,
        isReady: p.isReady,
        isEliminated: p.isEliminated,
        hasAccused: p.hasAccused,
        askedThisRound: p.askedThisRound,
        accusedThisRound: p.accusedThisRound,
        accusationCooldown: p.accusationCooldown,
        isAssassin: (isSelf || isFinished) ? (p.characterId === game.assassinCharacterId) : false,
        type: p.type
      };
    });

    const publicClues: PublicClueView[] = game.clues
      .filter(c => c.roundNumber <= game.roundNumber)
      .map((c) => ({
        id: c.id,
        playerId: c.playerId,
        type: c.type,
        text: c.text,
        roundNumber: c.roundNumber,
        createdAt: c.createdAt
      }));

    return {
      id: game.id,
      state: game.state,
      players: publicPlayers,
      clues: publicClues,
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
      assassinId: (game.state === 'FINISHED' || (requesterPlayerId && game.players.find(p => p.id === requesterPlayerId)?.characterId === game.assassinCharacterId)) ? (game.players.find(p => p.characterId === game.assassinCharacterId)?.id) : undefined,
      result: this.getGameResult(game)
    };
  }

  public async askQuestion(gameId: string, input: AskQuestionInput): Promise<{ response: string; game: Game }> {
    const game = this.getGameOrThrow(gameId);
    if (game.state !== 'PLAYING') {
      throw new HttpError(409, 'La partida no està en curs');
    }

    const player = this.getPlayerOrThrow(game, input.playerId);
    if (player.type !== 'real') {
       throw new HttpError(403, 'Només els jugadors reals poden fer preguntes');
    }

    if (player.askedThisRound || player.accusedThisRound) {
       throw new HttpError(409, 'Ja has realitzat la teva acció en aquesta ronda');
    }

    const publicStateStr = JSON.stringify(this.getPublicState(game.id, player.id));
    const result = await this.aiService.respondToQuestion(publicStateStr, input.question, game.difficulty);

    player.askedThisRound = true;

    // Record Chat History
    const timestamp = Date.now();

    // 1. Question
    const questionEntry: ChatMessage = {
      type: 'player',
      playerId: player.id,
      playerName: player.nickname,
      message: input.question,
      timestamp,
      roundNumber: game.roundNumber,
      sequenceId: game.nextSequenceId++
    };
    game.chatHistory.push(questionEntry);

    this.recordTimelineEvent(game, {
      type: 'QUESTION',
      playerId: player.id,
      text: input.question,
      description: `${player.nickname} ha preguntat: ${input.question}`
    });

    // 2. Response
    const responseEntry: ChatMessage = {
      type: 'narrator',
      playerName: 'Narrador 🕵️',
      message: result.response,
      timestamp: timestamp + 1,
      roundNumber: game.roundNumber,
      sequenceId: game.nextSequenceId++
    };
    game.chatHistory.push(responseEntry);

    game.updatedAt = nowIso();
    this.store.save(game);

    return {
      response: result.response,
      game
    };
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
       throw new HttpError(403, `Has d'esperar ${player.accusationCooldown} rondes per tornar a acusar`);
    }

    const isCorrect =
      input.accusedPlayerId === game.murder?.killerPlayerId &&
      input.weapon === game.murder?.weapon &&
      input.location === game.murder?.location;

    player.accusedThisRound = true;
    player.hasAccused = true;

    if (isCorrect) {
      game.state = GameStates.FINISHED;
      game.winnerPlayerId = player.id;
      game.winnerType = 'INVESTIGATORS';
      game.updatedAt = nowIso();

      const msg = `L'acusació és CORRECTA! El jugador ${player.nickname} ha resolt el cas.`;
      this.recordTimelineEvent(game, {
        type: 'ACCUSATION',
        playerId: player.id,
        success: true,
        description: msg
      });

      if (this.onSystemEvent) {
        this.onSystemEvent(game.id, msg, undefined, game.roundNumber, game.nextSequenceId++);
      }
    } else {
      player.accusationCooldown = 2; // Penalty rounds
      const accusedNickname = game.players.find(p => p.id === input.accusedPlayerId)?.nickname || 'un desconegut';
      const msg = `L'acusació contra ${accusedNickname} amb ${input.weapon} a ${input.location} és INCORRECTA. ${player.nickname} rep una penalització de 2 rondes.`;

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

    this.emitStateChange(gameId, game.state);
    this.store.save(game);
    return game;
  }

  public getIntro(gameId: string): string | null {
    const game = this.getGameOrThrow(gameId);
    return game.introNarrative;
  }

  public getPlayerSecret(gameId: string, playerId: string): string | null {
    const game = this.getGameOrThrow(gameId);
    const player = this.getPlayerOrThrow(game, playerId);
    const character = game.characters.find(c => c.id === player.characterId);
    return character ? character.secret : null;
  }

  public logTimelineEvent(gameId: string, type: TimelineEvent['type'], description: string): void {
    const game = this.getGameOrThrow(gameId);
    this.recordTimelineEvent(game, { type, description });
    this.store.save(game);
  }

  public recordChatMessage(gameId: string, message: ChatMessage): void {
    const game = this.getGameOrThrow(gameId);

    // Defensive check to avoid duplicate messages in history
    const isDuplicate = game.chatHistory.some(m =>
      m.sequenceId !== undefined &&
      m.sequenceId === message.sequenceId &&
      m.type === message.type
    );

    if (isDuplicate) {
      console.warn(`[DUPLICATE MESSAGE DETECTED] Skipping recordChatMessage for sequenceId ${message.sequenceId}`);
      return;
    }

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
    this.emitStateChange(gameId, game.state);
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
    game.winnerType = null;
    game.timeline = [];
    game.chatHistory = [];
    game.questionHistory = [];
    game.nextSequenceId = 1;
    game.updatedAt = nowIso();
    this.store.save(game);
    this.emitStateChange(gameId, game.state);
    return game;
  }

  public deletePlayer(gameId: string, playerId: string): Game {
    const game = this.getGameOrThrow(gameId);
    game.players = game.players.filter((p) => p.id !== playerId);
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

        this.recordTimelineEvent(game, {
          type: 'CLUE',
          roundNumber: clue.roundNumber,
          text: clue.text,
          isTrue: clue.isTrue,
          description: `Pista revelada: ${clue.text}`
        });
      } catch (error) {
        console.error("Error generating clue narration:", error);
        // Fallback to raw clue text if AI fails
        if (this.onSystemEvent) {
          console.log(`[CLUE GENERATED] (fallback)`, clue.text);
          console.log(`[CLUE ENQUEUED]`);
          this.onSystemEvent(game.id, clue.text, 'clue', game.roundNumber, game.nextSequenceId++);
        }
      }
    }
  }

  public updateDifficulty(gameId: string, difficulty: Difficulty): Game {
    const game = this.getGameOrThrow(gameId);
    if (game.state !== 'LOBBY') {
       throw new HttpError(400, "Només es pot canviar la dificultat a la sala d'espera");
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
      throw new HttpError(404, 'Partida no trobada');
    }
    // Compatibility fix for older games
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
      nextSequenceId: game.nextSequenceId,
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
      [GameStates.LOBBY]: [GameStates.PLAYER_INFO, GameStates.LOBBY, GameStates.GENERATING],
      [GameStates.GENERATING]: [GameStates.PLAYER_INFO, GameStates.LOBBY],
      [GameStates.PLAYER_INFO]: [GameStates.PLAYING, GameStates.LOBBY],
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

  private getGameResult(game: Game): GameResult | undefined {
    if (game.state !== GameStates.FINISHED || !game.solution || !game.winnerType) {
      return undefined;
    }

    return {
      winner: game.winnerType,
      killer: game.solution.assassin,
      weapon: game.solution.weapon,
      location: game.solution.location,
      finalNarrative: game.solution.finalNarrative
    };
  }

  public async forceNextRound(gameId: string): Promise<Game> {
    const game = this.getGameOrThrow(gameId);
    if (game.state !== GameStates.PLAYING) {
      throw new HttpError(409, 'Només es pot forçar la ronda si la partida està en curs');
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

    // Reveal clues for the new round
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
  }

  public getGameStateInfo(gameId: string): any {
    const game = this.getGameOrThrow(gameId);
    return {
      state: game.state,
      playersCount: game.players.length,
      charactersCount: game.characters.length,
      roundNumber: game.roundNumber,
      nextSequenceId: game.nextSequenceId,
      maxRounds: game.maxRounds,
      difficulty: game.difficulty,
      winnerType: game.winnerType,
      result: this.getGameResult(game),
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
}
