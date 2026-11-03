import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { AuthService } from './auth.service';

// Les `inject()` doivent précéder tout `await` : après, on sort du contexte d'injection (NG0203).

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.restore();
  return auth.isLoggedIn() ? true : router.createUrlTree(['/connexion']);
};

export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.restore();
  return auth.isLoggedIn() ? router.createUrlTree(['/app/aujourdhui']) : true;
};
