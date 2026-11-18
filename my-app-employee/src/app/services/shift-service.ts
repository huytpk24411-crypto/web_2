import { Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { AuthService } from './auth-service';
import { ShiftAPIService } from './shift-apiservice';
import { Shift } from '../classes/Shift';
import { ApiAssignment } from '../classes/ShiftApi';
import { shiftOpening } from '../classes/shift-calendar';
@Injectable({ providedIn: 'root' })
export class ShiftService {
  private auth = inject(AuthService);
  readonly api = inject(ShiftAPIService);
  readonly now = signal(Date.now());
  constructor() {
    interval(1000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        const previous = this.now();
        const now = Date.now();
        this.now.set(now);
        const registrationDeadline = Date.parse(this.period.closesAt || '');
        // Refresh when registration closes or a registered shift starts.
        if (
          !this.api.loading() &&
          ((previous < registrationDeadline && now >= registrationDeadline) ||
            this.mine().some((a) => {
              const start = Date.parse(this.shift(a.shiftId)?.startsAt || '');
              return a.status === 'REGISTERED' && previous < start && now >= start;
            }))
        )
          void this.api.refresh();
      });
  }
  canCheckIn(assignment: ApiAssignment): boolean {
    const shift = this.shift(assignment.shiftId);
    return (
      assignment.status === 'REGISTERED' &&
      assignment.canCheckIn === true &&
      !!shift &&
      Date.parse(shift.startsAt) <= this.now() &&
      this.now() < Date.parse(shift.endsAt)
    );
  }
  hasEnded(assignment: ApiAssignment): boolean {
    return this.now() >= Date.parse(this.shift(assignment.shiftId)?.endsAt || '');
  }
  checkInOpening(assignment: ApiAssignment): string {
    const opening = shiftOpening(this.shift(assignment.shiftId)?.startsAt || '');
    return opening ? `Check-in mở lúc ${opening.time} ${opening.date}` : '';
  }
  statusLabel(status: ApiAssignment['status']): string {
    return {
      REGISTERED: 'Đã đăng ký',
      IN_PROGRESS: 'Đang làm',
      COMPLETED: 'Hoàn thành',
      ABSENT: 'Vắng',
      CANCELLED: 'Đã hủy',
    }[status];
  }
  get accountId() {
    return this.auth.account()?.id;
  }
  get shifts(): Shift[] {
    return this.api
      .state()
      .shifts.map((s) => ({ ...s, start: s.startTime, end: s.endTime, occupied: s.assignedCount }));
  }
  get period() {
    const p = this.api.state().period;
    return {
      id: p?.id || '',
      label: p?.name || 'Chưa có đợt đang mở',
      maxPerEmployee: p?.maxShifts || 8,
      closesAt: p?.closesAt,
    };
  }
  get registrationPeriods() {
    return this.api.state().periods;
  }
  get canRegister() {
    return !!this.period.id && this.now() < Date.parse(this.period.closesAt || '');
  }
  get registrationShifts() {
    return this.shifts.filter((s) => s.periodId === this.period.id);
  }
  async registerRequest(ids: string[]) {
    if (!this.canRegister) throw new Error('Đợt đăng ký chưa mở hoặc đã hết hạn.');
    await this.api.write('me/shift-registrations', {
      periodId: this.period.id,
      shiftIds: ids,
      submit: true,
    });
  }
  mine() {
    return this.api.state().assignments.filter((a) => a.status !== 'CANCELLED');
  }
  get(id: string) {
    return this.mine().find((s) => s.id === id);
  }
  shift(id: string) {
    return this.shifts.find((s) => s.id === id);
  }
  remaining(id: string) {
    const shift = this.shift(id);
    return shift ? Math.max(0, shift.capacity - shift.occupied) : 0;
  }
}
