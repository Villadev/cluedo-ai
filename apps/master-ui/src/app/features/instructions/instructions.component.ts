import { ChangeDetectionStrategy, Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameApiService } from '../../services/game-api.service';

// PrimeNG imports
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';

@Component({
  selector: 'app-instructions',
  standalone: true,
  imports: [
    CommonModule,
    CardModule,
    MessageModule
  ],
  templateUrl: './instructions.component.html',
  styleUrls: [],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class InstructionsComponent {
  private readonly gameApiService = inject(GameApiService);

  readonly instructions = signal<string | null>(null);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly gameId = this.gameApiService.gameId;

  constructor() {
    effect(() => {
      const id = this.gameId();
      if (id) {
        this.fetchInstructions(id);
      } else {
        this.instructions.set(null);
        this.error.set('No hi ha cap partida activa. Per favor, crea o uneix-te a una partida primer.');
      }
    });
  }

  protected fetchInstructions(id: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.gameApiService.getInstructions(id).subscribe({
      next: (instructions) => {
        this.instructions.set(instructions);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Error en obtenir les instruccions');
        this.loading.set(false);
      }
    });
  }
}
