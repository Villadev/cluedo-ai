import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

export type GameState = 'LOBBY' | 'GENERATING' | 'PLAYER_INFO' | 'PLAYING' | 'FINISHED' | 'NONE';
export type WinnerType = 'INVESTIGATORS' | 'ASSASSIN';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'extreme';

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
  maxRounds: number;
  tensionLevel: number;
  difficulty: Difficulty;
  winnerPlayerId: string | null;
  winnerType: WinnerType | null;
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
  sequenceId?: number;
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

export interface GenerationTelemetryEvent {
  gameId: string;
  phase: string;
  stepLabel: string;
  stepName: string;
  attempt: number;
  startAt: number;
  endAt: number;
  durationMs: number;
  outcome: 'success' | 'validation_failed' | 'timeout' | 'aborted' | 'error';
  errorMessage?: string;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  validationDetails?: {
    expectedCount?: number;
    returnedCount?: number;
    assassinExpected?: string;
    assassinMatched?: boolean;
  };
}

export interface GenerationTelemetrySummary {
  totalCalls: number;
  totalAttempts: number;
  avgDurationMs: number;
  p95DurationMs: number;
  totalValidationFailed: number;
  totalAborted: number;
  totalTimeouts: number;
  totalErrors: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
}

export interface GenerationTelemetry {
  events: GenerationTelemetryEvent[];
  summary: GenerationTelemetrySummary;
}

export interface DebugData {
  game: any;
  players: any[];
  characters: any[];
  clues: any[];
  roundNumber: number;
  state: string;
  errors: BackendErrorLog[];
  generationTelemetry: GenerationTelemetry;
}

export interface PlayerStatus {
  nickname: string;
  askedThisRound: boolean;
}

export interface GameStateInfo {
  state: string;
  playersCount: number;
  charactersCount: number;
  roundNumber: number;
  maxRounds: number;
  difficulty: Difficulty;
  winnerType: WinnerType | null;
  playerStatus?: PlayerStatus[];
  generationPhase?: string;
  generationError?: string;
  generationAttempts?: number;
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

export interface ChatHistoryMessage {
  type: 'player' | 'narrator' | 'system' | 'clue';
  playerId?: string;
  playerName?: string;
  message: string;
  timestamp: number;
  roundNumber?: number;
  sequenceId?: number;
}

@Injectable({
  providedIn: 'root'
})
export class GameApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'https://backend-veq8.onrender.com';

  // Reactive gameId signal
  readonly gameId = signal<string | null>(sessionStorage.getItem('gameId'));

  setGameId(id: string | null): void {
    if (id) {
      sessionStorage.setItem('gameId', id);
    } else {
      sessionStorage.removeItem('gameId');
    }
    this.gameId.set(id);
  }

  createGame(maxRounds: number = 5): Observable<ApiResponse<PublicGameView>> {
    return this.http.post<ApiResponse<PublicGameView>>(`${this.baseUrl}/game`, { maxRounds }).pipe(
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

  deleteAllGames(): Observable<ApiResponse<any>> {
    return this.http.delete<ApiResponse<any>>(`${this.baseUrl}/game`).pipe(
      tap(response => {
        if (response.success) {
          this.setGameId(null);
        }
      })
    );
  }

  deleteGame(gameId: string): Observable<ApiResponse<any>> {
    return this.http.delete<ApiResponse<any>>(`${this.baseUrl}/game/${gameId}`).pipe(
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

  getChatHistory(gameId: string): Observable<ApiResponse<ChatHistoryMessage[]>> {
    return this.http.get<ApiResponse<ChatHistoryMessage[]>>(`${this.baseUrl}/game/${gameId}/chat`);
  }

  deleteUser(gameId: string, userId: string): Observable<ApiResponse<GameResponse>> {
    return this.http.delete<ApiResponse<GameResponse>>(`${this.baseUrl}/game/${gameId}/users/${userId}`);
  }

  forceNextRound(gameId: string): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(`${this.baseUrl}/game/${gameId}/force-next-round`, {});
  }

  getParticipants(gameId: string): Observable<ApiResponse<PublicPlayerView[]>> {
    return this.http.get<ApiResponse<PublicPlayerView[]>>(`${this.baseUrl}/game/${gameId}/players`);
  }

  listAllGames(): Observable<ApiResponse<any[]>> {
    return this.http.get<ApiResponse<any[]>>(`${this.baseUrl}/game`);
  }
  updateLobbySettings(gameId: string, settings: { maxRounds?: number, difficulty?: Difficulty }): Observable<ApiResponse<PublicGameView>> {
    return this.http.patch<ApiResponse<PublicGameView>>(`${this.baseUrl}/game/${gameId}/settings`, settings);
  }
}
