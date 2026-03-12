import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { GameService } from '../../services/game.service';
import { SessionService } from '../../services/session.service';

@Component({
  selector: 'app-instructions',
  standalone: true,
  imports: [CommonModule, CardModule, ProgressSpinnerModule],
  templateUrl: './instructions.component.html',
  styleUrl: './instructions.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class InstructionsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly gameService = inject(GameService);
  private readonly sessionService = inject(SessionService);

  protected readonly loading = signal(true);
  protected readonly instructions = signal<string | null>(null);
  protected readonly error = signal('');

  ngOnInit(): void {
    const gameId = this.route.snapshot.paramMap.get('gameId') ?? this.sessionService.getGameId();

    if (!gameId) {
      this.loading.set(false);
      this.error.set("No hi ha cap partida activa.");
      return;
    }

    this.gameService.getInstructions(gameId).subscribe({
      next: (response) => {
        this.loading.set(false);
        if (response.success && response.data) {
          this.instructions.set(response.data);
        } else {
          this.error.set(response.error ?? 'No s’ha pogut carregar les instruccions.');
        }
      },
      error: () => {
        this.loading.set(false);
        this.error.set('S’ha produït un error carregant les instruccions.');
      }
    });
  }
}
