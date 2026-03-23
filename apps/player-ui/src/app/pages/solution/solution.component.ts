import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { GameService } from '../../services/game.service';
import { GameResult } from '../../models/player.model';

// PrimeNG imports
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { DividerModule } from 'primeng/divider';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-solution',
  standalone: true,
  imports: [
    CommonModule,
    CardModule,
    MessageModule,
    DividerModule,
    ButtonModule
  ],
  templateUrl: './solution.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SolutionComponent implements OnInit {
  private readonly gameService = inject(GameService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly result = signal<GameResult | null>(null);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  gameId = '';

  ngOnInit(): void {
    this.gameId = this.route.snapshot.paramMap.get('gameId') || '';
    if (this.gameId) {
      this.fetchGameData();
    } else {
      this.error.set('No s\'ha trobat l\'ID de la partida.');
    }
  }

  private fetchGameData(): void {
    this.loading.set(true);
    this.gameService.getGame(this.gameId).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          if (response.data.state === 'FINISHED' && response.data.result) {
            this.result.set(response.data.result);
          } else if (response.data.state !== 'FINISHED') {
            this.error.set('La partida encara no ha finalitzat.');
          } else {
            this.error.set('No s\'ha trobat la resolució de la partida.');
          }
        } else {
          this.error.set(response.error || 'Error en obtenir la informació de la partida.');
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Error de connexió en obtenir la resolució.');
        this.loading.set(false);
      }
    });
  }

  protected goBack(): void {
    void this.router.navigate(['/game', this.gameId]);
  }
}
