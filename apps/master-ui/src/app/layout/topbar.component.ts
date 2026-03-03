import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'ui-topbar',
  standalone: true,
  imports: [ButtonModule],
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.scss'
})
export class TopbarComponent {
  @Input({ required: true }) appTitle = '';
  @Output() readonly menuToggle = new EventEmitter<void>();

  protected onMenuToggle(): void {
    this.menuToggle.emit();
  }
}
