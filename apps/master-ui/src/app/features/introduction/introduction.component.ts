import { ChangeDetectionStrategy, Component, inject, signal, effect, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameApiService } from '../../services/game-api.service';

// PrimeNG imports
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-introduction',
  standalone: true,
  imports: [
    CommonModule,
    CardModule,
    MessageModule,
    ButtonModule
  ],
  templateUrl: './introduction.component.html',
  styleUrls: [],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IntroductionComponent implements OnDestroy {
  private readonly gameApiService = inject(GameApiService);

  readonly intro = signal<string | null>(null);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly gameId = this.gameApiService.gameId;
  readonly isPlaying = signal<boolean>(false);

  private utterance: SpeechSynthesisUtterance | null = null;

  constructor() {
    effect(() => {
      const id = this.gameId();
      if (id) {
        this.fetchIntro(id);
      } else {
        this.intro.set(null);
        this.error.set('No hi ha cap partida activa. Per favor, crea o uneix-te a una partida primer.');
      }
    });
  }

  ngOnDestroy(): void {
    this.stopIntroduction();
  }

  protected fetchIntro(id: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.gameApiService.getIntro(id).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.intro.set(response.data.intro);
        } else {
          this.error.set(response.error || 'Error en obtenir la introducció');
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Error en obtenir la introducció');
        this.loading.set(false);
      }
    });
  }

  protected playIntroduction(): void {
    this.stopIntroduction();

    const text = this.intro();
    if (!text) return;

    this.utterance = new SpeechSynthesisUtterance(text);
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

  protected stopIntroduction(): void {
    window.speechSynthesis.cancel();
    this.isPlaying.set(false);
  }
}
