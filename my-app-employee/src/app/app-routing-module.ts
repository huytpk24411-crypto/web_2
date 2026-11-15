import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AccessDeniedComponent } from './access-denied/access-denied';
import { AuthGuard } from './classes/auth.guard';
import { GuestGuard } from './classes/guest.guard';
import { RoleGuard } from './classes/role.guard';
import { LoginComponent } from './login/login';
import { PageNotFoundComponent } from './page-not-found/page-not-found';
import { AuthLayoutComponent } from './auth-layout/auth-layout';
// Cổng nhân viên: chỉ có trang đăng nhập và khu vực /employee; tài khoản do công ty cấp nên không có đăng ký.
const routes: Routes = [
  {
    path: 'login',
    component: AuthLayoutComponent,
    children: [
      {
        path: '',
        component: LoginComponent,
        canActivate: [GuestGuard],
        title: 'Đăng nhập nhân viên | iHOUZZ Uni',
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
    path: 'employee',
    canActivate: [AuthGuard, RoleGuard],
    canActivateChild: [AuthGuard, RoleGuard],
    data: { roles: ['EMPLOYEE'] },
    loadChildren: () => import('./employee/employee-module').then((m) => m.EmployeeModule),
  },
  { path: '', pathMatch: 'full', redirectTo: 'employee' },
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
