import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface GameSession {
  gameId: string;
  playerId?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class GameService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'https://backend-veq8.onrender.com';

  private readonly sessionSubject = new BehaviorSubject<GameSession | null>(null);
  readonly session$ = this.sessionSubject.asObservable();

  private readonly askedThisRoundSubject = new BehaviorSubject<boolean>(false);
  readonly askedThisRound$ = this.askedThisRoundSubject.asObservable();

  setSession(session: GameSession): void {
    this.sessionSubject.next(session);
  }

  setAskedThisRound(value: boolean): void {
    this.askedThisRoundSubject.next(value);
  }

  resetRoundQuestion(): void {
    this.askedThisRoundSubject.next(false);
  }

  leaveGame(gameId: string, playerId: string): Observable<ApiResponse<unknown>> {
    return this.http.delete<ApiResponse<unknown>>(`${this.baseUrl}/game/${gameId}/users/${playerId}`);
  }
}
