import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { AppLayoutComponent } from '@cluedo/ui-layout';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, AppLayoutComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  protected readonly menuItems: MenuItem[] = [
    { label: 'Control Center', icon: 'pi pi-home', routerLink: '/dashboard' },
    { label: 'Lobbies', icon: 'pi pi-sitemap', routerLink: '/lobbies' },
    { label: 'Moderation', icon: 'pi pi-shield', routerLink: '/moderation' },
    { label: 'Settings', icon: 'pi pi-cog', routerLink: '/settings' }
  ];
}
