import { Component } from '@angular/core';
import { UiAppShellComponent } from '@cluedo/ui-core';
import { UiDashboardPageComponent } from '@cluedo/ui-core';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [UiAppShellComponent, UiDashboardPageComponent],
  templateUrl: './app.component.html'
})
export class AppComponent {
  protected readonly navItems = [
    { label: 'Master Board', icon: '🎩', active: true },
    { label: 'Rooms', icon: '🏛️' },
    { label: 'Rules', icon: '📜' },
    { label: 'Audit', icon: '🔍' }
  ];
}
