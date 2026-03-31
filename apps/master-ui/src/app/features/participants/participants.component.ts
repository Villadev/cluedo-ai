import { ChangeDetectionStrategy, Component, inject, signal, effect, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameApiService, PublicPlayerView } from '../../services/game-api.service';
import { WebSocketService } from '../../services/websocket.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

// PrimeNG imports
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService } from 'primeng/api';

@Component({
  selector: 'app-participants',
  imports: [
    CommonModule,
    ButtonModule,
    CardModule,
    MessageModule,
    ConfirmDialogModule,
    TooltipModule
  ],
  providers: [ConfirmationService],
  templateUrl: './participants.component.html',
  styleUrls: [],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ParticipantsComponent {
  private readonly gameApiService = inject(GameApiService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly webSocketService = inject(WebSocketService);
  private readonly destroyRef = inject(DestroyRef);

  readonly participants = signal<PublicPlayerView[]>([]);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly gameId = this.gameApiService.gameId;
  readonly copiedId = signal<string | null>(null);

  protected copyPlayerLink(playerId: string): void {
    const gid = this.gameId();
    if (!gid) return;

    const url = `https://player-ui.onrender.com/?gameId=${gid}&participantId=${playerId}`;
    navigator.clipboard.writeText(url).then(() => {
      this.copiedId.set(playerId);
      setTimeout(() => this.copiedId.set(null), 2000);
    });
  }


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

    this.webSocketService.events$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        if (
          event.event === 'player_joined' ||
          event.event === 'game_state_update' ||
          event.event === 'game_state_updated' ||
          event.event === 'resync_data'
        ) {
          const id = this.gameId();
          if (id) {
            this.fetchParticipants(id);
          }
        }
      });
  }

  protected fetchParticipants(id: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.gameApiService.getParticipants(id).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.participants.set(response.data);
        } else {
          this.error.set(response.error || 'Error en obtenir els participants');
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Error en obtenir els participants');
        this.loading.set(false);
      }
    });
  }

  confirmDelete(player: PublicPlayerView): void {
    this.confirmationService.confirm({
      message: 'Segur que vols eliminar aquest participant de la partida?',
      header: 'Confirmació d\'eliminació',
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.deleteParticipant(player.id);
      }
    });
  }

  private deleteParticipant(userId: string): void {
    const id = this.gameId();
    if (!id) return;

    this.loading.set(true);
    this.gameApiService.deleteUser(id, userId).subscribe({
      next: (response) => {
        if (response.success) {
          this.fetchParticipants(id);
        } else {
          this.error.set(response.error || 'Error en eliminar el participant');
          this.loading.set(false);
        }
      },
      error: (err) => {
        this.error.set('Error en eliminar el participant');
        this.loading.set(false);
      }
    });
  }
}
