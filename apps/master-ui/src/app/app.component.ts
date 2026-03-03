import { Component } from '@angular/core';
import { AppShellComponent } from './layout/app-shell.component';
import { DashboardPageComponent } from './pages/dashboard/dashboard-page.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [AppShellComponent, DashboardPageComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  protected readonly navItems = [
    { label: 'Control Center', icon: '🎛️', active: true },
    { label: 'Lobbies', icon: '🧭' },
    { label: 'Moderation', icon: '🛡️' },
    { label: 'Settings', icon: '⚙️' }
  ];
}
