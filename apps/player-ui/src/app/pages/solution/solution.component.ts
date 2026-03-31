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
    this.gameService.getSolution(this.gameId).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          if (response.data.message) {
            this.error.set(response.data.message);
          } else {
            // Map backend GameSolution to GameResult if necessary, or just set it
            const sol = response.data;
            this.result.set({
              winner: 'INVESTIGATORS', // Simplified for player view
              killer: sol.assassin,
              weapon: sol.weapon,
              location: sol.location,
              finalNarrative: sol.finalNarrative
            });
          }
        } else {
          this.error.set(response.error || 'Error en obtenir la solució de la partida.');
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
