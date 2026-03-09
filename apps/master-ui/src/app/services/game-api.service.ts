import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface GameResponse {
  success: boolean;
  gameState?: {
    id: string;
    [key: string]: any;
  };
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class GameApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'https://backend-veq8.onrender.com';

  createGame(): Observable<GameResponse> {
    return this.http.post<GameResponse>(`${this.baseUrl}/game/create`, {});
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
    return this.http.post<GameResponse>(`${this.baseUrl}/game/${gameId}/reset`, {});
  }
}
