import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { catchError, of } from 'rxjs';
import { AppLayoutComponent } from './layout/app-layout.component';
import { GameService } from './services/game.service';
import { SessionService } from './services/session.service';
import { WebSocketService } from './services/websocket.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, AppLayoutComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly gameService = inject(GameService);
  private readonly sessionService = inject(SessionService);
  private readonly websocketService = inject(WebSocketService);

  protected readonly menuItems: MenuItem[] = [
    { label: 'Inici', icon: 'pi pi-home', routerLink: '/' },
    { label: 'Sortir de la partida', icon: 'pi pi-sign-out', command: () => this.leaveGame() }
  ];

  ngOnInit(): void {
    const gameId = this.sessionService.getGameId();
    const playerId = this.sessionService.getPlayerId();

    if (gameId && playerId && this.router.url === '/') {
      void this.router.navigate(['/game', gameId], {
        queryParams: { playerId }
      });
    }
  }

  private leaveGame(): void {
    const gameId = this.sessionService.getGameId();
    const playerId = this.sessionService.getPlayerId();

    const cleanup = (): void => {
      this.sessionService.clearSession();
      this.websocketService.disconnect();
      void this.router.navigate(['/']);
    };

    if (!gameId || !playerId) {
      cleanup();
      return;
    }

    this.gameService
      .leaveGame(gameId, playerId)
      .pipe(
        catchError(() => of({ success: false }))
      )
      .subscribe(() => {
        cleanup();
      });
  }
}
