import {
  GameStatus as PrismaGameStatus,
  Role as PrismaRole,
  type Card,
  type Game,
  type Player
} from '@prisma/client';
import {
  GameStatus,
  Role,
  type Card as CardType,
  type Game as GameType,
  type GameStatePayload,
  type Player as PlayerType
} from '@cluedo/types';
import { prisma } from '../../database/prisma.js';
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
    await this.ensureMainGame();

    const game = await prisma.game.findUniqueOrThrow({
      where: { id: MAIN_GAME_ID }
    });

    const players = await prisma.player.findMany({
      orderBy: { createdAt: 'asc' }
    });

    return {
      game: this.mapGame(game),
      players: players.map((player: Player) => this.mapPlayer(player))
    };
  }

  public async startGame(): Promise<GameStatePayload> {
    const game = await this.ensureMainGame();

    if (game.status !== PrismaGameStatus.WAITING) {
      throw new Error('Game can only be started from WAITING state');
    }

    const players = await prisma.player.findMany({
      orderBy: { createdAt: 'asc' }
    });

    if (players.length < MIN_PLAYERS_TO_START) {
      throw new Error(`At least ${MIN_PLAYERS_TO_START} players are required to start the game`);
    }

    if (players.length > MAX_PLAYERS) {
      throw new Error(`Maximum ${MAX_PLAYERS} players allowed`);
    }

    const cards = await prisma.card.findMany();

    if (cards.length < players.length) {
      throw new Error('Not enough cards to assign one card per player');
    }

    const shuffledCards = this.shuffle(cards);

    const assignedPlayers = await prisma.$transaction(async (tx) => {
      const updates = players.map((player: Player, index: number) => {
        const card = shuffledCards[index];
        if (!card) {
          throw new Error('Card assignment failed due to missing card');
        }
        return tx.player.update({
          where: { id: player.id },
          data: { cardId: card.id },
          include: { card: true }
        });
      });

      const updatedPlayers = await Promise.all(updates);

      await tx.game.update({
        where: { id: MAIN_GAME_ID },
        data: { status: PrismaGameStatus.STARTED }
      });

      return updatedPlayers;
    });

    assignedPlayers.forEach((player) => {
      if (!player.card) {
        throw new Error(`Player ${player.id} was not assigned a card`);
      }
      emitPlayerAssignedCard(player.id, this.mapCard(player.card));
    });

    const state = await this.getState();
    emitGameStarted(state);
    emitGameStateUpdated(state);
    return state;
  }

  public async finishGame(): Promise<GameStatePayload> {
    const game = await this.ensureMainGame();

    if (game.status !== PrismaGameStatus.STARTED) {
      throw new Error('Game can only be finished from STARTED state');
    }

    await prisma.game.update({
      where: { id: MAIN_GAME_ID },
      data: { status: PrismaGameStatus.FINISHED }
    });

    const state = await this.getState();
    emitGameStateUpdated(state);
    return state;
  }

  private async ensureMainGame(): Promise<Game> {
    return prisma.game.upsert({
      where: { id: MAIN_GAME_ID },
      update: {},
      create: {
        id: MAIN_GAME_ID,
        status: PrismaGameStatus.WAITING
      }
    });
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

  private mapGame(game: Game): GameType {
    return {
      id: game.id,
      status: this.mapGameStatus(game.status),
      createdAt: game.createdAt.toISOString(),
      updatedAt: game.updatedAt.toISOString()
    };
  }

  private mapPlayer(player: Player): PlayerType {
    return {
      id: player.id,
      name: player.name,
      role: this.mapRole(player.role),
      cardId: player.cardId
    };
  }

  private mapRole(role: PrismaRole): Role {
    switch (role) {
      case PrismaRole.MASTER:
        return Role.MASTER;
      case PrismaRole.PLAYER:
        return Role.PLAYER;
      default:
        throw new Error(`Unknown role value: ${role}`);
    }
  }

  private mapGameStatus(status: PrismaGameStatus): GameStatus {
    switch (status) {
      case PrismaGameStatus.WAITING:
        return GameStatus.WAITING;
      case PrismaGameStatus.STARTED:
        return GameStatus.STARTED;
      case PrismaGameStatus.FINISHED:
        return GameStatus.FINISHED;
      default:
        throw new Error(`Unknown game status value: ${status}`);
    }
  }

  private mapCard(card: Card): CardType {
    return {
      id: card.id,
      type: card.type,
      value: card.value
    };
  }
}
