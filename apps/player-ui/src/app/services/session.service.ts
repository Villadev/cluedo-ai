import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly gameIdKey = 'cluedo_game_id';
  private readonly playerIdKey = 'cluedo_player_id';

  setSession(gameId: string, playerId?: string): void {
    sessionStorage.setItem(this.gameIdKey, gameId);
    sessionStorage.setItem(this.playerIdKey, playerId ?? '');
  }

  getGameId(): string {
    return sessionStorage.getItem(this.gameIdKey) ?? '';
  }

  getPlayerId(): string {
    return sessionStorage.getItem(this.playerIdKey) ?? '';
  }

  hasSession(): boolean {
    return Boolean(this.getGameId());
  }

  clearSession(): void {
    sessionStorage.removeItem(this.gameIdKey);
    sessionStorage.removeItem(this.playerIdKey);
  }
}
