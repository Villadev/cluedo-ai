import { Component } from '@angular/core';
import { UiDashboardPageComponent } from './shared/components/dashboard-page.component';
import { UiAppShellComponent } from './shared/layout/app-shell.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [UiAppShellComponent, UiDashboardPageComponent],
  templateUrl: './app.component.html'
})
export class AppComponent {
  protected readonly navItems = [
    { label: 'Dashboard', icon: '🕵️', active: true },
    { label: 'Cases', icon: '🗂️' },
    { label: 'Evidence', icon: '🧩' },
    { label: 'Settings', icon: '⚙️' }
  ];
}
