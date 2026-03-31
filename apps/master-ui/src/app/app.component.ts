import { Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { AppLayoutComponent } from './layout/app-layout.component';
import { GameApiService } from './services/game-api.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, AppLayoutComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  private readonly gameApiService = inject(GameApiService);

  // Computed menuItems that react to gameId changes
  protected readonly menuItems = computed<MenuItem[]>(() => {
    const hasGameId = !!this.gameApiService.gameId();

    return [
      { label: 'Centre de Control', icon: 'pi pi-home', routerLink: '/control-center' },
      {
        label: 'Participants',
        icon: 'pi pi-users',
        routerLink: '/participants',
        visible: hasGameId
      },
      {
        label: 'Instruccions',
        icon: 'pi pi-info-circle',
        routerLink: '/instructions',
        visible: hasGameId
      },
      {
        label: 'Introducció',
        icon: 'pi pi-book',
        routerLink: '/introduction',
        visible: hasGameId
      },
      {
        label: 'Solució',
        icon: 'pi pi-key',
        routerLink: '/solution',
        visible: hasGameId
      },
      {
        label: 'Preguntes',
        icon: 'pi pi-question-circle',
        routerLink: '/questions',
        visible: hasGameId
      },
      {
        label: 'Depuració',
        icon: 'pi pi-cog',
        routerLink: '/debug',
        visible: hasGameId
      },
      {
        label: 'Historial',
        icon: 'pi pi-list',
        routerLink: '/timeline',
        visible: hasGameId
      },
      { label: 'Base de Dades', icon: 'pi pi-database', routerLink: '/database' }
    ];
  });
}
