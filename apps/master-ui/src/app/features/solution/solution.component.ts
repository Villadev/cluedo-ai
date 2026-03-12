import { ChangeDetectionStrategy, Component, inject, signal, effect, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameApiService, SolutionResponse } from '../../services/game-api.service';

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
  styleUrls: [],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SolutionComponent implements OnDestroy {
  private readonly gameApiService = inject(GameApiService);

  readonly solution = signal<SolutionResponse | null>(null);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly gameId = this.gameApiService.gameId;
  readonly isPlaying = signal<boolean>(false);

  private utterance: SpeechSynthesisUtterance | null = null;

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

  ngOnDestroy(): void {
    this.stopNarrative();
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

  protected playNarrative(): void {
    this.stopNarrative();

    const narrative = this.solution()?.finalNarrative;
    if (!narrative) return;

    this.utterance = new SpeechSynthesisUtterance(narrative);
    this.utterance.lang = 'ca-ES';
    this.utterance.rate = 1;
    this.utterance.pitch = 1;

    this.utterance.onstart = () => {
      this.isPlaying.set(true);
    };

    this.utterance.onend = () => {
      this.isPlaying.set(false);
    };

    this.utterance.onerror = () => {
      this.isPlaying.set(false);
    };

    window.speechSynthesis.speak(this.utterance);
  }

  protected stopNarrative(): void {
    window.speechSynthesis.cancel();
    this.isPlaying.set(false);
  }
}
