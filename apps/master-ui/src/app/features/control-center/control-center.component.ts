import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GameApiService } from '../../services/game-api.service';

@Component({
  selector: 'app-control-center',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './control-center.component.html',
  styleUrls: [],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ControlCenterComponent implements OnInit {
  private readonly gameApiService = inject(GameApiService);

  readonly gameId = signal<string | null>(null);
  readonly playerName = signal<string>('');
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    const savedGameId = localStorage.getItem('gameId');
    if (savedGameId) {
      this.gameId.set(savedGameId);
    }
  }

  createGame(): void {
    this.loading.set(true);
    this.error.set(null);
    this.gameApiService.createGame().subscribe({
      next: (response) => {
        if (response.success && response.gameState?.id) {
          const id = response.gameState.id;
          this.gameId.set(id);
          localStorage.setItem('gameId', id);
        } else {
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

  addPlayer(): void {
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

  setReady(): void {
    const id = this.gameId();
    if (!id) return;

    this.loading.set(true);
    this.error.set(null);
    this.gameApiService.setGameReady(id).subscribe({
      next: (response) => {
        if (!response.success) {
          this.error.set(response.error || 'Error en posar la partida en ready');
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Error en el servidor en posar la partida en ready');
        this.loading.set(false);
      }
    });
  }

  cancelGame(): void {
    const id = this.gameId();
    if (!id) {
      this.resetLocalState();
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.gameApiService.resetGame(id).subscribe({
      next: (response) => {
        if (response.success) {
          this.resetLocalState();
        } else {
          this.error.set(response.error || 'Error en cancel·lar la partida');
        }
        this.loading.set(false);
      },
      error: (err) => {
        // Even if there is a server error, we should probably reset locally if requested
        this.error.set('Error en el servidor en cancel·lar la partida. S\'ha resetat localment.');
        this.resetLocalState();
        this.loading.set(false);
      }
    });
  }

  private resetLocalState(): void {
    localStorage.removeItem('gameId');
    this.gameId.set(null);
    this.playerName.set('');
  }

  onPlayerNameChange(value: string): void {
    this.playerName.set(value);
  }
}
