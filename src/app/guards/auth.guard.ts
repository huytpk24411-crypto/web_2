import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Role } from '../models/domain';
export const AuthGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService),
    router = inject(Router);
  if (auth.account()) return true;
  const customer = route.data['roles']?.includes('CUSTOMER');
  return router.createUrlTree([customer ? '/register' : '/login'], {
    queryParams: {
      returnUrl: state.url,
      roomId: route.queryParamMap.get('roomId'),
      action: route.data['action'],
    },
  });
};
export const RoleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService),
    router = inject(Router),
    roles = route.data['roles'] as Role[];
  return auth.hasRole(roles) || router.createUrlTree(['/access-denied']);
};
