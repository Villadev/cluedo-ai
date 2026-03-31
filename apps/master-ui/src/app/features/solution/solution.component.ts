import { ChangeDetectionStrategy, Component, inject, signal, effect, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameApiService, SolutionResponse, GameStateInfo } from '../../services/game-api.service';

// PrimeNG imports
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { DividerModule } from 'primeng/divider';
import { ButtonModule } from 'primeng/button';
import { ProgressBarModule } from 'primeng/progressbar';

@Component({
  selector: 'app-solution',
  imports: [
    CommonModule,
    CardModule,
    MessageModule,
    DividerModule,
    ButtonModule,
    ProgressBarModule
  ],
  templateUrl: './solution.component.html',
  styleUrls: [],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SolutionComponent implements OnDestroy {
  private readonly gameApiService = inject(GameApiService);

  readonly solution = signal<SolutionResponse | null>(null);
  readonly gameState = signal<GameStateInfo | null>(null);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly gameId = this.gameApiService.gameId;
  readonly isPlaying = signal<boolean>(false);

  private utterance: SpeechSynthesisUtterance | null = null;
  private refreshInterval: any;

  constructor() {
    effect(() => {
      const id = this.gameId();
      if (id) {
        this.fetchSolution(id);
        this.fetchGameState(id);
        this.startPolling(id);
      } else {
        this.stopPolling();
        this.solution.set(null);
        this.gameState.set(null);
        this.error.set('No hi ha cap partida activa. Per favor, crea o uneix-te a una partida primer.');
      }
    });
  }

  ngOnDestroy(): void {
    this.stopNarrative();
    this.stopPolling();
  }

  private startPolling(id: string): void {
    this.stopPolling();
    this.refreshInterval = setInterval(() => {
      this.fetchSolution(id);
      this.fetchGameState(id);
    }, 5000);
  }

  private stopPolling(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  protected fetchGameState(id: string): void {
    this.gameApiService.getGameState(id).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.gameState.set(response.data);
        }
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
            // Only set error if we don't have a solution yet
            if (!this.solution()) {
                this.error.set(response.data.message);
            }
            this.solution.set(null);
          } else {
            this.solution.set(response.data);
            this.error.set(null);
            // Keep polling until done or narratives complete
            if (this.gameState()?.generationPhase === "DONE") {
              this.stopPolling();
            }
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

  protected getProgressValue(): number {
    const phase = this.gameState()?.generationPhase;
    switch (phase) {
      case 'SKELETON': return 20;
      case 'CHARACTERS': return 40;
      case 'NARRATIVES': return 60;
      case 'CLUES': return 80;
      case 'RECOVERY': return 90;
      case 'DONE': return 100;
      default: return 0;
    }
  }
}
