import { Routes } from '@angular/router';
import { playerSessionGuard } from './guards/player-session.guard';

export const appRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/join-game/join-game-page.component').then((m) => m.JoinGamePageComponent)
  },
  {
    path: 'game/:gameId/introduction',
    canActivate: [playerSessionGuard],
    loadComponent: () => import('./pages/introduction/introduction.component').then((m) => m.IntroductionComponent)
  },
  {
    path: 'game/:gameId/info',
    canActivate: [playerSessionGuard],
    loadComponent: () => import('./pages/game-info/game-info.component').then((m) => m.GameInfoComponent)
  },
  {
    path: 'game/:gameId/participants',
    canActivate: [playerSessionGuard],
    loadComponent: () => import('./pages/participants/participants.component').then((m) => m.ParticipantsComponent)
  },
  {
    path: 'game/:gameId/accusation',
    canActivate: [playerSessionGuard],
    loadComponent: () => import('./pages/accusation/accusation.component').then((m) => m.AccusationComponent)
  },
  {
    path: 'game/:gameId',
    canActivate: [playerSessionGuard],
    loadComponent: () => import('./pages/game/game-page.component').then((m) => m.GamePageComponent)
  },
  { path: '**', redirectTo: '' }
];
