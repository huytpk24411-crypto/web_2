import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { EmployeeCheckInComponent } from './employee-check-in/employee-check-in';
import { EmployeeCheckOutComponent } from './employee-check-out/employee-check-out';
import { EmployeeDealDetailComponent } from './employee-deal-detail/employee-deal-detail';
import { EmployeeDepositNewComponent } from './employee-deposit-new/employee-deposit-new';
import { EmployeeLayoutComponent } from './employee-layout/employee-layout';
import { EmployeePayrollComponent } from './employee-payroll/employee-payroll';
import { EmployeeShiftListComponent } from './employee-shift-list/employee-shift-list';
import { EmployeeShiftRegisterComponent } from './employee-shift-register/employee-shift-register';
import { EmployeeShiftTasksComponent } from './employee-shift-tasks/employee-shift-tasks';
const routes: Routes = [
  {
    path: 'shifts/register',
    component: EmployeeShiftRegisterComponent,
    title: 'Đăng ký ca | iHOUZZ Uni',
  },
  { path: 'shifts', component: EmployeeShiftListComponent, title: 'Ca làm của tôi | iHOUZZ Uni' },
  {
    path: 'shifts/:id/check-in',
    component: EmployeeCheckInComponent,
    title: 'Check-in đầu ca | iHOUZZ Uni',
  },
  {
    path: 'shifts/:id/tasks',
    component: EmployeeShiftTasksComponent,
    title: 'Công việc trong ca | iHOUZZ Uni',
  },
  {
    path: 'shifts/:id/check-out',
    component: EmployeeCheckOutComponent,
    title: 'Bàn giao ca | iHOUZZ Uni',
  },
  { path: 'deals', component: EmployeeDealDetailComponent, title: 'Giao dịch | iHOUZZ Uni' },
  { path: 'payroll', component: EmployeePayrollComponent, title: 'Bảng lương | iHOUZZ Uni' },
  {
    path: 'deposits/new',
    component: EmployeeDepositNewComponent,
    title: 'Hồ sơ cọc | iHOUZZ Uni',
  },
  {
    path: 'deals/:id',
    component: EmployeeDealDetailComponent,
    title: 'Giao dịch trực tiếp | iHOUZZ Uni',
  },
  { path: '', redirectTo: 'shifts/register', pathMatch: 'full' },
];
@NgModule({
  imports: [
    RouterModule.forChild([{ path: '', component: EmployeeLayoutComponent, children: routes }]),
  ],
  exports: [RouterModule],
})
export class EmployeeRoutingModule {}
