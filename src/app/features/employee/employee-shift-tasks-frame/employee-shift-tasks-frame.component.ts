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
  selector: 'app-employee-shift-tasks-frame',
  standalone: false,
  templateUrl: './employee-shift-tasks-frame.component.html',
  styleUrls: ['./employee-shift-tasks-frame.component.css'],
})
export class EmployeeShiftTasksFrameComponent {
  auth = inject(AuthService);
  shifts = inject(ShiftService);
  attendance = inject(AttendanceService);
  tasks = inject(TaskService);
  route = inject(ActivatedRoute);
  id = this.route.snapshot.paramMap.get('id') || '';
  filter = '';
  get assignment() {
    return this.shifts.get(this.id);
  }
  get shift() {
    return this.shifts.shift(this.assignment?.shiftId || '');
  }
  get list() {
    return this.tasks
      .list(this.id)
      .filter((t) => t.title.toLowerCase().includes(this.filter.toLowerCase()));
  }
  get done() {
    return this.tasks.list(this.id).filter((t) => t.status === 'DONE').length;
  }
  get percent() {
    const all = this.tasks.list(this.id);
    return all.length ? Math.round((this.done / all.length) * 100) : 0;
  }
  mineDone(doneBy: string[]) {
    return doneBy.includes(this.auth.account()?.id || '');
  }
}
