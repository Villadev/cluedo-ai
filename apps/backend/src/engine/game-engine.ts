import { WEAPONS, LOCATIONS } from '../config/game-options.js';
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
  PublicPlayerView,
  PublicClueView,
  AIServiceClue,
  FullCase,
  ChatMessage,
  Question,
  GameState,
  Difficulty
} from '../types/game.types.js';
import { GameStates } from '../types/game.types.js';
import { HttpError } from '../utils/http-error.js';
import { generateId, nowIso } from '../utils/id.js';

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
      nextSequenceId: 1,
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
      difficulty: 'hard',
      tensionLevel: 0,
      winnerPlayerId: null,
      winnerType: null,
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
      isReady: false,
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
      description: `El jugador ${nickname} s'ha unit a la partida.`
    });

    game.updatedAt = nowIso();
    this.store.save(game);
    return game;
  }

  public async startGame(gameId: string): Promise<Game> {
    const game = this.getGameOrThrow(gameId);
    this.validateGameStateTransition(game.state, GameStates.GENERATING);

    if (game.players.length < 2) {
      throw new HttpError(400, 'Es necessiten almenys 2 jugadors per començar');
    }

    // Transition to GENERATING state
    game.state = GameStates.GENERATING;
    game.updatedAt = nowIso();
    this.store.save(game);
    this.emitStateChange(gameId, game.state);

    console.log("[GAME STATE] LOBBY → GENERATING (Generant cas...)");

    try {
      const requestedSuspectsCount = Math.max(game.players.length, MIN_SUSPECTS);
      const fullCase = await this.aiService.generateFullCase(requestedSuspectsCount, game.difficulty);

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
        finalNarrative: fullCase.solutionNarrative,
        assassinId: ''
      };

      game.characters = fullCase.characters.map((c) => ({
        ...c,
        id: generateId(),
        isAssassin: c.name === fullCase.assassin
      }));

      // Store clues by round
      if (fullCase.clues) {
        const clueEntries = Object.entries(fullCase.clues);
        for (const [roundKey, roundClues] of clueEntries) {
          const roundNumber = parseInt(roundKey.replace("round", ""), 10);
          if (!isNaN(roundNumber)) {
            roundClues.forEach((clue: any) => {
              game.clues.push({
                id: generateId(),
                type: clue.type,
                text: clue.text,
                isTrue: clue.isTrue,
                roundNumber,
                createdAt: nowIso()
              });
            });
          }
        }
      }


      const assassinCharacter = game.characters.find(c => c.isAssassin);
      if (assassinCharacter) {
         game.assassinCharacterId = assassinCharacter.id;
      }

      const shuffledCharacters = this.shuffle(game.characters);

      // Assign characters to real players first
      game.players.forEach((player, index) => {
        const character = shuffledCharacters[index];
        if (character) {
          player.characterId = character.id;
          if (character.id === game.assassinCharacterId) {
            game.murder!.killerPlayerId = player.id;
            game.solution!.assassinId = player.id;
          }
        }
      });

      // Create NPC players for remaining characters
      if (shuffledCharacters.length > game.players.length) {
        for (let i = game.players.length; i < shuffledCharacters.length; i++) {
          const character = shuffledCharacters[i];
          if (character) {
            const npcPlayer: Player = {
              id: generateId(),
              nickname: character.name,
              characterId: character.id,
              isReady: true,
              isEliminated: false,
              hasAccused: false,
              askedThisRound: false,
              accusedThisRound: false,
              accusationCooldown: 0,
              type: 'npc'
            };
            game.players.push(npcPlayer);
          }
        }
      }

      // Final Transition to PLAYER_INFO state
      game.state = GameStates.PLAYER_INFO;
      game.updatedAt = nowIso();
      this.store.save(game);
      this.emitStateChange(gameId, game.state);

      console.log("[GAME STATE] GENERATING → PLAYER_INFO (Cas generat)");

      this.recordTimelineEvent(game, {
        type: 'STATE_CHANGE',
        description: 'Cas generat correctament. La partida està a punt per començar.'
      });

      return game;
    } catch (error: any) {
      console.error("[GENERATION ERROR]", error);
      game.state = GameStates.LOBBY;
      this.store.save(game);
      this.emitStateChange(gameId, game.state);
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

    console.log("[GAME STATE] PLAYER_INFO → PLAYING (Investigació en curs)");

    this.recordTimelineEvent(game, {
      type: 'STATE_CHANGE',
      description: 'Investigació iniciada. Comença la ronda 1.'
    });

    // Automatically reveal clues for round 1
    await this.revealCluesForRound(game, 1);

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
      assassinId: (game.state === 'FINISHED' || (requesterPlayerId && game.players.find(p => p.id === requesterPlayerId)?.characterId === game.assassinCharacterId)) ? (game.players.find(p => p.characterId === game.assassinCharacterId)?.id) : undefined
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
    this.assertActivePlayer(player);

    if (player.askedThisRound || player.accusedThisRound) {
      throw new HttpError(409, 'Ja has realitzat la teva acció en aquesta ronda');
    }

    const response = await this.aiService.respondToQuestion(
      JSON.stringify(this.getPublicState(game.id, player.id)),
      input.question,
      game.difficulty
    );
    console.log("NARRATOR RESULT:", response);

    const question: Question = {
      playerId: player.id,
      playerName: player.nickname,
      question: input.question,
      timestamp: Date.now(),
      roundNumber: game.roundNumber,
      sequenceId: game.nextSequenceId++
    };

    game.questionHistory.push(question);
    game.chatHistory.push({
      type: 'player',
      playerId: player.id,
      playerName: player.nickname,
      roundNumber: game.roundNumber,
      sequenceId: question.sequenceId,
      message: input.question,
      timestamp: question.timestamp
    });

    game.chatHistory.push({
      type: 'narrator',
      playerName: 'Narrador 🕵️',
      roundNumber: game.roundNumber,
      sequenceId: game.nextSequenceId++,
      message: response,
      timestamp: Date.now()
    });

    player.askedThisRound = true;
    game.updatedAt = nowIso();
    this.store.save(game);

    this.recordTimelineEvent(game, {
      type: 'QUESTION',
      playerId: player.id,
      description: `El jugador ${player.nickname} ha preguntat: ${input.question}`
    });

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

    game.updatedAt = nowIso();
    this.store.save(game);
    if (isCorrect) {
      this.emitStateChange(gameId, game.state);
    }
    return game;
  }

  public getIntro(gameId: string): string {
    const game = this.getGameOrThrow(gameId);
    if (!game.introNarrative) {
      throw new HttpError(404, 'La introducció encara no s\'ha generat');
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
        text: c.text,
        isTrue: c.isTrue
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

  public recordChatMessage(gameId: string, message: ChatMessage, sequenceId?: number): void {
    const game = this.getGameOrThrow(gameId);
    if (sequenceId) {
      message.sequenceId = sequenceId;
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
        this.store.save(game);
        this.emitStateChange(gameId, game.state);
        return;
      }

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
    if (roundClues.length === 0) return;

    console.log(`Revealing ${roundClues.length} clues for round ${roundNumber}`);

    const publicStateStr = JSON.stringify(this.getPublicState(game.id));

    for (const clue of roundClues) {
      try {
        const narrative = await this.aiService.generateClueNarration(publicStateStr, clue.text, game.difficulty);

        if (this.onSystemEvent) {
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
          this.onSystemEvent(game.id, clue.text, 'clue', game.roundNumber, game.nextSequenceId++);
        }
      }
    }
  }

  public updateDifficulty(gameId: string, difficulty: Difficulty): Game {
    const game = this.getGameOrThrow(gameId);
    if (game.state === 'FINISHED') {
       throw new HttpError(400, 'No es pot canviar la dificultat d\'una partida finalitzada');
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
      winnerType: game.winnerType
    };
  }
}
