import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { GameStatusIndicatorComponent } from '../components/game-status-indicator/game-status-indicator.component';
import { SessionService } from '../services/session.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'ui-topbar',
  standalone: true,
  imports: [CommonModule, ButtonModule, GameStatusIndicatorComponent],
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.scss'
})
export class TopbarComponent {
  @Input({ required: true }) appTitle = '';
  @Output() readonly menuToggle = new EventEmitter<void>();

  private readonly sessionService = inject(SessionService);
  protected readonly gameId = this.sessionService.getGameId();

  protected onMenuToggle(): void {
    this.menuToggle.emit();
  }
}
