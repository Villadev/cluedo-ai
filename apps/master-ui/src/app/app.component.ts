import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Subscription, interval, startWith, switchMap, of, catchError } from 'rxjs';
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
export class AppComponent implements OnInit, OnDestroy {
  private subscription?: Subscription;
  private readonly currentState = signal<string>('NONE');

  ngOnInit(): void {
    this.subscription = interval(5000).pipe(
      startWith(0),
      switchMap(() => {
        const id = this.gameApiService.gameId();
        return id ? this.gameApiService.getGameState(id).pipe(catchError(() => of(null))) : of(null);
      })
    ).subscribe(response => {
      this.currentState.set(response?.success && response.data ? response.data.state : 'NONE');
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  private readonly gameApiService = inject(GameApiService);

  // Computed menuItems that react to gameId changes
  protected readonly menuItems = computed<MenuItem[]>(() => {
    const hasGameId = !!this.gameApiService.gameId() && this.currentState() !== 'NONE';
    const state = this.currentState();
    const hasStory = hasGameId && ['PLAYER_INFO', 'PLAYING', 'FINISHED'].includes(state);
    const hasActivity = hasGameId && ['PLAYING', 'FINISHED'].includes(state);

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
        visible: hasStory
      },
      {
        label: 'Introducció',
        icon: 'pi pi-book',
        routerLink: '/introduction',
        visible: hasStory
      },
      {
        label: 'Solució',
        icon: 'pi pi-key',
        routerLink: '/solution',
        visible: state === 'FINISHED'
      },
      {
        label: 'Preguntes',
        icon: 'pi pi-question-circle',
        routerLink: '/questions',
        visible: hasActivity
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
        visible: hasActivity
      },
      { label: 'Sales d\'espera', icon: 'pi pi-sitemap', routerLink: '/lobbies' },
      { label: 'Moderació', icon: 'pi pi-shield', routerLink: '/moderation' },
      { label: 'Base de Dades', icon: 'pi pi-database', routerLink: '/database' },
      { label: 'Configuració', icon: 'pi pi-cog', routerLink: '/settings' }
    ];
  });
}
