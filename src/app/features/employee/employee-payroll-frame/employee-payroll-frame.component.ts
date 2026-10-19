import { Component, inject, Input, Output, EventEmitter } from '@angular/core';
import { signal, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../services/auth.service';
import { ShiftService } from '../../../services/shift.service';
import { AttendanceService } from '../../../services/attendance.service';
import { TaskService } from '../../../services/task.service';
import { PayrollService } from '../../../services/payroll.service';
import { RoomService } from '../../../services/room.service';
import { DepositService } from '../../../services/deposit.service';
import { DealService } from '../../../services/deal.service';
import { DemoStore } from '../../../services/demo-store.service';
import { PHONE_PATTERN } from '../../../shared/validators';
import { ASSETS } from '../../../data/assets';
@Component({
  selector: 'app-employee-payroll-frame',
  standalone: false,
  templateUrl: './employee-payroll-frame.component.html',
  styleUrls: ['./employee-payroll-frame.component.css'],
})
export class EmployeePayrollFrameComponent {
  auth = inject(AuthService);
  payroll = inject(PayrollService);
  period = '2026-10';
  toast = '';
  get slip() {
    return this.payroll.slips.find((s) => s.periodId === this.period)!;
  }
  print() {
    window.print();
  }
}
