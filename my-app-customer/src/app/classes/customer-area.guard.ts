import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth-service';
// Khu khách hàng mở cho khách vãng lai; ADMIN/EMPLOYEE được đưa về trang làm việc của mình.
// Trang cần đăng nhập (yêu thích, giữ chỗ, đặt lịch xem) tự gắn AuthGuard + RoleGuard.
export const CustomerAreaGuard: CanActivateFn & CanActivateChildFn = () => {
  const auth = inject(AuthService);
  return (
    !auth.serverAuthenticated() ||
    auth.hasRole(['CUSTOMER']) ||
    inject(Router).parseUrl(auth.destination())
  );
};
