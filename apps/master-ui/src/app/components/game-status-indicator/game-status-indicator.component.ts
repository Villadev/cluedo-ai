import { ChangeDetectionStrategy, Component, Input, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameStateService } from '../../services/game-state.service';
import { TooltipModule } from 'primeng/tooltip';

@Component({
  selector: 'app-game-status-indicator',
  standalone: true,
  imports: [CommonModule, TooltipModule],
  templateUrl: './game-status-indicator.component.html',
  styleUrl: './game-status-indicator.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GameStatusIndicatorComponent {
  @Input({ required: true }) gameId!: string;

  private readonly gameStateService = inject(GameStateService);

  private readonly statusMap: Record<string, { label: string, color: string }> = {
    LOBBY: { label: 'Esperant jugadors', color: '#9e9e9e' },
    GENERATING: { label: 'Generant cas...', color: '#ff9800' },
    PLAYER_INFO: { label: 'Revelant personatges', color: '#ffc107' },
    PLAYING: { label: 'En joc', color: '#4caf50' },
    FINISHED: { label: 'Partida finalitzada', color: '#f44336' },
    NONE: { label: 'Sense partida activa', color: '#9e9e9e' }
  };

  protected readonly status = computed(() => {
    const state = this.gameStateService.state();
    return this.statusMap[state] || { label: state, color: '#9e9e9e' };
  });

  protected readonly statusColor = computed(() => this.status().color);
  protected readonly statusText = computed(() => this.status().label);
}
