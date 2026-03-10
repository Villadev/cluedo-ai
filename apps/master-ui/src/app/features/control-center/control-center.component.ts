import { ChangeDetectionStrategy, Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { GameApiService } from '../../services/game-api.service';

// PrimeNG imports
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
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
    MessagesModule
  ],
  templateUrl: './control-center.component.html',
  styleUrls: [],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ControlCenterComponent implements OnInit, OnDestroy {
  protected readonly gameApiService = inject(GameApiService);
  private readonly router = inject(Router);

  readonly gameId = this.gameApiService.gameId;
  readonly playerName = signal<string>('');
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  readonly currentStatus = signal<{ state: string; color: string }>({ state: 'No Active Game', color: 'red' });
  private pollInterval?: any;

  ngOnInit(): void {
    this.startPolling();
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  private startPolling(): void {
    this.updateStatus();
    this.pollInterval = setInterval(() => this.updateStatus(), 5000);
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }

  private updateStatus(): void {
    const id = this.gameId();
    if (!id) {
      this.currentStatus.set({ state: 'No Active Game', color: 'red' });
      return;
    }

    this.gameApiService.getGameState(id).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          const state = response.data.state;
          let color = 'red';
          if (state === 'READY') color = 'orange';
          else if (state === 'PLAYING') color = 'green';
          else if (state === 'LOBBY') color = 'orange'; // Added LOBBY as orange as well since it is active

          this.currentStatus.set({ state, color });
        }
      },
      error: () => {
        this.currentStatus.set({ state: 'Error Polling', color: 'red' });
      }
    });
  }

  protected createGame(): void {
    this.loading.set(true);
    this.error.set(null);
    this.gameApiService.createGame().subscribe({
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
}
