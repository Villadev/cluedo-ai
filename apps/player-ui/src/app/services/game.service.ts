import { HttpClient } from '@angular/common/http';
import { inject, Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, map, Observable, Subscription } from 'rxjs';
import { PublicGameView, PublicPlayerView, GameStateInfo, GameState, Difficulty } from '../models/player.model';
import { SessionService } from './session.service';
import { WebSocketService } from './websocket.service';
import { SocketGameEvent } from '../models/chat.models';
import { GameStateService } from './game-state.service';

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

export interface ChatHistoryMessage {
  type: 'player' | 'narrator' | 'system' | 'clue';
  playerId?: string;
  playerName?: string;
  roundNumber?: number;
  sequenceId?: number;
  message: string;
  timestamp: number;
}

@Injectable({ providedIn: 'root' })
export class GameService implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly sessionService = inject(SessionService);
  private readonly websocketService = inject(WebSocketService);
  private readonly gameStateService = inject(GameStateService);
  private readonly baseUrl = 'https://backend-veq8.onrender.com';
  private readonly subscriptions = new Subscription();

  private readonly sessionSubject = new BehaviorSubject<GameSession | null>(null);
  readonly session$ = this.sessionSubject.asObservable();

  constructor() {
    this.subscriptions.add(
      this.websocketService.events$.subscribe((event: SocketGameEvent) => {
        if (event.event === 'game_state' || event.event === 'game_state_updated') {
          if (event.payload && typeof event.payload === 'object' && 'state' in event.payload) {
            this.gameStateService.setState(event.payload.state as GameState);
          }
        } else if (event.event === 'game_state_update') {
          if (event.payload && typeof event.payload === 'object') {
            if ('status' in event.payload) {
              this.gameStateService.setState(event.payload.status as GameState);
            }
            if ('difficulty' in event.payload) {
              this.gameStateService.setDifficulty(event.payload.difficulty as Difficulty);
            }
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
    return this.http.post<ApiResponse<{ correct: boolean, penaltyRounds: number, game: PublicGameView }>>(`${this.baseUrl}/game/${gameId}/timeline/log`, { type, description });
  }

  getParticipants(gameId: string): Observable<ApiResponse<PublicPlayerView[]>> {
    return this.http.get<ApiResponse<PublicPlayerView[]>>(`${this.baseUrl}/game/${gameId}/players`);
  }

  getGame(gameId: string, playerId?: string): Observable<ApiResponse<PublicGameView>> {
    const url = playerId ? `${this.baseUrl}/game/${gameId}?playerId=${playerId}` : `${this.baseUrl}/game/${gameId}`;
    return this.http.get<ApiResponse<PublicGameView>>(url);
  }

  getGameState(gameId: string): Observable<ApiResponse<GameStateInfo>> {
    return this.http.get<ApiResponse<GameStateInfo>>(`${this.baseUrl}/game/${gameId}/state`);
  }

  getOptions(gameId: string): Observable<ApiResponse<{ weapons: string[], locations: string[] }>> {
    return this.http.get<ApiResponse<{ weapons: string[], locations: string[] }>>(`${this.baseUrl}/game/${gameId}/options`);
  }

  getChatHistory(gameId: string): Observable<ApiResponse<ChatHistoryMessage[]>> {
    return this.http.get<ApiResponse<ChatHistoryMessage[]>>(`${this.baseUrl}/game/${gameId}/chat`);
  }

  joinGame(gameId: string, name: string): Observable<PlayerJoinResponse> {
    return this.http
      .post<ApiResponse<{ playerId: string, game: PublicGameView }>>(`${this.baseUrl}/game/${gameId}/join`, { name })
      .pipe(
        map((response) => {
          if (!response.success || !response.data?.playerId) {
            throw new Error(response.error || "No s'ha pogut recuperar l'ID del jugador.");
          }

          return { playerId: response.data.playerId };
        })
      );
  }

  accuse(gameId: string, playerId: string, accusedId: string, weapon: string, location: string): Observable<ApiResponse<{ correct: boolean, penaltyRounds: number, game: PublicGameView }>> {
    const payload: AccusationPayload = {
      playerId,
      accusedPlayerId: accusedId,
      weapon,
      location
    };
    return this.http.post<ApiResponse<{ correct: boolean, penaltyRounds: number, game: PublicGameView }>>(`${this.baseUrl}/game/${gameId}/accuse`, payload);
  }

  askQuestion(gameId: string, playerId: string, question: string) {
    return this.http.post<ApiResponse<{ response: string }>>(`${this.baseUrl}/game/${gameId}/question`, {
      playerId,
      message: question
    });
  }
}
