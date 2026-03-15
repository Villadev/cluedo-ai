import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';
import { GameService } from '../../services/game.service';
import { SessionService } from '../../services/session.service';
import { PublicPlayerView } from '../../models/player.model';
import { CoartadaComponent } from '../../components/coartada/coartada.component';

@Component({
  selector: 'app-player-character',
  standalone: true,
  imports: [
    CommonModule,
    CardModule,
    ButtonModule,
    ProgressSpinnerModule,
    MessageModule,
    TagModule,
    CoartadaComponent
  ],
  templateUrl: './player-character.component.html',
  styleUrl: './player-character.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PlayerCharacterComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly gameService = inject(GameService);
  private readonly sessionService = inject(SessionService);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly currentPlayer = signal<PublicPlayerView | null>(null);
  protected readonly assassinId = signal<string | null>(null);

  private gameId = '';

  ngOnInit(): void {
    this.gameId = this.route.snapshot.paramMap.get('gameId') ?? this.sessionService.getGameId() ?? '';
    const playerId = this.sessionService.getPlayerId();

    if (!this.gameId || !playerId) {
      this.loading.set(false);
      this.error.set('No s’ha pogut carregar la informació de la partida.');
      return;
    }

    this.gameService.getGame(this.gameId, playerId).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          const me = response.data.players.find(p => p.id === playerId);
          if (me) {
            this.currentPlayer.set(me);
            this.assassinId.set(response.data.assassinId || null);
          } else {
            this.error.set('No s’ha trobat el teu jugador a la partida.');
          }
        } else {
          this.error.set(response.error || 'Error en carregar les dades del personatge.');
        }
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Error en connectar amb el servidor.');
        this.loading.set(false);
      }
    });
  }

  protected continueToChat(): void {
    void this.router.navigate(['/game', this.gameId]);
  }
}
