import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { GameStatusIndicatorComponent } from '../components/game-status-indicator/game-status-indicator.component';
import { GameApiService } from '../services/game-api.service';

@Component({
  selector: 'ui-topbar',
  imports: [CommonModule, ButtonModule, GameStatusIndicatorComponent],
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.scss'
})
export class TopbarComponent {
  @Input({ required: true }) appTitle = '';
  @Output() readonly menuToggle = new EventEmitter<void>();

  private readonly gameApiService = inject(GameApiService);
  protected readonly gameId = this.gameApiService.gameId;

  protected onMenuToggle(): void {
    this.menuToggle.emit();
  }
}
