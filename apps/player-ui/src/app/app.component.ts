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
    { label: 'Dashboard', icon: '🕵️', active: true },
    { label: 'Cases', icon: '🗂️' },
    { label: 'Evidence', icon: '🧩' },
    { label: 'Settings', icon: '⚙️' }
  ];
}
