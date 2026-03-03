import { Role, type Player as PlayerType } from '../../shared/types';
import { db } from '../../database/in-memory.js';
import { emitGameStateUpdated, emitPlayerJoined } from '../../websocket/socket.js';
import { GameService } from '../game/game.service.js';

const MAX_PLAYERS = 15;

export class PlayerService {
  private readonly gameService = new GameService();

  public async joinPlayer(name: string, role: Role): Promise<PlayerType> {
    const game = this.gameService.ensureMainGame();

    if (game.status !== 'WAITING') {
      throw new Error('Players can only join while game status is WAITING');
    }

    const playerCount = db.players.length;
    if (playerCount >= MAX_PLAYERS) {
      throw new Error(`Maximum ${MAX_PLAYERS} players reached`);
    }

    const normalizedName = name.trim();
    const hasNameConflict = db.players.some(
      (existingPlayer) => existingPlayer.name.toLowerCase() === normalizedName.toLowerCase()
    );
    if (hasNameConflict) {
      throw new Error('Unique constraint failed on player name');
    }

    const player = this.gameService.createPlayer(normalizedName, this.mapRoleToInMemory(role));

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
    const players = [...db.players].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    return players.map((player) => ({
      id: player.id,
      name: player.name,
      role: this.mapRole(player.role),
      cardId: player.cardId
    }));
  }

  private mapRole(role: 'PLAYER' | 'MASTER'): Role {
    return role === 'MASTER' ? Role.MASTER : Role.PLAYER;
  }

  private mapRoleToInMemory(role: Role): 'PLAYER' | 'MASTER' {
    return role === Role.MASTER ? 'MASTER' : 'PLAYER';
  }
}
