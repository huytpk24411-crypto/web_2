import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { AuthGuard, RoleGuard } from '../../guards/auth.guard';
import { DepositPaymentComponent } from './deposit-payment/deposit-payment.component';
import { EmployeeCashDepositReceiptFrameComponent } from './employee-cash-deposit-receipt-frame/employee-cash-deposit-receipt-frame.component';
import { EmployeeCheckInFrameComponent } from './employee-check-in-frame/employee-check-in-frame.component';
import { EmployeeCheckOutFrameComponent } from './employee-check-out-frame/employee-check-out-frame.component';
import { EmployeeDepositDossierFrameComponent } from './employee-deposit-dossier-frame/employee-deposit-dossier-frame.component';
import { EmployeeDirectDealFrameComponent } from './employee-direct-deal-frame/employee-direct-deal-frame.component';
import { EmployeeForfeitureFrameComponent } from './employee-forfeiture-frame/employee-forfeiture-frame.component';
import { EmployeePayrollFrameComponent } from './employee-payroll-frame/employee-payroll-frame.component';
import { EmployeeQrDepositReceiptFrameComponent } from './employee-qr-deposit-receipt-frame/employee-qr-deposit-receipt-frame.component';
import { EmployeeShiftListComponent } from './employee-shift-list/employee-shift-list.component';
import { EmployeeShiftRegistrationFrameComponent } from './employee-shift-registration-frame/employee-shift-registration-frame.component';
import { EmployeeShiftTasksFrameComponent } from './employee-shift-tasks-frame/employee-shift-tasks-frame.component';
const routes: Routes = [
  {
    path: 'shifts/register',
    component: EmployeeShiftRegistrationFrameComponent,
    title: 'Đăng ký ca | iHOUZZ Uni',
  },
  { path: 'shifts', component: EmployeeShiftListComponent, title: 'Ca làm của tôi | iHOUZZ Uni' },
  {
    path: 'shifts/:id/check-in',
    component: EmployeeCheckInFrameComponent,
    title: 'Check-in đầu ca | iHOUZZ Uni',
  },
  {
    path: 'shifts/:id/tasks',
    component: EmployeeShiftTasksFrameComponent,
    title: 'Công việc trong ca | iHOUZZ Uni',
  },
  {
    path: 'shifts/:id/check-out',
    component: EmployeeCheckOutFrameComponent,
    title: 'Bàn giao ca | iHOUZZ Uni',
  },
  { path: 'payroll', component: EmployeePayrollFrameComponent, title: 'Bảng lương | iHOUZZ Uni' },
  {
    path: 'deposits/new',
    component: EmployeeDepositDossierFrameComponent,
    title: 'Hồ sơ cọc | iHOUZZ Uni',
  },
  {
    path: 'deposits/:id/qr-receipt',
    component: EmployeeQrDepositReceiptFrameComponent,
    title: 'Xác nhận VietQR | iHOUZZ Uni',
  },
  {
    path: 'deposits/:id/cash-receipt',
    component: EmployeeCashDepositReceiptFrameComponent,
    title: 'Xác nhận tiền mặt | iHOUZZ Uni',
  },
  {
    path: 'deals/:id/forfeiture',
    component: EmployeeForfeitureFrameComponent,
    title: 'Xử lý bỏ cọc | iHOUZZ Uni',
  },
  {
    path: 'deals/:id',
    component: EmployeeDirectDealFrameComponent,
    title: 'Giao dịch trực tiếp | iHOUZZ Uni',
  },
  { path: '', redirectTo: 'shifts/register', pathMatch: 'full' },
];
@NgModule({
  declarations: [
    DepositPaymentComponent,
    EmployeeCashDepositReceiptFrameComponent,
    EmployeeCheckInFrameComponent,
    EmployeeCheckOutFrameComponent,
    EmployeeDepositDossierFrameComponent,
    EmployeeDirectDealFrameComponent,
    EmployeeForfeitureFrameComponent,
    EmployeePayrollFrameComponent,
    EmployeeQrDepositReceiptFrameComponent,
    EmployeeShiftListComponent,
    EmployeeShiftRegistrationFrameComponent,
    EmployeeShiftTasksFrameComponent,
  ],
  imports: [SharedModule, RouterModule.forChild(routes)],
})
export class EmployeeModule {}
