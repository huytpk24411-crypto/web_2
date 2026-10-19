import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CustomerLayoutComponent } from './layouts/customer-layout/customer-layout.component';
import { EmployeeLayoutComponent } from './layouts/employee-layout/employee-layout.component';
import { AdminLayoutComponent } from './layouts/admin-layout/admin-layout.component';
import { AuthGuard, RoleGuard } from './guards/auth.guard';
const routes: Routes = [
  {
    path: 'employee',
    component: EmployeeLayoutComponent,
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['EMPLOYEE', 'ADMIN'] },
    loadChildren: () => import('./features/employee/employee.module').then((m) => m.EmployeeModule),
  },
  {
    path: 'admin',
    component: AdminLayoutComponent,
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['ADMIN'] },
    loadChildren: () => import('./features/admin/admin.module').then((m) => m.AdminModule),
  },
  {
    path: '',
    component: CustomerLayoutComponent,
    children: [
      {
        path: '',
        canMatch: [(_route, segments) => ['login', 'register'].includes(segments[0]?.path)],
        loadChildren: () => import('./features/auth/auth.module').then((m) => m.AuthModule),
      },
      {
        path: '',
        loadChildren: () =>
          import('./features/customer/customer.module').then((m) => m.CustomerModule),
      },
    ],
  },
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
