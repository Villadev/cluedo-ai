import { Routes } from '@angular/router';
import { playerSessionGuard } from './guards/player-session.guard';

export const appRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/join-game/join-game-page.component').then((m) => m.JoinGamePageComponent)
  },
  {
    path: 'game/:gameId',
    canActivate: [playerSessionGuard],
    loadComponent: () => import('./pages/game/game-page.component').then((m) => m.GamePageComponent)
  },
  { path: '**', redirectTo: '' }
];
