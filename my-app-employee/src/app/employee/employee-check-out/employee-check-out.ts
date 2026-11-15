import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AttendanceService } from '../../services/attendance-service';
import { ShiftService } from '../../services/shift-service';
import { TaskService } from '../../services/task-service';
@Component({
  selector: 'app-employee-check-out-frame',
  standalone: false,
  templateUrl: './employee-check-out.html',
  styleUrls: ['./employee-check-out.css'],
})
export class EmployeeCheckOutComponent {
  shifts = inject(ShiftService);
  attendance = inject(AttendanceService);
  tasks = inject(TaskService);
  route = inject(ActivatedRoute);
  id = this.route.snapshot.paramMap.get('id') || '';
  private _evidence = signal('');
  get evidence() {
    return this._evidence();
  }
  set evidence(value: ReturnType<typeof this._evidence>) {
    this._evidence.set(value);
  }
  file?: File;
  confirmed = false;
  private _busy = signal(false);
  get busy() {
    return this._busy();
  }
  set busy(value: ReturnType<typeof this._busy>) {
    this._busy.set(value);
  }
  ngOnInit() {
    void this.shifts.api.loadTasks(this.id);
  }
  upload(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2000000) {
      this.error = 'Chọn ảnh JPG, PNG hoặc WebP nhỏ hơn 2 MB.';
      return;
    }
    this.file = file;
    const reader = new FileReader();
    reader.onload = () => {
      this.evidence = String(reader.result);
      this.error = '';
    };
    reader.readAsDataURL(file);
  }
  private _error = signal('');
  get error() {
    return this._error();
  }
  set error(value: ReturnType<typeof this._error>) {
    this._error.set(value);
  }
  get assignment() {
    return this.shifts.get(this.id);
  }
  get record() {
    return this.attendance.get(this.id);
  }
  get next() {
    const source = this.shifts.shift(this.assignment?.shiftId || '');
    const time = (shiftId: string) => {
      const s = this.shifts.shift(shiftId);
      return s ? `${s.date}T${s.start}` : '';
    };
    return this.shifts
      .mine()
      .filter(
        (s) =>
          s.id !== this.id &&
          s.status === 'REGISTERED' &&
          time(s.shiftId) > (source ? `${source.date}T${source.start}` : ''),
      )
      .sort((a, b) => time(a.shiftId).localeCompare(time(b.shiftId)));
  }
  get finished() {
    return this.tasks.list(this.id).filter((t) => t.status === 'DONE').length;
  }
  get duration() {
    const record = this.record;
    if (!record?.checkOutAt) return 'Chưa kết thúc';
    const minutes = Math.max(
      0,
      Math.floor((Date.parse(record.checkOutAt) - Date.parse(record.checkInAt)) / 60000),
    );
    return Math.floor(minutes / 60) + 'h ' + (minutes % 60) + 'm';
  }
  get percent() {
    const total = this.tasks.list(this.id).length;
    return total ? Math.round((this.finished / total) * 100) : 0;
  }
  get month() {
    return (this.record?.checkOutAt || this.record?.checkInAt || new Date().toISOString()).slice(
      0,
      7,
    );
  }
  get monthAssignments() {
    return this.shifts
      .mine()
      .filter((item) => this.shifts.shift(item.shiftId)?.date.startsWith(this.month));
  }
  get monthCompleted() {
    return this.monthAssignments.filter((item) => item.status === 'COMPLETED').length;
  }
  async submit() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.attendance.checkOutRequest(this.id, this.evidence, this.confirmed, this.file);
      this.error = '';
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.busy = false;
    }
  }
  print() {
    window.print();
  }
}
