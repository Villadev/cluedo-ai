import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { GameService } from '../../services/game.service';
import { SessionService } from '../../services/session.service';
import { GameStateService } from '../../services/game-state.service';
import { PublicPlayerView } from '../../models/player.model';
import { CoartadaComponent } from '../../components/coartada/coartada.component';

@Component({
  selector: 'app-participants',
  standalone: true,
  imports: [CommonModule, CardModule, ProgressSpinnerModule, MessageModule, TagModule, ButtonModule, CoartadaComponent],
  templateUrl: './participants.component.html',
  styleUrl: './participants.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ParticipantsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly gameService = inject(GameService);
  private readonly sessionService = inject(SessionService);
  private readonly gameStateService = inject(GameStateService);

  protected readonly loading = signal(true);
  protected readonly participants = signal<PublicPlayerView[]>([]);
  protected readonly assassinId = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly gameState = this.gameStateService.state;

  private gameId = '';

  ngOnInit(): void {
    this.gameId = this.route.snapshot.paramMap.get('gameId') ?? this.sessionService.getGameId();
    const currentPlayerId = this.sessionService.getPlayerId();

    console.log('[DEBUG] ParticipantsComponent: gameId=', this.gameId, 'currentPlayerId=', currentPlayerId);

    if (!this.gameId) {
      this.loading.set(false);
      this.error.set("No hi ha cap partida activa.");
      return;
    }

    this.gameService.getGame(this.gameId, currentPlayerId).subscribe({
      next: (response) => {
        this.loading.set(true);
        if (response.success && response.data) {
          this.participants.set(response.data.players);
          this.assassinId.set(response.data.assassinId || null);
          this.gameStateService.setState(response.data.state);

          console.log('[DEBUG] Game state loaded. assassinId=', response.data.assassinId);
          const me = response.data.players.find(p => p.id === currentPlayerId);
          console.log('[DEBUG] Current player info:', me);
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

  protected isCurrentPlayer(playerId: string): boolean {
    return this.gameService.isCurrentPlayer(playerId);
  }

  protected goToGame(): void {
    if (this.gameId) {
      void this.router.navigate(['/game', this.gameId]);
    }
  }
}
