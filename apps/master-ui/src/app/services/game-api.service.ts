import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, tap, map } from 'rxjs';

export type GameState = 'LOBBY' | 'STARTING' | 'IN_PROGRESS' | 'ACCUSATION_PHASE' | 'FINISHED';

export interface PublicPlayerView {
  id: string;
  name: string;
  publicCharacter: string;
  isReady: boolean;
  isEliminated: boolean;
  hasAccused: boolean;
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

export interface GameResponse {
  success: boolean;
  gameState?: PublicGameView;
  error?: string;
}

export interface IntroResponse {
  success: boolean;
  intro: string;
}

export interface SolutionResponse {
  success: boolean;
  solution: {
    assassi: string;
    arma: string;
    lloc: string;
  };
}

// Interfaces used by components after unwrapping
export interface GameSolution {
  assassi: string;
  arma: string;
  lloc: string;
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

  createGame(): Observable<GameResponse> {
    return this.http.post<GameResponse>(`${this.baseUrl}/game/create`, {}).pipe(
      tap(response => {
        if (response.success && response.gameState?.id) {
          this.setGameId(response.gameState.id);
        }
      })
    );
  }

  joinGame(gameId: string, playerName: string): Observable<GameResponse> {
    return this.http.post<GameResponse>(`${this.baseUrl}/game/${gameId}/join`, {
      name: playerName
    });
  }

  setGameReady(gameId: string): Observable<GameResponse> {
    return this.http.post<GameResponse>(`${this.baseUrl}/game/${gameId}/ready`, {});
  }

  resetGame(gameId: string): Observable<GameResponse> {
    return this.http.post<GameResponse>(`${this.baseUrl}/game/${gameId}/reset`, {}).pipe(
      tap(response => {
        if (response.success) {
          this.setGameId(null);
        }
      })
    );
  }

  getGame(gameId: string, playerId?: string): Observable<PublicGameView> {
    const url = playerId ? `${this.baseUrl}/game/${gameId}?playerId=${playerId}` : `${this.baseUrl}/game/${gameId}`;
    return this.http.get<GameResponse>(url).pipe(
      map(response => {
        if (response.success && response.gameState) {
          return response.gameState;
        }
        throw new Error(response.error || 'Error en obtenir la partida');
      })
    );
  }

  getInstructions(gameId: string): Observable<string> {
    return this.http.get(`${this.baseUrl}/game/${gameId}/instructions`, { responseType: 'text' });
  }

  getIntro(gameId: string): Observable<IntroResponse> {
    return this.http.get<IntroResponse>(`${this.baseUrl}/game/${gameId}/intro`);
  }

  getSolution(gameId: string): Observable<GameSolution> {
    return this.http.get<SolutionResponse>(`${this.baseUrl}/game/${gameId}/solution`).pipe(
      map(response => {
        if (response.success && response.solution) {
          return response.solution;
        }
        throw new Error('Error en obtenir la solució');
      })
    );
  }

  deleteUser(gameId: string, userId: string): Observable<GameResponse> {
    return this.http.delete<GameResponse>(`${this.baseUrl}/game/${gameId}/users/${userId}`);
  }
}
