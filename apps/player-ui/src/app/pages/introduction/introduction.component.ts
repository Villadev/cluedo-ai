import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
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
export class IntroductionComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly gameService = inject(GameService);

  protected readonly loading = signal(true);
  protected readonly introductionText = signal('');
  protected readonly error = signal('');

  private gameId = '';

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

  protected continueToGame(): void {
    void this.router.navigate(['/game', this.gameId]);
  }
}
