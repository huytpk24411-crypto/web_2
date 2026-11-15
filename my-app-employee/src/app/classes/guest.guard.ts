import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth-service';
export const GuestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return !auth.serverAuthenticated() || inject(Router).parseUrl(auth.destination());
};
