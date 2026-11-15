import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AttendanceService } from '../../services/attendance-service';
import { AuthService } from '../../services/auth-service';
import { ShiftService } from '../../services/shift-service';
import { shiftOpening } from '../../classes/shift-calendar';
@Component({
  selector: 'app-employee-check-in-frame',
  standalone: false,
  templateUrl: './employee-check-in.html',
  styleUrls: ['./employee-check-in.css'],
})
export class EmployeeCheckInComponent {
  shifts = inject(ShiftService);
  attendance = inject(AttendanceService);
  auth = inject(AuthService);
  route = inject(ActivatedRoute);
  router = inject(Router);
  id = this.route.snapshot.paramMap.get('id') || '';
  readonly evidence = signal('');
  readonly currentTime = computed(() => new Date(this.shifts.now()));
  readonly canCheckIn = computed(
    () => !!this.assignment && this.shifts.canCheckIn(this.assignment),
  );
  readonly windowMessage = computed(() => {
    const shift = this.shift;
    if (!shift) return '';
    if (this.shifts.now() >= Date.parse(shift.endsAt)) return 'Ca đã kết thúc, không thể check-in.';
    const opening = shiftOpening(shift.startsAt);
    return opening && this.shifts.now() < Date.parse(shift.startsAt)
      ? `Chưa tới giờ ca làm. Check-in mở lúc ${opening.time} ngày ${opening.date}.`
      : '';
  });
  readonly canSubmit = computed(
    () => !!this.file && !this.busy && !this.shifts.api.loading() && this.canCheckIn(),
  );
  note = '';
  private readonly selectedFile = signal<File | undefined>(undefined);
  get file() {
    return this.selectedFile();
  }
  set file(value: File | undefined) {
    this.selectedFile.set(value);
  }
  private _busy = signal(false);
  get busy() {
    return this._busy();
  }
  set busy(value: ReturnType<typeof this._busy>) {
    this._busy.set(value);
  }
  readonly error = signal('');
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
    this.file = file;
    reader.onload = () => {
      this.evidence.set(String(reader.result));
      this.error.set('');
    };
    reader.readAsDataURL(file);
  }
  async submit() {
    if (this.busy) return;
    if (!this.file) {
      this.error.set('Vui lòng chọn ảnh minh chứng.');
      return;
    }
    if (!this.canCheckIn() || this.shifts.api.loading()) {
      this.error.set(this.windowMessage() || 'Ca làm hiện chưa cho phép check-in.');
      return;
    }
    this.busy = true;
    try {
      await this.attendance.checkInRequest(this.id, this.evidence(), this.note, this.file);
      this.router.navigate(['/employee/shifts', this.id, 'tasks']);
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy = false;
    }
  }
}
