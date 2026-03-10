import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly gameIdKey = 'cluedo_game_id';
  private readonly playerIdKey = 'cluedo_player_id';

  setSession(gameId: string, playerId?: string): void {
    localStorage.setItem(this.gameIdKey, gameId);
    localStorage.setItem(this.playerIdKey, playerId ?? '');
  }

  getGameId(): string {
    return localStorage.getItem(this.gameIdKey) ?? '';
  }

  getPlayerId(): string {
    return localStorage.getItem(this.playerIdKey) ?? '';
  }

  hasSession(): boolean {
    return Boolean(this.getGameId());
  }

  clearSession(): void {
    localStorage.removeItem(this.gameIdKey);
    localStorage.removeItem(this.playerIdKey);
  }
}
