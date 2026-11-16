import { ForgotPasswordComponent } from './forgot-password/forgot-password';
import { NgModule } from '@angular/core';
import { RouterModule, Routes, UrlMatcher } from '@angular/router';
import { AccessDeniedComponent } from './access-denied/access-denied';
import { AuthGuard } from './classes/auth.guard';
import { CustomerAreaGuard } from './classes/customer-area.guard';
import { GuestGuard } from './classes/guest.guard';
import { LoginComponent } from './login/login';
import { PageNotFoundComponent } from './page-not-found/page-not-found';
import { RegisterComponent } from './register/register';
import { AuthLayoutComponent } from './auth-layout/auth-layout';
// Khung chung chỉ khớp /login và /register (không nuốt trang chủ '/'); con vẫn dùng chung
// một AuthLayoutComponent nên ảnh bên trái không render lại khi chuyển qua lại.
const authPages: UrlMatcher = (segments) =>
  ['login', 'register', 'forgot-password'].includes(segments[0]?.path) ? { consumed: [] } : null;
const routes: Routes = [
  {
    matcher: authPages,
    component: AuthLayoutComponent,
    children: [
      {
        path: 'forgot-password',
        component: ForgotPasswordComponent,
        canActivate: [GuestGuard],
        title: 'Quên mật khẩu | iHOUZZ Uni',
      },
      {
        path: 'login',
        component: LoginComponent,
        canActivate: [GuestGuard],
        title: 'Đăng nhập | iHOUZZ Uni',
      },
      {
        path: 'register',
        component: RegisterComponent,
        canActivate: [GuestGuard],
        title: 'Đăng ký | iHOUZZ Uni',
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
    path: '',
    canActivate: [CustomerAreaGuard],
    canActivateChild: [CustomerAreaGuard],
    loadChildren: () => import('./customer/customer-module').then((m) => m.CustomerModule),
  },
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
