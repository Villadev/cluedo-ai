import { HttpClient } from '@angular/common/http';
import { inject, Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, map, Observable, Subscription } from 'rxjs';
import { PublicGameView, PublicPlayerView, GameStateInfo, GameState } from '../models/player.model';
import { SessionService } from './session.service';
import { WebSocketService } from './websocket.service';
import { SocketGameEvent } from '../models/chat.models';

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

export interface ClueResponse {
  round: number;
  clues: Array<{ type: string; text: string }>;
}

export interface SecretResponse {
  secret: string;
}

@Injectable({ providedIn: 'root' })
export class GameService implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly sessionService = inject(SessionService);
  private readonly websocketService = inject(WebSocketService);
  private readonly baseUrl = 'https://backend-veq8.onrender.com';
  private readonly subscriptions = new Subscription();

  private readonly sessionSubject = new BehaviorSubject<GameSession | null>(null);
  readonly session$ = this.sessionSubject.asObservable();

  private readonly gameStateSubject = new BehaviorSubject<GameState | 'NONE'>('NONE');
  readonly gameState$ = this.gameStateSubject.asObservable();

  constructor() {
    this.subscriptions.add(
      this.websocketService.events$.subscribe((event: SocketGameEvent) => {
        if (event.event === 'game_state' || event.event === 'game_state_updated') {
          if (event.payload && typeof event.payload === 'object' && 'state' in event.payload) {
            this.gameStateSubject.next(event.payload.state as GameState);
          }
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  setSession(session: GameSession): void {
    this.sessionSubject.next(session);
  }

  isCurrentPlayer(playerId: string): boolean {
    return this.sessionService.getPlayerId() === playerId;
  }

  leaveGame(gameId: string, playerId: string): Observable<ApiResponse<unknown>> {
    return this.http.delete<ApiResponse<unknown>>(`${this.baseUrl}/game/${gameId}/users/${playerId}`);
  }

  getIntroduction(gameId: string): Observable<ApiResponse<IntroductionResponse>> {
    return this.http.get<ApiResponse<IntroductionResponse>>(`${this.baseUrl}/game/${gameId}/intro`);
  }

  getInstructions(gameId: string): Observable<ApiResponse<string>> {
    return this.http.get<ApiResponse<string>>(`${this.baseUrl}/game/${gameId}/instructions`);
  }

  getCluesByRound(gameId: string, roundNumber: number): Observable<ApiResponse<ClueResponse>> {
    return this.http.get<ApiResponse<ClueResponse>>(`${this.baseUrl}/game/${gameId}/clues/round/${roundNumber}`);
  }

  getPlayerSecret(gameId: string, playerId: string): Observable<ApiResponse<SecretResponse>> {
    return this.http.get<ApiResponse<SecretResponse>>(`${this.baseUrl}/game/${gameId}/players/${playerId}/secret`);
  }

  logTimelineEvent(gameId: string, type: string, description: string): Observable<ApiResponse<unknown>> {
    return this.http.post<ApiResponse<unknown>>(`${this.baseUrl}/game/${gameId}/timeline/log`, { type, description });
  }

  getParticipants(gameId: string, playerId?: string): Observable<ApiResponse<PublicPlayerView[]>> {
    return this.getGame(gameId, playerId).pipe(
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

  getPossibleWeapons(): string[] {
    return ['Canelobre', 'Ganivet', 'Tubería de plom', 'Revòlver', 'Corda', 'Clau anglesa', 'Verí', 'Trofeu', 'Destral'];
  }

  getPossibleLocations(): string[] {
    return [
      'Catalunya en Miniatura',
      'Ajuntament de Torrelles de Llobregat',
      'Església de Sant Martí',
      'Penyes de Can Riera',
      'Ateneu Torrellenc',
      'Plaça de l’Església',
      'Carrer Major',
      'Bar La Plaçá',
      'Masia de Can Coll',
      'Font del Mas Segarra'
    ];
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
