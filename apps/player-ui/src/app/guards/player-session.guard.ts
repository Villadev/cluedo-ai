import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from '../services/session.service';

export const playerSessionGuard: CanActivateFn = (route) => {
  const sessionService = inject(SessionService);
  const router = inject(Router);

  const routeGameId = route.paramMap.get('gameId') ?? '';
  if (routeGameId) {
    return true;
  }

  if (sessionService.hasSession()) {
    return true;
  }

  return router.createUrlTree(['/']);
};
