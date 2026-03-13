import {
  GameStatus,
  Role,
  type Card as CardType,
  type Game as GameType,
  type GameStatePayload,
  type Player as PlayerType
} from '../../shared/types';
import { db, generateId, nowIso, type Card, type Game, type StoredGame, type StoredPlayer } from '../../database/in-memory.js';
import {
  emitGameStarted,
  emitGameStateUpdated,
  emitPlayerAssignedCard
} from '../../websocket/socket.js';

const MAIN_GAME_ID = 'MAIN_GAME';
const MAX_PLAYERS = 15;
const MIN_PLAYERS_TO_START = 3;

export class GameService {
  public async getState(): Promise<GameStatePayload> {
    const game = this.ensureMainGame();

    const players = [...db.players].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    return {
      game: this.mapGame(game),
      players: players.map((player) => this.mapPlayer(player))
    };
  }

  public async startGame(): Promise<GameStatePayload> {
    const game = this.ensureMainGame();

    if (game.status !== 'WAITING') {
      throw new Error('Game can only be started from WAITING state');
    }

    const players = [...db.players].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    if (players.length < MIN_PLAYERS_TO_START) {
      throw new Error(`At least ${MIN_PLAYERS_TO_START} players are required to start the game`);
    }

    if (players.length > MAX_PLAYERS) {
      throw new Error(`Maximum ${MAX_PLAYERS} players allowed`);
    }

    const cards = [...db.cards];

    if (cards.length < players.length) {
      throw new Error('Not enough cards to assign one card per player');
    }

    const shuffledCards = this.shuffle(cards);
    const assignedPlayers = players.map((player, index) => {
      const card = shuffledCards[index];
      if (!card) {
        throw new Error('Card assignment failed due to missing card');
      }

      const storedPlayer = db.players.find((currentPlayer) => currentPlayer.id === player.id);
      if (!storedPlayer) {
        throw new Error(`Player ${player.id} was not found while assigning cards`);
      }

      storedPlayer.cardId = card.id;
      storedPlayer.updatedAt = nowIso();
      return { player: storedPlayer, card };
    });

    game.status = 'STARTED';
    game.updatedAt = nowIso();

    assignedPlayers.forEach(({ player, card }) => {
      emitPlayerAssignedCard(player.id, this.mapCard(card));
    });

    const state = await this.getState();
    // Use MAIN_GAME_ID for compatibility
    emitGameStarted(MAIN_GAME_ID, state as any);
    emitGameStateUpdated(MAIN_GAME_ID, state as any);
    return state;
  }

  public async finishGame(): Promise<GameStatePayload> {
    const game = this.ensureMainGame();

    if (game.status !== 'STARTED') {
      throw new Error('Game can only be finished from STARTED state');
    }

    game.status = 'ENDED';
    game.updatedAt = nowIso();

    const state = await this.getState();
    emitGameStateUpdated(MAIN_GAME_ID, state as any);
    return state;
  }

  public ensureMainGame(): StoredGame {
    const existingGame = db.games.find((entry) => entry.id === MAIN_GAME_ID);
    if (existingGame) {
      existingGame.players = db.players;
      return existingGame;
    }

    const timestamp = nowIso();
    const game: StoredGame = {
      id: MAIN_GAME_ID,
      status: 'WAITING',
      players: db.players,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    db.games.push(game);
    return game;
  }

  private shuffle<T>(items: T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = copy[i];
      if (tmp === undefined || copy[j] === undefined) {
        continue;
      }
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  private mapGame(game: Game & Pick<StoredGame, 'createdAt' | 'updatedAt'>): GameType {
    return {
      id: game.id,
      status: this.mapGameStatus(game.status),
      createdAt: game.createdAt,
      updatedAt: game.updatedAt
    };
  }

  private mapPlayer(player: StoredPlayer): PlayerType {
    return {
      id: player.id,
      name: player.name,
      role: this.mapRole(player.role),
      cardId: player.cardId
    };
  }

  private mapRole(role: 'PLAYER' | 'MASTER'): Role {
    return role === 'MASTER' ? Role.MASTER : Role.PLAYER;
  }

  private mapGameStatus(status: 'WAITING' | 'STARTED' | 'ENDED'): GameStatus {
    switch (status) {
      case 'WAITING':
        return GameStatus.WAITING;
      case 'STARTED':
        return GameStatus.STARTED;
      case 'ENDED':
        return GameStatus.FINISHED;
      default:
        throw new Error(`Unknown game status value: ${status}`);
    }
  }

  private mapCard(card: Card): CardType {
    return {
      id: card.id,
      type: 'CLUE',
      value: card.name
    };
  }

  public createPlayer(name: string, role: 'PLAYER' | 'MASTER'): StoredPlayer {
    const timestamp = nowIso();
    const player: StoredPlayer = {
      id: generateId(),
      name,
      role,
      cardId: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    db.players.push(player);
    this.ensureMainGame().players = db.players;
    return player;
  }
}
