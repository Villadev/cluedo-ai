import { ChangeDetectionStrategy, Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameApiService, PublicPlayerView } from '../../services/game-api.service';

// PrimeNG imports
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';

@Component({
  selector: 'app-participants',
  standalone: true,
  imports: [
    CommonModule,
    ButtonModule,
    CardModule,
    MessageModule
  ],
  templateUrl: './participants.component.html',
  styleUrls: [],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ParticipantsComponent {
  private readonly gameApiService = inject(GameApiService);

  readonly participants = signal<PublicPlayerView[]>([]);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly gameId = this.gameApiService.gameId;

  constructor() {
    effect(() => {
      const id = this.gameId();
      if (id) {
        this.fetchParticipants(id);
      } else {
        this.participants.set([]);
        this.error.set('No hi ha cap partida activa. Per favor, crea o uneix-te a una partida primer.');
      }
    });
  }

  protected fetchParticipants(id: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.gameApiService.getGame(id).subscribe({
      next: (game) => {
        this.participants.set(game.players);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Error en obtenir els participants');
        this.loading.set(false);
      }
    });
  }

  protected deleteParticipant(userId: string): void {
    const id = this.gameId();
    if (!id) return;

    this.loading.set(true);
    this.error.set(null);
    this.gameApiService.deleteUser(id, userId).subscribe({
      next: (response) => {
        if (response.success && response.gameState) {
          this.participants.set(response.gameState.players);
        } else {
          this.error.set(response.error || 'Error en eliminar el participant');
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Error en el servidor en eliminar el participant');
        this.loading.set(false);
      }
    });
  }
}
