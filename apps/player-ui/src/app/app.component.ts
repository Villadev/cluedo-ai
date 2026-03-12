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

  protected menuItems: MenuItem[] = [
    { label: 'Xat', icon: 'pi pi-comments', command: () => this.navigateToGameSection('') },
    { label: 'Informació de partida', icon: 'pi pi-info-circle', command: () => this.navigateToGameSection('info') },
    { label: 'Participants', icon: 'pi pi-users', command: () => this.navigateToGameSection('participants') },
    { label: 'Acusació', icon: 'pi pi-megaphone', command: () => this.navigateToGameSection('accusation') },
    { label: 'Sortir de la partida', icon: 'pi pi-sign-out', command: () => this.leaveGame() }
  ];

  ngOnInit(): void {
    const gameId = this.sessionService.getGameId();
    const playerId = this.sessionService.getPlayerId();

    if (gameId && playerId) {
      // Restore session in GameService
      this.gameService.setSession({ gameId, playerId });

      // If we are at the root, redirect to the game chat
      if (this.router.url === '/' || this.router.url === '') {
        void this.router.navigate(['/game', gameId]);
      }
    }
  }

  private navigateToGameSection(section: string): void {
    const gameId = this.sessionService.getGameId();
    if (!gameId) {
      void this.router.navigate(['/']);
      return;
    }

    if (section === '') {
      void this.router.navigate(['/game', gameId]);
    } else {
      void this.router.navigate(['/game', gameId, section]);
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
