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
  selector: 'app-employee-shift-registration-frame',
  standalone: false,
  templateUrl: './employee-shift-registration-frame.component.html',
  styleUrls: ['./employee-shift-registration-frame.component.css'],
})
export class EmployeeShiftRegistrationFrameComponent {
  auth = inject(AuthService);
  shifts = inject(ShiftService);
  selected: string[] = [];
  error = '';
  toast = '';
  days = Array.from({ length: 7 }, (_, i) => i);
  dayNames = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
  isMine(id: string) {
    return this.shifts.mine().some((s) => s.shiftId === id);
  }
  toggle(id: string) {
    if (this.isMine(id) || this.shifts.remaining(id) <= 0) return;
    this.selected = this.selected.includes(id)
      ? this.selected.filter((x) => x !== id)
      : [...this.selected, id];
  }
  submit() {
    try {
      this.shifts.register(this.selected);
      this.toast = 'Đăng ký ca thành công. Ca được nhận ngay, không cần phê duyệt.';
      this.selected = [];
      this.error = '';
    } catch (e) {
      this.error = (e as Error).message;
    }
  }
}
