import { ChangeDetectionStrategy, Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameApiService } from '../../services/game-api.service';

// PrimeNG imports
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';

@Component({
  selector: 'app-introduction',
  standalone: true,
  imports: [
    CommonModule,
    CardModule,
    MessageModule
  ],
  templateUrl: './introduction.component.html',
  styleUrls: [],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IntroductionComponent {
  private readonly gameApiService = inject(GameApiService);

  readonly intro = signal<string | null>(null);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly gameId = this.gameApiService.gameId;

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

  protected fetchIntro(id: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.gameApiService.getIntro(id).subscribe({
      next: (response) => {
        this.intro.set(response.intro);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Error en obtenir la introducció');
        this.loading.set(false);
      }
    });
  }
}
