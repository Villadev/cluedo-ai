import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, map, Observable } from 'rxjs';
import { Participant } from '../models/participant.model';
import { PublicGameState, PublicPlayerState } from '../models/player.model';

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

  getParticipants(gameId: string): Observable<ApiResponse<Participant[]>> {
    return this.http.get<ApiResponse<Participant[]>>(`${this.baseUrl}/game/${gameId}/players`);
  }

  getGame(gameId: string): Observable<ApiResponse<PublicGameState>> {
    return this.http.get<ApiResponse<PublicGameState>>(`${this.baseUrl}/game/${gameId}`);
  }

  joinGame(gameId: string, name: string): Observable<PlayerJoinResponse> {
    return this.http
      .post<ApiResponse<PublicGameState> | PlayerJoinResponse>(`${this.baseUrl}/game/${gameId}/join`, { name })
      .pipe(
        map((response: ApiResponse<PublicGameState> | PlayerJoinResponse) => {
          if ('playerId' in response && typeof response.playerId === 'string') {
            return { playerId: response.playerId };
          }

          const players: PublicPlayerState[] = response.data?.players ?? [];
          const joinedPlayer = players.find((player: PublicPlayerState) => player.nickname === name);
          if (!joinedPlayer?.id) {
            throw new Error("No s'ha pogut recuperar l'ID del jugador.");
          }

          return { playerId: joinedPlayer.id };
        })
      );
  }

  accuse(gameId: string, playerId: string, accusedId: string): Observable<ApiResponse<unknown>> {
    const payload: AccusationPayload = {
      playerId,
      accusedPlayerId: accusedId
    };
    return this.http.post<ApiResponse<unknown>>(`${this.baseUrl}/game/${gameId}/accuse`, payload);
  }
}
