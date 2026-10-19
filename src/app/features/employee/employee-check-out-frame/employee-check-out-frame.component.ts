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
  selector: 'app-employee-check-out-frame',
  standalone: false,
  templateUrl: './employee-check-out-frame.component.html',
  styleUrls: ['./employee-check-out-frame.component.css'],
})
export class EmployeeCheckOutFrameComponent {
  shifts = inject(ShiftService);
  attendance = inject(AttendanceService);
  tasks = inject(TaskService);
  route = inject(ActivatedRoute);
  id = this.route.snapshot.paramMap.get('id') || '';
  handover = '';
  nextId = '';
  error = '';
  get assignment() {
    return this.shifts.get(this.id);
  }
  get record() {
    return this.attendance.get(this.id);
  }
  get next() {
    return this.shifts.mine().filter((s) => s.id !== this.id && s.status === 'REGISTERED');
  }
  get finished() {
    return this.tasks.list(this.id).filter((t) => t.status === 'DONE').length;
  }
  submit() {
    try {
      this.attendance.checkOut(this.id, this.handover, this.nextId || undefined);
      this.error = '';
    } catch (e) {
      this.error = (e as Error).message;
    }
  }
  print() {
    window.print();
  }
}
