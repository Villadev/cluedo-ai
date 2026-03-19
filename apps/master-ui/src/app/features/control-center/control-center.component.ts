import { ChangeDetectionStrategy, Component, inject, OnInit, OnDestroy, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { GameApiService, GameState } from '../../services/game-api.service';
import { WebSocketService } from '../../services/websocket.service';
import { GameStateService } from '../../services/game-state.service';

// PrimeNG imports
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { TooltipModule } from "primeng/tooltip";
import { MessagesModule } from 'primeng/messages';

@Component({
  selector: 'app-control-center',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    CardModule,
    MessageModule,
    TooltipModule,
    MessagesModule
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
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  readonly gameState = this.gameStateService.state;
  readonly winnerType = signal<string | null>(null);
  readonly solutionStatus = signal<string>('Solution pending...');
  readonly showCopyFeedback = signal<boolean>(false);

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
          if (event.payload && typeof event.payload === 'object' && 'status' in event.payload) {
            this.gameStateService.setState(event.payload.status as GameState);
            // Re-fetch to get more details if needed
            const id = this.gameId();
            if (id) this.fetchInitialGameData(id);
          }
        } else if (event.event === 'game_state_updated') {
           if (event.payload && typeof event.payload === 'object' && 'state' in event.payload) {
            this.gameStateService.setState(event.payload.state as GameState);
             const id = this.gameId();
            if (id) this.fetchInitialGameData(id);
          }
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

  private fetchInitialGameData(id: string): void {
    this.gameApiService.getGameState(id).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.gameStateService.setState(response.data.state as GameState);
          this.currentRound.set(response.data.roundNumber);
          this.maxRounds.set(response.data.maxRounds);
          this.winnerType.set(response.data.winnerType);
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

  protected cancelGame(): void {
    const id = this.gameId();
    if (!id) {
      this.gameApiService.setGameId(null);
      this.router.navigate(['/control-center']);
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.gameApiService.resetGame(id).subscribe({
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
}
