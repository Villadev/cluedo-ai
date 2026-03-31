import { ChangeDetectionStrategy, Component, effect, inject, OnDestroy, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { Subscription } from 'rxjs';
import { Difficulty, GameApiService, GameState, PlayerStatus } from '../../services/game-api.service';
import { WebSocketService } from '../../services/websocket.service';
import { GameStateService } from '../../services/game-state.service';
import { ChatViewComponent } from "../../components/chat-view/chat-view.component";
import { GenerationStatusCardComponent } from "../../components/generation-status-card/generation-status-card.component";
import { InputTextModule } from 'primeng/inputtext';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { TooltipModule } from "primeng/tooltip";
import { MessagesModule } from 'primeng/messages';
import { SelectButtonModule } from 'primeng/selectbutton';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';

interface GenerationProgress {
  phase: string;
  attempt: number;
  elapsedMs: number;
  error?: string;
}

@Component({
  selector: 'app-control-center',
  standalone: true,
  imports: [
    ChatViewComponent,
    GenerationStatusCardComponent,
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    CardModule,
    MessageModule,
    TooltipModule,
    MessagesModule,
    SelectButtonModule,
    ConfirmDialogModule
  ],
  providers: [ConfirmationService],
  templateUrl: './control-center.component.html',
  styleUrls: ['./control-center.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ControlCenterComponent implements OnInit, OnDestroy {
  private readonly gameApiService = inject(GameApiService);
  private readonly websocketService = inject(WebSocketService);
  private readonly gameStateService = inject(GameStateService);
  private readonly router = inject(Router);
  private readonly confirmationService = inject(ConfirmationService);

  private subscriptions = new Subscription();

  readonly gameState = this.gameStateService.state;
  readonly gameId = this.gameApiService.gameId;

  protected readonly loading = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);
  protected readonly playerName = signal<string>('');
  protected readonly currentRound = signal<number>(0);
  protected readonly maxRounds = signal<number>(5);
  protected readonly difficulty = signal<Difficulty>('hard');
  protected readonly winnerType = signal<string | null>(null);
  protected readonly playerStatus = signal<PlayerStatus[]>([]);
  protected readonly generationProgress = signal<GenerationProgress | null>(null);
  protected readonly generationError = signal<string | null>(null);
  protected readonly solutionStatus = signal<string>('Solution pending...');
  protected readonly showCopyFeedback = signal<boolean>(false);
  protected readonly playersCount = signal<number>(0);

  protected readonly difficultyOptions = [
    { label: 'Fàcil', value: 'easy' },
    { label: 'Mitjà', value: 'medium' },
    { label: 'Difícil', value: 'hard' },
    { label: 'Extrem', value: 'extreme' }
  ];

  private readonly phaseLabels: Record<string, string> = {
    'SKELETON': 'Creant esquelet del cas',
    'CHARACTERS': 'Generant personatges',
    'NARRATIVES': 'Escrivint narratives',
    'CLUES': 'Preparant pistes',
    'RECOVERY': 'Finalitzant detalls',
    'DONE': 'Cas generat correctament',
    'FAILED': 'Error en la generació'
  };

  protected readonly progressLabel = computed(() => {
    const p = this.generationProgress();
    if (!p) return 'Generant Cas...';
    const label = this.phaseLabels[p.phase] || p.phase;
    return `${label} (Intent ${p.attempt})`;
  });

  constructor() {
    effect(() => {
      const id = this.gameId();
      if (id) {
        this.websocketService.connect(id);
        this.fetchInitialGameData(id);
      } else {
        this.websocketService.disconnect();
        this.gameStateService.setState('NONE');
      }
    });

    this.subscriptions.add(
      this.websocketService.events$.subscribe(event => {
        if (event.event === 'game_state_update') {
          this.handleStateUpdate(event.payload);
        } else if (event.event === 'game_state_updated') {
           if (event.payload && typeof event.payload === 'object' && 'state' in event.payload) {
            this.gameStateService.setState(event.payload.state as GameState);
             const id = this.gameId();
            if (id) this.fetchInitialGameData(id);
          }
        } else if (event.event === 'resync_data') {
          if (event.payload?.gameState) {
            this.handleStateUpdate(event.payload.gameState);
          }
        } else if (event.event === 'generation_progress') {
          this.handleGenerationProgress(event.payload);
        } else if (event.event === 'game_deleted') {
           this.gameApiService.setGameId(null);
           this.router.navigate(['/control-center']);
        }
      })
    );
  }

  ngOnInit(): void {
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.websocketService.disconnect();
  }

  private handleStateUpdate(payload: any): void {
    if (!payload || typeof payload !== 'object') return;

    const status = payload.status || payload.state;
    if (status) {
      this.gameStateService.setState(status as GameState);
    }

    if (payload.roundNumber !== undefined) {
      this.currentRound.set(payload.roundNumber);
    }

    if (payload.maxRounds !== undefined) {
      this.maxRounds.set(payload.maxRounds);
    }

    if (payload.difficulty !== undefined) {
      this.difficulty.set(payload.difficulty as Difficulty);
    }

    if (payload.winnerType !== undefined) {
      this.winnerType.set(payload.winnerType);
    }

    if (payload.playerStatus !== undefined) {
      this.playerStatus.set(payload.playerStatus);
    }

    if (payload.generationError !== undefined) {
      this.generationError.set(payload.generationError);
    }

    if (payload.playersCount !== undefined) {
      this.playersCount.set(payload.playersCount);
    }

    if (payload.generationPhase !== undefined) {
        this.generationProgress.set({
            phase: payload.generationPhase,
            attempt: payload.generationAttempts || 1,
            elapsedMs: 0
        });
    }

    const id = this.gameId();
    if (id && payload.type === 'STATE_CHANGE' && payload.state !== 'GENERATING') {
       this.fetchInitialGameData(id);
    }
  }

  private handleGenerationProgress(payload: any): void {
      this.generationProgress.set({
          phase: payload.phase,
          attempt: payload.attempt,
          elapsedMs: payload.elapsedMs,
          error: payload.error
      });

      if (payload.error) {
          this.generationError.set(payload.error);
      } else if (payload.phase !== 'FAILED') {
          this.generationError.set(null);
      }
  }

  private fetchInitialGameData(id: string): void {
    this.gameApiService.getGameState(id).subscribe({
      next: (response: any) => {
        if (response.success && response.data) {
          this.gameStateService.setState(response.data.state as GameState);
          this.currentRound.set(response.data.roundNumber);
          this.maxRounds.set(response.data.maxRounds);
          this.difficulty.set(response.data.difficulty);
          this.winnerType.set(response.data.winnerType);
          this.generationError.set(response.data.generationError || null);
          this.playersCount.set(response.data.playersCount || 0);
          if (response.data.playerStatus) {
            this.playerStatus.set(response.data.playerStatus);
          }
        }
      },
      error: () => {
        this.gameStateService.setState('NONE');
      }
    });

    this.gameApiService.getSolution(id).subscribe({
      next: (response: any) => {
        if (response.success && response.data) {
           if (response.data.message) {
             this.solutionStatus.set('Solution pending...');
           } else {
             this.solutionStatus.set('Solution generated ✔');
           }
        }
      },
      error: () => {
        this.solutionStatus.set('Solution pending...');
      }
    });
  }

  protected createGame(): void {
    this.loading.set(true);
    this.error.set(null);
    this.gameApiService.createGame(this.maxRounds()).subscribe({
      next: (response: any) => {
        if (!response.success) {
          this.error.set(response.error || 'Error al crear la partida');
        } else {
          this.updateDifficulty(this.difficulty());
        }
        this.loading.set(false);
      },
      error: (err: any) => {
        this.error.set('Error en el servidor al crear la partida');
        this.loading.set(false);
      }
    });
  }

  protected addPlayer(): void {
    const id = this.gameId();
    const name = this.playerName().trim();
    if (!id || !name) return;

    this.loading.set(true);
    this.error.set(null);
    this.gameApiService.joinGame(id, name).subscribe({
      next: (response: any) => {
        if (response.success) {
          this.playerName.set('');
        } else {
          this.error.set(response.error || 'Error en afegir el jugador');
        }
        this.loading.set(false);
      },
      error: (err: any) => {
        this.error.set('Error en el servidor en afegir el jugador');
        this.loading.set(false);
      }
    });
  }

  protected startGame(): void {
    const id = this.gameId();
    if (!id) return;

    this.loading.set(true);
    this.error.set(null);
    this.generationError.set(null);
    this.gameApiService.startGame(id).subscribe({
      next: (response: any) => {
        if (!response.success) {
          this.error.set(response.error || 'Error en iniciar la partida');
        }
        this.loading.set(false);
      },
      error: (err: any) => {
        this.error.set('Error en el servidor en iniciar la partida');
        this.loading.set(false);
      }
    });
  }

  protected startPlaying(): void {
    const id = this.gameId();
    if (!id) return;

    this.loading.set(true);
    this.error.set(null);
    this.gameApiService.startPlaying(id).subscribe({
      next: (response: any) => {
        if (!response.success) {
          this.error.set(response.error || 'Error en començar a jugar');
        }
        this.loading.set(false);
      },
      error: (err: any) => {
        this.error.set('Error en el servidor en començar a jugar');
        this.loading.set(false);
      }
    });
  }

  protected forceNextRound(): void {
    const id = this.gameId();
    if (!id) return;

    this.loading.set(true);
    this.error.set(null);
    this.gameApiService.forceNextRound(id).subscribe({
      next: (response: any) => {
        if (!response.success) {
          this.error.set(response.error || 'Error en forçar la següent ronda');
        }
        this.loading.set(false);
      },
      error: (err: any) => {
        this.error.set('Error en el servidor en forçar la següent ronda');
        this.loading.set(false);
      }
    });
  }

  protected cancelGame(): void {
    const id = this.gameId();
    if (!id) {
      this.gameApiService.setGameId(null);
      this.router.navigate(['/control-center']);
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.gameApiService.deleteGame(id).subscribe({
      next: (response: any) => {
        if (response.success) {
          this.router.navigate(['/control-center']);
        } else {
          this.error.set(response.error || 'Error en cancel·lar la partida');
        }
        this.loading.set(false);
      },
      error: (err: any) => {
        this.error.set('Error en el servidor en cancel·lar la partida. S\'ha resetat localment.');
        this.gameApiService.setGameId(null);
        this.router.navigate(['/control-center']);
        this.loading.set(false);
      }
    });
  }

  protected confirmForceDelete(): void {
    this.confirmationService.confirm({
      message: 'Estàs segur que vols eliminar la partida en curs? Aquesta acció no es pot desfer i afectarà a tots els jugadors.',
      header: 'Confirmació d\u0027eliminació forçada',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Confirmar',
      rejectLabel: 'Cancel·lar',
      accept: () => {
        this.forceDeleteAll();
      }
    });
  }

  private forceDeleteAll(): void {
    this.loading.set(true);
    this.error.set(null);
    this.gameApiService.deleteAllGames().subscribe({
      next: (response: any) => {
        if (response.success) {
          this.gameStateService.setState('NONE');
          this.router.navigate(['/control-center']);
        } else {
          this.error.set(response.error || 'Error en forçar l\u0027eliminació de la partida');
        }
        this.loading.set(false);
      },
      error: (err: any) => {
        this.error.set('Error en el servidor en forçar l\u0027eliminació de la partida');
        this.loading.set(false);
      }
    });
  }

  protected onPlayerNameChange(value: string): void {
    this.playerName.set(value);
  }

  protected onMaxRoundsChange(value: number): void {
    this.maxRounds.set(value);
  }

  protected onDifficultyChange(value: Difficulty): void {
    if (!value) return;
    this.difficulty.set(value);
    const id = this.gameId();
    if (id) {
      this.updateDifficulty(value);
    }
  }

  private updateDifficulty(difficulty: Difficulty): void {
    const id = this.gameId();
    if (!id) return;

    this.websocketService.emit('update_difficulty', {
      gameId: id,
      difficulty: difficulty
    });
  }

  protected copyGameLink(): void {
    const id = this.gameId();
    if (!id) return;
    const url = `${window.location.origin}/player?gameId=${id}`;
    navigator.clipboard.writeText(url).then(() => {
      this.showCopyFeedback.set(true);
      setTimeout(() => this.showCopyFeedback.set(false), 2000);
    });
  }
}
