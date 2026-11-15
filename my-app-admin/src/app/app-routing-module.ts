import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AccessDeniedComponent } from './access-denied/access-denied';
import { AuthGuard } from './classes/auth.guard';
import { GuestGuard } from './classes/guest.guard';
import { RoleGuard } from './classes/role.guard';
import { LoginComponent } from './login/login';
import { PageNotFoundComponent } from './page-not-found/page-not-found';
import { AuthLayoutComponent } from './auth-layout/auth-layout';
// Cổng quản trị: chỉ có trang đăng nhập và khu vực /admin; tài khoản do công ty cấp nên không có đăng ký.
const routes: Routes = [
  {
    path: 'login',
    component: AuthLayoutComponent,
    children: [
      {
        path: '',
        component: LoginComponent,
        canActivate: [GuestGuard],
        title: 'Đăng nhập quản trị | iHOUZZ Uni',
      },
    ],
  },
  {
    path: 'access-denied',
    component: AccessDeniedComponent,
    canActivate: [AuthGuard],
    title: 'Không có quyền | iHOUZZ Uni',
  },
  {
    path: 'admin',
    canActivate: [AuthGuard, RoleGuard],
    canActivateChild: [AuthGuard, RoleGuard],
    data: { roles: ['ADMIN'] },
    loadChildren: () => import('./admin/admin-module').then((m) => m.AdminModule),
  },
  { path: '', pathMatch: 'full', redirectTo: 'admin' },
  { path: '**', component: PageNotFoundComponent, title: 'Không tìm thấy | iHOUZZ Uni' },
];
@NgModule({
  imports: [
    RouterModule.forRoot(routes, {
      scrollPositionRestoration: 'enabled',
      anchorScrolling: 'enabled',
    }),
  ],
  exports: [RouterModule],
})
export class AppRoutingModule {}
