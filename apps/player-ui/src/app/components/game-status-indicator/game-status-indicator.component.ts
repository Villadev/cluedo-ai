import { ChangeDetectionStrategy, Component, Input, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
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
  private subscription?: Subscription;

  protected readonly gameState = signal<GameState | 'NONE'>('NONE');
  protected readonly statusColor = signal<string>('red');
  protected readonly statusText = signal<string>('Cap partida activa');

  ngOnInit(): void {
    this.subscription = this.gameService.gameState$.subscribe((state) => {
      this.updateStatus(state);
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  private updateStatus(state: GameState | 'NONE' | 'inactive' | 'preparation' | 'active'): void {
    switch (state) {
      case 'active':
      case 'PLAYING':
        this.gameState.set('PLAYING');
        this.statusColor.set('green');
        this.statusText.set('Partida en curs');
        break;
      case 'preparation':
      case 'LOBBY':
      case 'READY':
        this.gameState.set('READY');
        this.statusColor.set('orange');
        this.statusText.set('Preparant partida');
        break;
      case 'FINISHED':
        this.gameState.set('FINISHED');
        this.statusColor.set('blue');
        this.statusText.set('Partida finalitzada');
        break;
      case 'inactive':
      case 'NONE':
      default:
        this.gameState.set('NONE');
        this.statusColor.set('red');
        this.statusText.set('Sessió invàlida o sense partida');
        break;
    }
  }
}
