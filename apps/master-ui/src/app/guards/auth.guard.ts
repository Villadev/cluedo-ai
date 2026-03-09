import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';

export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  const gameId = localStorage.getItem('gameId');

  if (gameId) {
    return true;
  }

  // If no gameId, redirect to control-center (which handles game creation)
  return router.parseUrl('/control-center');
};
