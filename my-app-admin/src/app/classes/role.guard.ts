import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth-service';
import { Role } from './Account';
export const RoleGuard: CanActivateFn & CanActivateChildFn = (route, state) => {
  const auth = inject(AuthService),
    router = inject(Router);
  if (!auth.serverAuthenticated())
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  const roles = [...route.pathFromRoot].reverse().find((r) => r.data['roles'])?.data['roles'] as
    Role[] | undefined;
  return (!!roles && auth.hasRole(roles)) || router.createUrlTree(['/access-denied']);
};
