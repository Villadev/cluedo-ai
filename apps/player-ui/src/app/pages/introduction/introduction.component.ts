import { ChangeDetectionStrategy, Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { GameService } from '../../services/game.service';

@Component({
  selector: 'app-introduction',
  imports: [CardModule, ButtonModule, ProgressSpinnerModule], standalone: true,
  templateUrl: './introduction.component.html',
  styleUrl: './introduction.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IntroductionComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly gameService = inject(GameService);

  protected readonly loading = signal(true);
  protected readonly introductionText = signal('');
  protected readonly error = signal('');
  protected readonly isPlaying = signal(false);

  private gameId = '';
  private utterance: SpeechSynthesisUtterance | null = null;

  ngOnInit(): void {
    this.gameId = this.route.snapshot.paramMap.get('gameId') ?? '';

    if (!this.gameId) {
      this.loading.set(false);
      this.error.set("No s'ha trobat l'identificador de la partida.");
      return;
    }

    this.gameService.getIntroduction(this.gameId).subscribe({
      next: (response) => {
        this.loading.set(false);
        if (!response.success || !response.data?.intro) {
          this.error.set(response.error ?? 'No s’ha pogut carregar la introducció.');
          return;
        }

        this.introductionText.set(response.data.intro);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('S’ha produït un error carregant la introducció.');
      }
    });
  }

  ngOnDestroy(): void {
    this.stopIntroduction();
  }

  protected playIntroduction(): void {
    if (this.isPlaying()) {
      this.stopIntroduction();
    }

    const text = this.introductionText();
    if (!text) return;

    this.utterance = new SpeechSynthesisUtterance(text);
    this.utterance.lang = 'ca-ES';
    this.utterance.rate = 1;
    this.utterance.pitch = 1;

    this.utterance.onstart = () => {
      this.isPlaying.set(true);
      this.gameService.logTimelineEvent(this.gameId, 'TTS_PLAYED', 'S\'ha reproduït la narració de la introducció.').subscribe();
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

  protected continueToGame(): void {
    this.stopIntroduction();
    sessionStorage.setItem(`intro_seen_${this.gameId}`, 'true');
    void this.router.navigate(['/game', this.gameId, 'character']);
  }
}
