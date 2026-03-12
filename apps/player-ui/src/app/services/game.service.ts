import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, map, Observable } from 'rxjs';
import { PublicGameView, PublicPlayerView, GameStateInfo } from '../models/player.model';

export interface GameSession {
  gameId: string;
  playerId?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface IntroductionResponse {
  intro: string;
}

export interface PlayerJoinResponse {
  playerId: string;
}

export interface AccusationPayload {
  playerId: string;
  accusedPlayerId: string;
  weapon: string;
  location: string;
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

  getIntroduction(gameId: string): Observable<ApiResponse<IntroductionResponse>> {
    return this.http.get<ApiResponse<IntroductionResponse>>(`${this.baseUrl}/game/${gameId}/intro`);
  }

  getParticipants(gameId: string): Observable<ApiResponse<PublicPlayerView[]>> {
    // We use the full game state to get rich player/character information
    return this.http.get<ApiResponse<PublicGameView>>(`${this.baseUrl}/game/${gameId}`).pipe(
      map(response => ({
        success: response.success,
        data: response.data?.players,
        error: response.error
      }))
    );
  }

  getGame(gameId: string, playerId?: string): Observable<ApiResponse<PublicGameView>> {
    const url = playerId ? `${this.baseUrl}/game/${gameId}?playerId=${playerId}` : `${this.baseUrl}/game/${gameId}`;
    return this.http.get<ApiResponse<PublicGameView>>(url);
  }

  getGameState(gameId: string): Observable<ApiResponse<GameStateInfo>> {
    return this.http.get<ApiResponse<GameStateInfo>>(`${this.baseUrl}/game/${gameId}/state`);
  }

  joinGame(gameId: string, name: string): Observable<PlayerJoinResponse> {
    return this.http
      .post<ApiResponse<PublicGameView>>(`${this.baseUrl}/game/${gameId}/join`, { name })
      .pipe(
        map((response: ApiResponse<PublicGameView>) => {
          const players = response.data?.players ?? [];
          const joinedPlayer = players.find((player: PublicPlayerView) => player.nickname === name);
          if (!joinedPlayer?.id) {
            throw new Error("No s'ha pogut recuperar l'ID del jugador.");
          }

          return { playerId: joinedPlayer.id };
        })
      );
  }

  accuse(gameId: string, playerId: string, accusedId: string, weapon: string, location: string): Observable<ApiResponse<unknown>> {
    const payload: AccusationPayload = {
      playerId,
      accusedPlayerId: accusedId,
      weapon,
      location
    };
    return this.http.post<ApiResponse<unknown>>(`${this.baseUrl}/game/${gameId}/accuse`, payload);
  }
}
