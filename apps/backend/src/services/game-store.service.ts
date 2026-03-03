import type { Game } from '../types/game.types.js';

export class GameStoreService {
  private readonly games = new Map<string, Game>();

  public save(game: Game): void {
    this.games.set(game.id, game);
  }

  public getById(gameId: string): Game | undefined {
    return this.games.get(gameId);
  }
}
