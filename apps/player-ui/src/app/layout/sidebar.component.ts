import { Component, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MenuItem, MenuItemCommandEvent } from 'primeng/api';
import { DividerModule } from 'primeng/divider';
import { RippleModule } from 'primeng/ripple';

@Component({
  selector: 'ui-sidebar',
  imports: [DividerModule, RouterLink, RouterLinkActive, RippleModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent {
  readonly menuItems = input.required<MenuItem[]>();
  readonly menuItemClick = output<void>();

  protected onMenuItemSelected(item: MenuItem): void {
    if (item.command) {
      item.command({ item } as MenuItemCommandEvent);
    }
    this.menuItemClick.emit();
  }
}
