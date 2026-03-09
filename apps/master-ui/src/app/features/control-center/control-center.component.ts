import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
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
export class ControlCenterComponent implements OnInit {
  protected readonly gameApiService = inject(GameApiService);
  private readonly router = inject(Router);

  readonly gameId = this.gameApiService.gameId;
  readonly playerName = signal<string>('');
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    // El gameId ja està sincronitzat amb el servei
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

  protected setReady(): void {
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
