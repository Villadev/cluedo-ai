import { ChangeDetectionStrategy, Component, inject, OnInit, OnDestroy, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { GameApiService, GameState, Difficulty, PlayerStatus } from '../../services/game-api.service';
import { WebSocketService } from '../../services/websocket.service';
import { GameStateService } from '../../services/game-state.service';

// PrimeNG imports
import { ButtonModule } from 'primeng/button';
import { ChatViewComponent } from "../../components/chat-view/chat-view.component";
import { InputTextModule } from 'primeng/inputtext';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { TooltipModule } from "primeng/tooltip";
import { MessagesModule } from 'primeng/messages';
import { SelectButtonModule } from 'primeng/selectbutton';

@Component({
  selector: 'app-control-center',
  standalone: true,
  imports: [
    ChatViewComponent,
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    CardModule,
    MessageModule,
    TooltipModule,
    MessagesModule,
    SelectButtonModule
  ],
  templateUrl: './control-center.component.html',
  styleUrls: [],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ControlCenterComponent implements OnInit, OnDestroy {
  protected readonly gameApiService = inject(GameApiService);
  private readonly websocketService = inject(WebSocketService);
  private readonly gameStateService = inject(GameStateService);
  private readonly router = inject(Router);
  private readonly subscriptions = new Subscription();

  readonly gameId = this.gameApiService.gameId;
  readonly playerName = signal<string>('');
  readonly maxRounds = signal<number>(5);
  readonly currentRound = signal<number>(1);
  readonly difficulty = signal<Difficulty>('hard');
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly playerStatus = signal<PlayerStatus[]>([]);

  readonly gameState = this.gameStateService.state;
  readonly winnerType = signal<string | null>(null);
  readonly solutionStatus = signal<string>('Solution pending...');
  readonly showCopyFeedback = signal<boolean>(false);

  readonly difficultyOptions = [
    { label: 'Fàcil', value: 'easy' },
    { label: 'Mitjà', value: 'medium' },
    { label: 'Difícil', value: 'hard' },
    { label: 'Extrem', value: 'extreme' }
  ];

  protected copyGameLink(): void {
    const id = this.gameId();
    if (!id) return;

    const url = `https://player-ui.onrender.com/?gameId=${id}`;
    navigator.clipboard.writeText(url).then(() => {
      this.showCopyFeedback.set(true);
      setTimeout(() => this.showCopyFeedback.set(false), 2000);
    });
  }


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

    // Always refresh for more details if needed
    const id = this.gameId();
    if (id && payload.type === 'STATE_CHANGE') {
       this.fetchInitialGameData(id);
    }
  }

  private fetchInitialGameData(id: string): void {
    this.gameApiService.getGameState(id).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.gameStateService.setState(response.data.state as GameState);
          this.currentRound.set(response.data.roundNumber);
          this.maxRounds.set(response.data.maxRounds);
          this.difficulty.set(response.data.difficulty);
          this.winnerType.set(response.data.winnerType);
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
      next: (response) => {
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
      next: (response) => {
        if (!response.success) {
          this.error.set(response.error || 'Error al crear la partida');
        } else {
          // Send initial difficulty after creation if it's not the default or just to be sure
          this.updateDifficulty(this.difficulty());
        }
        this.loading.set(false);
      },
      error: (err) => {
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
      next: (response) => {
        if (response.success) {
          this.playerName.set('');
        } else {
          this.error.set(response.error || 'Error en afegir el jugador');
        }
        this.loading.set(false);
      },
      error: (err) => {
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
    this.gameApiService.startGame(id).subscribe({
      next: (response) => {
        if (!response.success) {
          this.error.set(response.error || 'Error en iniciar la partida');
        }
        this.loading.set(false);
      },
      error: (err) => {
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
      next: (response) => {
        if (!response.success) {
          this.error.set(response.error || 'Error en començar a jugar');
        }
        this.loading.set(false);
      },
      error: (err) => {
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
      next: (response) => {
        if (!response.success) {
          this.error.set(response.error || 'Error en forçar la següent ronda');
        }
        this.loading.set(false);
      },
      error: (err) => {
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
      next: (response) => {
        if (response.success) {
          this.router.navigate(['/control-center']);
        } else {
          this.error.set(response.error || 'Error en cancel·lar la partida');
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Error en el servidor en cancel·lar la partida. S\'ha resetat localment.');
        this.gameApiService.setGameId(null);
        this.router.navigate(['/control-center']);
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
}
