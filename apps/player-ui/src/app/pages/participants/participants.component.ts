import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { GameService } from '../../services/game.service';
import { SessionService } from '../../services/session.service';
import { PublicPlayerView } from '../../models/player.model';

@Component({
  selector: 'app-participants',
  standalone: true,
  imports: [CommonModule, CardModule, ProgressSpinnerModule, MessageModule],
  templateUrl: './participants.component.html',
  styleUrl: './participants.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ParticipantsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly gameService = inject(GameService);
  private readonly sessionService = inject(SessionService);

  protected readonly loading = signal(true);
  protected readonly participants = signal<PublicPlayerView[]>([]);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    const gameId = this.route.snapshot.paramMap.get('gameId') ?? this.sessionService.getGameId();

    if (!gameId) {
      this.loading.set(false);
      this.error.set("No hi ha cap partida activa.");
      return;
    }

    this.gameService.getParticipants(gameId).subscribe({
      next: (response) => {
        this.loading.set(true);
        if (response.success && response.data) {
          this.participants.set(response.data);
        } else {
          this.error.set(response.error || 'Error en obtenir els participants');
        }
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Error en obtenir els participants');
        this.loading.set(false);
      }
    });
  }
}
