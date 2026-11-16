import { Component, inject, signal } from '@angular/core';
import { AuthService } from '../../services/auth-service';
import { ShiftService } from '../../services/shift-service';
@Component({
  selector: 'app-employee-shift-registration-frame',
  standalone: false,
  templateUrl: './employee-shift-register.html',
  styleUrls: ['./employee-shift-register.css'],
})
export class EmployeeShiftRegisterComponent {
  auth = inject(AuthService);
  shifts = inject(ShiftService);
  private selection = signal<string[]>([]);
  get selected() {
    return this.selection();
  }
  set selected(value: string[]) {
    this.selection.set(value);
  }
  private _error = signal('');
  get error() {
    return this._error();
  }
  set error(value: ReturnType<typeof this._error>) {
    this._error.set(value);
  }
  private _toast = signal('');
  get toast() {
    return this._toast();
  }
  set toast(value: ReturnType<typeof this._toast>) {
    this._toast.set(value);
  }
  private _busy = signal(false);
  get busy() {
    return this._busy();
  }
  set busy(value: ReturnType<typeof this._busy>) {
    this._busy.set(value);
  }
  get count() {
    return this.shifts
      .mine()
      .filter((a) => this.shifts.registrationShifts.some((s) => s.id === a.shiftId)).length;
  }
  days = Array.from({ length: 7 }, (_, i) => i);
  dayNames = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
  get clock() {
    return new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  }
  get registeredShifts() {
    return this.shifts.registrationShifts.filter((shift) => this.isMine(shift.id));
  }
  isMine(id: string) {
    return this.shifts.mine().some((s) => s.shiftId === id);
  }
  toggle(id: string) {
    if (this.isMine(id) || this.shifts.remaining(id) <= 0) return;
    this.selected = this.selected.includes(id)
      ? this.selected.filter((x) => x !== id)
      : [...this.selected, id];
  }
  async submit() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.shifts.registerRequest(this.selected);
      this.toast = 'Đăng ký ca thành công. Ca được nhận ngay, không cần phê duyệt.';
      this.selected = [];
      this.error = '';
    } catch (e) {
      this.error = (e as Error).message;
      await this.shifts.api.refresh();
      this.selected = this.selected.filter((id) => !this.isMine(id));
    } finally {
      this.busy = false;
    }
  }
}
