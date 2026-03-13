import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

export type GameState = 'LOBBY' | 'READY' | 'PLAYING' | 'FINISHED';

export interface Coartada {
  location: string;
  timeStart: string;
  timeEnd: string;
  witness: string;
  credibility: 'alta' | 'mitjana' | 'baixa';
}

export interface PublicCharacterView {
  id: string;
  name: string;
  description: string;
  personality: string;
  possibleMotive: string;
  profession: string;
  secret: string;
  coartada: Coartada;
  rumor: string;
  relationships: string;
  tensions: string;
}

export interface PublicClueView {
  id: string;
  playerId: string;
  text: string;
  roundNumber: number;
  createdAt: string;
}

export interface PublicPlayerView {
  id: string;
  nickname: string;
  character?: PublicCharacterView;
  isReady: boolean;
  isEliminated: boolean;
  hasAccused: boolean;
  askedThisRound: boolean;
  accusedThisRound: boolean;
  accusationCooldown: number;
  type: "real" | "npc";
}

export interface PublicGameView {
  id: string;
  state: GameState;
  players: PublicPlayerView[];
  clues: PublicClueView[];
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
  assassin?: string;
  weapon?: string;
  location?: string;
  victimName?: string;
  finalNarrative?: string;
  message?: string;
}

export interface TimelineEvent {
  timestamp: string;
  type: string;
  playerId?: string;
  characterId?: string;
  roundNumber?: number;
  text?: string;
  isTrue?: boolean;
  targetCharacterId?: string;
  success?: boolean;
  winnerPlayerId?: string;
  description: string;
}

export interface BackendErrorLog {
  timestamp: string;
  source: string;
  message: string;
  stack?: string;
}

export interface DebugData {
  game: any;
  players: any[];
  characters: any[];
  clues: any[];
  roundNumber: number;
  state: string;
  errors: BackendErrorLog[];
}

export interface GameStateInfo {
  state: string;
  playersCount: number;
  charactersCount: number;
  roundNumber: number;
}

export interface UsersResponse {
  players: { id: string; name: string }[];
}

export interface Question {
  playerId: string;
  playerName: string;
  question: string;
  timestamp: number;
  roundNumber: number;
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

  joinGame(gameId: string, playerName: string): Observable<ApiResponse<PublicGameView>> {
    return this.http.post<ApiResponse<PublicGameView>>(`${this.baseUrl}/game/${gameId}/join`, {
      name: playerName
    });
  }

  startGame(gameId: string): Observable<ApiResponse<PublicGameView>> {
    return this.http.post<ApiResponse<PublicGameView>>(`${this.baseUrl}/game/${gameId}/start`, {});
  }

  startPlaying(gameId: string): Observable<ApiResponse<PublicGameView>> {
    return this.http.post<ApiResponse<PublicGameView>>(`${this.baseUrl}/game/${gameId}/play`, {});
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

  getDebug(gameId: string): Observable<ApiResponse<DebugData>> {
    return this.http.get<ApiResponse<DebugData>>(`${this.baseUrl}/game/${gameId}/debug`);
  }

  getTimeline(gameId: string): Observable<ApiResponse<TimelineEvent[]>> {
    return this.http.get<ApiResponse<TimelineEvent[]>>(`${this.baseUrl}/game/${gameId}/timeline`);
  }

  getQuestions(gameId: string): Observable<ApiResponse<Question[]>> {
    return this.http.get<ApiResponse<Question[]>>(`${this.baseUrl}/game/${gameId}/questions`);
  }

  getGameState(gameId: string): Observable<ApiResponse<GameStateInfo>> {
    return this.http.get<ApiResponse<GameStateInfo>>(`${this.baseUrl}/game/${gameId}/state`);
  }

  deleteUser(gameId: string, userId: string): Observable<ApiResponse<GameResponse>> {
    return this.http.delete<ApiResponse<GameResponse>>(`${this.baseUrl}/game/${gameId}/users/${userId}`);
  }
}
