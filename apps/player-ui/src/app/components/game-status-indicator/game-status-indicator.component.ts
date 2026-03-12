import { ChangeDetectionStrategy, Component, Input, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { interval, Subscription, switchMap, startWith, catchError, of } from 'rxjs';
import { GameService } from '../../services/game.service';
import { GameState } from '../../models/player.model';
import { TooltipModule } from 'primeng/tooltip';

@Component({
  selector: 'app-game-status-indicator',
  standalone: true,
  imports: [CommonModule, TooltipModule],
  templateUrl: './game-status-indicator.component.html',
  styleUrl: './game-status-indicator.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GameStatusIndicatorComponent implements OnInit, OnDestroy {
  @Input({ required: true }) gameId!: string;

  private readonly gameService = inject(GameService);
  private pollingSubscription?: Subscription;

  protected readonly gameState = signal<GameState | 'NONE'>('NONE');
  protected readonly statusColor = signal<string>('red');
  protected readonly statusText = signal<string>('Cap partida activa');

  ngOnInit(): void {
    this.startPolling();
  }

  ngOnDestroy(): void {
    this.pollingSubscription?.unsubscribe();
  }

  private startPolling(): void {
    this.pollingSubscription = interval(5000)
      .pipe(
        startWith(0),
        switchMap(() => this.gameService.getGameState(this.gameId).pipe(
          catchError(() => of({ success: false, data: null }))
        ))
      )
      .subscribe((response) => {
        if (response.success && response.data) {
          this.updateStatus(response.data.state);
        } else {
          this.updateStatus('NONE');
        }
      });
  }

  private updateStatus(state: GameState | 'NONE'): void {
    this.gameState.set(state);

    switch (state) {
      case 'PLAYING':
        this.statusColor.set('green');
        this.statusText.set('Partida en curs');
        break;
      case 'LOBBY':
      case 'READY':
        this.statusColor.set('orange');
        this.statusText.set('Preparant partida');
        break;
      case 'FINISHED':
        this.statusColor.set('blue');
        this.statusText.set('Partida finalitzada');
        break;
      default:
        this.statusColor.set('red');
        this.statusText.set('Sessió invàlida o sense partida');
        break;
    }
  }
}
