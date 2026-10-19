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
  selector: 'app-employee-check-in-frame',
  standalone: false,
  templateUrl: './employee-check-in-frame.component.html',
  styleUrls: ['./employee-check-in-frame.component.css'],
})
export class EmployeeCheckInFrameComponent {
  shifts = inject(ShiftService);
  attendance = inject(AttendanceService);
  auth = inject(AuthService);
  route = inject(ActivatedRoute);
  router = inject(Router);
  assets = ASSETS;
  id = this.route.snapshot.paramMap.get('id') || '';
  evidence = signal('');
  note = '';
  error = signal('');
  get assignment() {
    return this.shifts.get(this.id);
  }
  get shift() {
    return this.shifts.shift(this.assignment?.shiftId || '');
  }
  upload(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2000000) {
      this.error.set('Chọn ảnh JPG, PNG hoặc WebP nhỏ hơn 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.evidence.set(String(reader.result));
      this.error.set('');
    };
    reader.readAsDataURL(file);
  }
  submit() {
    try {
      this.attendance.checkIn(this.id, this.evidence(), this.note);
      this.router.navigate(['/employee/shifts', this.id, 'tasks']);
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }
}
