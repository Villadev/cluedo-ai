import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AvatarModule } from 'primeng/avatar';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ToastModule } from 'primeng/toast';
import { forkJoin } from 'rxjs';
import { Participant } from '../../models/participant.model';
import { GameService } from '../../services/game.service';
import { SessionService } from '../../services/session.service';

@Component({
  selector: 'app-accusation',
  imports: [CardModule, ButtonModule, AvatarModule, ConfirmDialogModule, ToastModule, ProgressSpinnerModule],
  providers: [ConfirmationService, MessageService],
  templateUrl: './accusation.component.html',
  styleUrl: './accusation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AccusationComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly gameService = inject(GameService);
  private readonly sessionService = inject(SessionService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  protected readonly loading = signal(true);
  protected readonly participants = signal<Participant[]>([]);
  protected readonly canAccuse = signal(false);
  protected readonly blockedReason = signal('');
  protected readonly accusationSent = signal(false);

  private gameId = '';
  private playerId = '';

  ngOnInit(): void {
    this.gameId = this.route.snapshot.paramMap.get('gameId') ?? this.sessionService.getGameId();
    this.playerId = this.sessionService.getPlayerId();

    if (!this.gameId || !this.playerId) {
      this.loading.set(false);
      this.blockedReason.set('Falten dades de sessió per poder fer una acusació.');
      return;
    }

    forkJoin({
      participantsResponse: this.gameService.getParticipants(this.gameId),
      gameResponse: this.gameService.getGame(this.gameId)
    }).subscribe({
      next: ({ participantsResponse, gameResponse }) => {
        this.loading.set(false);

        if (!participantsResponse.success || !participantsResponse.data) {
          this.blockedReason.set(participantsResponse.error ?? 'No s’han pogut carregar els participants.');
          return;
        }

        this.participants.set(participantsResponse.data.filter((participant) => participant.id !== this.playerId));

        if (!gameResponse.success || !gameResponse.data) {
          this.blockedReason.set(gameResponse.error ?? 'No s’ha pogut validar l’estat de la partida.');
          return;
        }

        const currentPlayer = gameResponse.data.players.find((player) => player.id === this.playerId);
        if (!currentPlayer) {
          this.blockedReason.set('No s’ha trobat el teu jugador en aquesta partida.');
          return;
        }

        if (currentPlayer.isEliminated) {
          this.blockedReason.set('No pots acusar perquè estàs eliminat de la partida.');
          return;
        }

        if (currentPlayer.accusedThisRound) {
          this.blockedReason.set('Ja has fet una acusació en aquesta ronda.');
          return;
        }

        if (currentPlayer.accusationCooldown > 0) {
          this.blockedReason.set(`Has d'esperar ${currentPlayer.accusationCooldown} rondes per tornar a acusar.`);
          return;
        }

        this.canAccuse.set(true);
      },
      error: () => {
        this.loading.set(false);
        this.blockedReason.set('S’ha produït un error carregant les dades per acusar.');
      }
    });
  }

  protected confirmAccusation(participant: Participant): void {
    if (!this.canAccuse() || this.accusationSent()) {
      return;
    }

    this.confirmationService.confirm({
      message: 'Segur que vols acusar aquest personatge?',
      header: 'Confirmar acusació',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Confirmar',
      rejectLabel: 'Cancel·lar',
      accept: () => {
        this.sendAccusation(participant.id);
      }
    });
  }

  private sendAccusation(accusedId: string): void {
    this.gameService.accuse(this.gameId, this.playerId, accusedId).subscribe({
      next: (response) => {
        if (!response.success) {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: response.error ?? 'No s’ha pogut enviar l’acusació.' });
          return;
        }

        this.accusationSent.set(true);
        this.canAccuse.set(false);
        this.blockedReason.set('Ja has enviat una acusació.');
        this.messageService.add({ severity: 'success', summary: 'Acusació enviada', detail: 'La teva acusació s’ha registrat correctament.' });
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'S’ha produït un error enviant l’acusació.' });
      }
    });
  }
}
