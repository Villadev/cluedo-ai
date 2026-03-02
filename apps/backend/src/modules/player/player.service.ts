import { Role, type Player as PlayerType } from '@cluedo/types';
import { prisma } from '../../database/prisma.js';
import { emitGameStateUpdated, emitPlayerJoined } from '../../websocket/socket.js';
import { GameService } from '../game/game.service.js';

const MAIN_GAME_ID = 'MAIN_GAME';
const MAX_PLAYERS = 15;

const DB_GAME_STATUS = {
  WAITING: 'WAITING'
} as const;

type DbRole = Role;

export class PlayerService {
  private readonly gameService = new GameService();

  public async joinPlayer(name: string, role: Role): Promise<PlayerType> {
    const game = await prisma.game.upsert({
      where: { id: MAIN_GAME_ID },
      update: {},
      create: {
        id: MAIN_GAME_ID,
        status: DB_GAME_STATUS.WAITING
      }
    });

    if (game.status !== DB_GAME_STATUS.WAITING) {
      throw new Error('Players can only join while game status is WAITING');
    }

    const playerCount = await prisma.player.count();
    if (playerCount >= MAX_PLAYERS) {
      throw new Error(`Maximum ${MAX_PLAYERS} players reached`);
    }

    const player = await prisma.player.create({
      data: {
        name,
        role,
        gameId: MAIN_GAME_ID
      }
    });

    const mappedPlayer: PlayerType = {
      id: player.id,
      name: player.name,
      role: this.mapRole(player.role),
      cardId: player.cardId
    };

    emitPlayerJoined(mappedPlayer);

    const state = await this.gameService.getState();
    emitGameStateUpdated(state);

    return mappedPlayer;
  }

  public async listPlayers(): Promise<PlayerType[]> {
    const players = await prisma.player.findMany({
      orderBy: { createdAt: 'asc' }
    });

    return players.map((player) => ({
      id: player.id,
      name: player.name,
      role: this.mapRole(player.role),
      cardId: player.cardId
    }));
  }

  private mapRole(role: DbRole): Role {
    switch (role) {
      case Role.MASTER:
        return Role.MASTER;
      case Role.PLAYER:
        return Role.PLAYER;
      default:
        throw new Error(`Unknown role value: ${role}`);
    }
  }
}
