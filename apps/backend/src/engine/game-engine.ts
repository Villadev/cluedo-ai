import { AIService } from '../services/ai.service.js';
import { GameStoreService } from '../services/game-store.service.js';
import type { AccusationInput, AskQuestionInput, Clue, Game, Player, PublicGameView } from '../types/game.types.js';
import { HttpError } from '../utils/http-error.js';
import { generateId, nowIso } from '../utils/id.js';

const MAX_PLAYERS = 15;
const MIN_PLAYERS = 2;
const WEAPONS = ['Candlestick', 'Dagger', 'Lead Pipe', 'Revolver', 'Rope', 'Wrench'];
const LOCATIONS = ['Kitchen', 'Ballroom', 'Conservatory', 'Dining Room', 'Lounge', 'Hall', 'Study', 'Library'];
const VICTIMS = ['Lord Blackwood', 'Lady Crimson', 'Judge Hawthorne', 'Dr. Sterling'];

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
      murder: null,
      clues: [],
      turns: [],
      currentTurnIndex: 0,
      roundNumber: 1,
      tensionLevel: 0,
      winnerPlayerId: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    this.store.save(game);
    return game;
  }

  public async addPlayer(gameId: string, playerName: string): Promise<Game> {
    const game = this.getGameOrThrow(gameId);
    if (game.state !== 'LOBBY') {
      throw new HttpError(409, 'Cannot join after game has started');
    }

    if (game.players.length >= MAX_PLAYERS) {
      throw new HttpError(400, `Maximum ${MAX_PLAYERS} players allowed`);
    }

    const player: Player = {
      id: generateId(),
      name: playerName,
      publicCharacter: await this.aiService.generateCharacterProfile({ playerName }),
      secretInfo: '',
      isKiller: false,
      isReady: false,
      isEliminated: false,
      hasAccused: false
    };

    game.players.push(player);
    game.updatedAt = nowIso();
    this.store.save(game);
    return game;
  }

  public async setReady(gameId: string, playerId: string): Promise<Game> {
    const game = this.getGameOrThrow(gameId);
    if (game.state !== 'LOBBY') {
      throw new HttpError(409, 'Ready is only allowed in lobby');
    }

    const player = game.players.find((entry) => entry.id === playerId);
    if (!player) {
      throw new HttpError(404, 'Player not found');
    }

    if (player.isEliminated) {
      throw new HttpError(409, 'Eliminated player cannot act');
    }

    player.isReady = true;
    game.updatedAt = nowIso();

    const allReady = game.players.length >= MIN_PLAYERS && game.players.every((entry) => entry.isReady);
    if (allReady) {
      await this.startGame(game);
    }

    this.store.save(game);
    return game;
  }

  public async askQuestion(gameId: string, input: AskQuestionInput): Promise<{ response: string; game: Game }> {
    const game = this.getGameOrThrow(gameId);
    if (game.state !== 'IN_PROGRESS') {
      throw new HttpError(409, 'Questions are only allowed in IN_PROGRESS state');
    }

    const player = this.getPlayerOrThrow(game, input.playerId);
    this.assertActivePlayer(player);

    const currentPlayer = this.getCurrentTurnPlayer(game);
    if (!currentPlayer || currentPlayer.id !== input.playerId) {
      throw new HttpError(403, 'Cannot ask out of turn');
    }

    const response = await this.aiService.respondToQuestion({
      playerName: player.name,
      question: input.question
    });

    game.turns.push({
      id: generateId(),
      playerId: player.id,
      question: input.question,
      answer: response,
      createdAt: nowIso()
    });

    this.nextTurn(game);
    this.store.save(game);
    return { response, game };
  }

  public async handleAccusation(gameId: string, input: AccusationInput): Promise<Game> {
    const game = this.getGameOrThrow(gameId);
    if (game.state !== 'ACCUSATION_PHASE') {
      throw new HttpError(409, 'Accusations are only allowed in ACCUSATION_PHASE');
    }

    const player = this.getPlayerOrThrow(game, input.playerId);
    this.assertActivePlayer(player);

    if (player.hasAccused) {
      throw new HttpError(409, 'Player cannot accuse twice');
    }

    const murder = game.murder;
    if (!murder) {
      throw new HttpError(500, 'Murder has not been generated');
    }

    player.hasAccused = true;
    const isCorrect =
      input.accusedPlayerId === murder.killerPlayerId &&
      input.weapon === murder.weapon &&
      input.location === murder.location;

    if (isCorrect) {
      game.winnerPlayerId = player.id;
      game.state = 'FINISHED';
      game.updatedAt = nowIso();
      this.store.save(game);
      return game;
    }

    player.isEliminated = true;

    const alivePlayers = game.players.filter((entry) => !entry.isEliminated);
    if (alivePlayers.length === 1 && alivePlayers[0]?.id === murder.killerPlayerId) {
      game.winnerPlayerId = murder.killerPlayerId;
      game.state = 'FINISHED';
    }

    game.updatedAt = nowIso();
    this.store.save(game);
    return game;
  }

  public getPublicState(gameId: string, requesterPlayerId?: string): PublicGameView {
    const game = this.getGameOrThrow(gameId);
    const currentTurnPlayer = this.getCurrentTurnPlayer(game);

    return {
      id: game.id,
      state: game.state,
      players: game.players.map((player) => ({
        id: player.id,
        name: player.name,
        publicCharacter: player.publicCharacter,
        isReady: player.isReady,
        isEliminated: player.isEliminated,
        hasAccused: player.hasAccused,
        ...(requesterPlayerId === player.id ? { secretInfo: player.secretInfo } : {}),
        ...(game.state === 'FINISHED' ? { isKiller: player.isKiller } : {})
      })),
      clues: game.clues,
      currentTurnPlayerId: currentTurnPlayer?.id ?? null,
      roundNumber: game.roundNumber,
      tensionLevel: game.tensionLevel,
      winnerPlayerId: game.winnerPlayerId,
      createdAt: game.createdAt,
      updatedAt: game.updatedAt
    };
  }

  private async startGame(game: Game): Promise<void> {
    game.state = 'STARTING';
    game.murder = this.generateMurder(game);
    this.assignRoles(game);
    await this.aiService.generateIntroNarration({
      gameId: game.id,
      victim: game.murder.victim
    });
    game.state = 'IN_PROGRESS';
    game.currentTurnIndex = 0;
    game.roundNumber = 1;
    game.updatedAt = nowIso();
  }

  private generateMurder(game: Game): NonNullable<Game['murder']> {
    const killer = game.players[Math.floor(Math.random() * game.players.length)];
    if (!killer) {
      throw new HttpError(400, 'Cannot start game without players');
    }

    const weapon = WEAPONS[Math.floor(Math.random() * WEAPONS.length)];
    const location = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
    const victim = VICTIMS[Math.floor(Math.random() * VICTIMS.length)];

    if (!weapon || !location || !victim) {
      throw new HttpError(500, 'Failed to generate murder details');
    }

    return {
      killerPlayerId: killer.id,
      weapon,
      location,
      victim
    };
  }

  private assignRoles(game: Game): void {
    const murder = game.murder;
    if (!murder) {
      throw new HttpError(500, 'Murder must exist before assigning roles');
    }

    game.players.forEach((player) => {
      player.isKiller = player.id === murder.killerPlayerId;
      player.secretInfo = player.isKiller
        ? `You are the killer. Cover your tracks around the ${murder.location}.`
        : `You noticed suspicious movement near the ${murder.location}.`;
    });
  }

  private nextTurn(game: Game): void {
    const activePlayers = game.players.filter((player) => !player.isEliminated);
    if (activePlayers.length === 0) {
      throw new HttpError(500, 'No active players available');
    }

    let nextIndex = game.currentTurnIndex;
    do {
      nextIndex = (nextIndex + 1) % game.players.length;
    } while (game.players[nextIndex]?.isEliminated);

    const wrapped = nextIndex <= game.currentTurnIndex;
    game.currentTurnIndex = nextIndex;

    if (wrapped) {
      game.roundNumber += 1;
      game.tensionLevel = Math.min(100, game.tensionLevel + 10);
      this.generateClue(game).catch(() => undefined);

      if (game.roundNumber >= 3) {
        game.state = 'ACCUSATION_PHASE';
      }
    }

    game.updatedAt = nowIso();
  }

  private async generateClue(game: Game): Promise<Clue> {
    const clueText = `Trace evidence indicates the killer handled ${game.murder?.weapon ?? 'an unknown weapon'}.`;
    const narration = await this.aiService.generateClueNarration({
      roundNumber: game.roundNumber,
      structuredClue: clueText
    });

    const clue: Clue = {
      id: generateId(),
      roundNumber: game.roundNumber,
      structuredClue: clueText,
      narration,
      createdAt: nowIso()
    };

    game.clues.push(clue);
    game.updatedAt = nowIso();
    return clue;
  }

  private getGameOrThrow(gameId: string): Game {
    const game = this.store.getById(gameId);
    if (!game) {
      throw new HttpError(404, 'Game not found');
    }
    return game;
  }

  private getPlayerOrThrow(game: Game, playerId: string): Player {
    const player = game.players.find((entry) => entry.id === playerId);
    if (!player) {
      throw new HttpError(404, 'Player not found');
    }
    return player;
  }

  private getCurrentTurnPlayer(game: Game): Player | undefined {
    return game.players[game.currentTurnIndex];
  }

  private assertActivePlayer(player: Player): void {
    if (player.isEliminated) {
      throw new HttpError(409, 'Cannot act if eliminated');
    }
  }
}
