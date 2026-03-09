import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

export type GameState = 'LOBBY' | 'READY' | 'PLAYING' | 'FINISHED';

export interface PublicPlayerView {
  id: string;
  name: string;
  description: string;
  personality: string;
  publicCharacter: string;
  isReady: boolean;
  isEliminated: boolean;
  hasAccused: boolean;
  askedThisRound: boolean;
  accusedThisRound: boolean;
  accusationCooldown: number;
  secretInfo?: string;
  isKiller?: boolean;
}

export interface PublicGameView {
  id: string;
  state: GameState;
  players: PublicPlayerView[];
  clues: any[];
  currentTurnPlayerId: string | null;
  roundNumber: number;
  tensionLevel: number;
  winnerPlayerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface GameResponse {
  gameState: PublicGameView;
}

export interface IntroResponse {
  intro: string;
}

export interface SolutionResponse {
  assassi: string;
  arma: string;
  lloc: string;
}

export interface UsersResponse {
  players: { id: string; name: string }[];
}

@Injectable({
  providedIn: 'root'
})
export class GameApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'https://backend-veq8.onrender.com';

  // Reactive gameId signal
  readonly gameId = signal<string | null>(localStorage.getItem('gameId'));

  setGameId(id: string | null): void {
    if (id) {
      localStorage.setItem('gameId', id);
    } else {
      localStorage.removeItem('gameId');
    }
    this.gameId.set(id);
  }

  createGame(): Observable<ApiResponse<PublicGameView>> {
    return this.http.post<ApiResponse<PublicGameView>>(`${this.baseUrl}/game`, {}).pipe(
      tap(response => {
        if (response.success && response.data?.id) {
          this.setGameId(response.data.id);
        }
      })
    );
  }

  startGame(gameId: string): Observable<ApiResponse<PublicGameView>> {
    return this.http.post<ApiResponse<PublicGameView>>(`${this.baseUrl}/game/${gameId}/start`, {});
  }

  resetGame(gameId: string): Observable<ApiResponse<GameResponse>> {
    return this.http.post<ApiResponse<GameResponse>>(`${this.baseUrl}/game/${gameId}/reset`, {}).pipe(
      tap(response => {
        if (response.success) {
          this.setGameId(null);
        }
      })
    );
  }

  getGame(gameId: string, playerId?: string): Observable<ApiResponse<PublicGameView>> {
    const url = playerId ? `${this.baseUrl}/game/${gameId}?playerId=${playerId}` : `${this.baseUrl}/game/${gameId}`;
    return this.http.get<ApiResponse<PublicGameView>>(url);
  }

  getInstructions(gameId: string): Observable<ApiResponse<string>> {
    return this.http.get<ApiResponse<string>>(`${this.baseUrl}/game/${gameId}/instructions`);
  }

  getIntro(gameId: string): Observable<ApiResponse<IntroResponse>> {
    return this.http.get<ApiResponse<IntroResponse>>(`${this.baseUrl}/game/${gameId}/intro`);
  }

  getSolution(gameId: string): Observable<ApiResponse<SolutionResponse>> {
    return this.http.get<ApiResponse<SolutionResponse>>(`${this.baseUrl}/game/${gameId}/solution`);
  }

  deleteUser(gameId: string, userId: string): Observable<ApiResponse<GameResponse>> {
    return this.http.delete<ApiResponse<GameResponse>>(`${this.baseUrl}/game/${gameId}/users/${userId}`);
  }
}
