import { ChangeDetectionStrategy, Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameApiService, SolutionResponse } from '../../services/game-api.service';

// PrimeNG imports
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { DividerModule } from 'primeng/divider';

@Component({
  selector: 'app-solution',
  standalone: true,
  imports: [
    CommonModule,
    CardModule,
    MessageModule,
    DividerModule
  ],
  templateUrl: './solution.component.html',
  styleUrls: [],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SolutionComponent {
  private readonly gameApiService = inject(GameApiService);

  readonly solution = signal<SolutionResponse | null>(null);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly gameId = this.gameApiService.gameId;

  constructor() {
    effect(() => {
      const id = this.gameId();
      if (id) {
        this.fetchSolution(id);
      } else {
        this.solution.set(null);
        this.error.set('No hi ha cap partida activa. Per favor, crea o uneix-te a una partida primer.');
      }
    });
  }

  protected fetchSolution(id: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.gameApiService.getSolution(id).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          if (response.data.message) {
            this.error.set(response.data.message);
            this.solution.set(null);
          } else {
            this.solution.set(response.data);
          }
        } else {
          this.error.set(response.error || 'Error en obtenir la solució');
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Error en obtenir la solució. La partida encara no té una resolució disponible.');
        this.loading.set(false);
      }
    });
  }
}
