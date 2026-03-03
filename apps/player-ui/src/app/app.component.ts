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
    { label: 'Dashboard', icon: 'pi pi-home', routerLink: '/dashboard' },
    { label: 'Cases', icon: 'pi pi-briefcase', routerLink: '/cases' },
    { label: 'Evidence', icon: 'pi pi-file', routerLink: '/evidence' },
    { label: 'Settings', icon: 'pi pi-cog', routerLink: '/settings' }
  ];
}
