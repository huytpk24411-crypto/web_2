import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth-service';
export const AuthGuard: CanActivateFn & CanActivateChildFn = (_route, state) => {
  const auth = inject(AuthService),
    router = inject(Router);
  return (
    auth.serverAuthenticated() ||
    router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } })
  );
};
