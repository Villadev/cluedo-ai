import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { DividerModule } from 'primeng/divider';
import { RippleModule } from 'primeng/ripple';

@Component({
  selector: 'ui-sidebar',
  standalone: true,
  imports: [DividerModule, RouterLink, RouterLinkActive, RippleModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent {
  @Input({ required: true }) menuItems: MenuItem[] = [];
  @Output() readonly menuItemClick = new EventEmitter<void>();

  protected onMenuItemClick(): void {
    this.menuItemClick.emit();
  }
}
