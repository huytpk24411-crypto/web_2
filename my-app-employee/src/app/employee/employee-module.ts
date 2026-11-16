import { NgModule } from '@angular/core';
import { SharedModule } from '../shared/shared-module';
import { EmployeeCheckInComponent } from './employee-check-in/employee-check-in';
import { EmployeeCheckOutComponent } from './employee-check-out/employee-check-out';
import { EmployeeDealDetailComponent } from './employee-deal-detail/employee-deal-detail';
import { EmployeeDepositNewComponent } from './employee-deposit-new/employee-deposit-new';
import { EmployeeDepositReceiptComponent } from './employee-deposit-receipt/employee-deposit-receipt';
import { DepositSheetComponent } from './deposit-sheet/deposit-sheet';
import { EmployeeLayoutComponent } from './employee-layout/employee-layout';
import { EmployeePayrollComponent } from './employee-payroll/employee-payroll';
import { EmployeeRoutingModule } from './employee-routing-module';
import { EmployeeShiftListComponent } from './employee-shift-list/employee-shift-list';
import { EmployeeShiftRegisterComponent } from './employee-shift-register/employee-shift-register';
import { EmployeeShiftTasksComponent } from './employee-shift-tasks/employee-shift-tasks';

@NgModule({
  declarations: [
    EmployeeLayoutComponent,
    EmployeeCheckInComponent,
    EmployeeCheckOutComponent,
    EmployeeDepositNewComponent,
    EmployeeDepositReceiptComponent,
    DepositSheetComponent,
    EmployeeDealDetailComponent,
    EmployeePayrollComponent,
    EmployeeShiftListComponent,
    EmployeeShiftRegisterComponent,
    EmployeeShiftTasksComponent,
  ],
  imports: [SharedModule, EmployeeRoutingModule],
})
export class EmployeeModule {}
