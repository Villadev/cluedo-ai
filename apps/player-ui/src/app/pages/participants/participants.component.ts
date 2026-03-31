import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';
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

    this.loading.set(true);

    forkJoin({
      game: this.gameService.getGame(this.gameId, currentPlayerId),
      participants: this.gameService.getParticipants(this.gameId)
    }).subscribe({
      next: (results) => {
        if (results.game.success && results.game.data) {
          this.assassinId.set(results.game.data.assassinId || null);
          this.gameStateService.setState(results.game.data.state);
          console.log('[DEBUG] Game state loaded. assassinId=', results.game.data.assassinId);
        }

        if (results.participants.success && results.participants.data) {
          this.participants.set(results.participants.data);
          console.log('[DEBUG] Participants loaded:', results.participants.data.length);
        } else {
          this.error.set(results.participants.error || 'Error en obtenir els participants');
        }
        this.loading.set(false);
      },
      error: (err) => {
        console.error('[DEBUG] Error loading data:', err);
        this.error.set('Error en carregar les dades de la partida');
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
