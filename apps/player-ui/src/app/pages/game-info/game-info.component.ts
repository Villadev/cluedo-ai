import { ChangeDetectionStrategy, Component, OnInit, inject, signal, computed } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { PanelModule } from 'primeng/panel';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { GameService } from '../../services/game.service';
import { SessionService } from '../../services/session.service';
import { PublicGameView } from '../../models/player.model';

@Component({
  selector: 'app-game-info',
  standalone: true,
  imports: [CommonModule, CardModule, PanelModule, ProgressSpinnerModule],
  templateUrl: './game-info.component.html',
  styleUrl: './game-info.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GameInfoComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly gameService = inject(GameService);
  private readonly sessionService = inject(SessionService);

  protected readonly loading = signal(true);
  protected readonly game = signal<PublicGameView | null>(null);
  protected readonly error = signal('');
  protected playerId = '';

  protected readonly currentPlayer = computed(() => {
    const g = this.game();
    if (!g || !this.playerId) return null;
    return g.players.find(p => p.id === this.playerId) || null;
  });

  ngOnInit(): void {
    const gameId = this.route.snapshot.paramMap.get('gameId') ?? this.sessionService.getGameId();
    this.playerId = this.sessionService.getPlayerId();

    if (!gameId) {
      this.loading.set(false);
      this.error.set("No s'ha trobat l'identificador de la partida.");
      return;
    }

    this.gameService.getGame(gameId, this.playerId).subscribe({
      next: (response) => {
        this.loading.set(false);
        if (response.success && response.data) {
          this.game.set(response.data);
        } else {
          this.error.set(response.error ?? 'No s’ha pogut carregar la informació de la partida.');
        }
      },
      error: () => {
        this.loading.set(false);
        this.error.set('S’ha produït un error carregant la informació.');
      }
    });
  }
}
