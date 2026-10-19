import { Injectable, inject } from '@angular/core';
import { DemoStore, uid } from './demo-store.service';
import { AuthService } from './auth.service';
import { SHIFTS, SHIFT_PERIOD } from '../data/mock-data';
@Injectable({ providedIn: 'root' })
export class ShiftService {
  private store = inject(DemoStore);
  private auth = inject(AuthService);
  readonly shifts = SHIFTS;
  readonly period = SHIFT_PERIOD;
  mine() {
    return this.store
      .state()
      .employeeShifts.filter((s) => s.employeeId === this.auth.account()?.id);
  }
  get(id: string) {
    return this.mine().find((s) => s.id === id);
  }
  shift(id: string) {
    return this.shifts.find((s) => s.id === id);
  }
  remaining(id: string) {
    const shift = this.shift(id);
    return shift
      ? Math.max(
          0,
          shift.capacity -
            shift.occupied -
            this.store.state().employeeShifts.filter((s) => s.shiftId === id).length,
        )
      : 0;
  }
  register(ids: string[]): void {
    if (!this.auth.isEmployee()) throw new Error('Cần quyền nhân viên.');
    if (!ids.length) throw new Error('Chọn ít nhất một ca.');
    if (
      new Set(ids).size !== ids.length ||
      ids.some((id) => this.mine().some((s) => s.shiftId === id))
    )
      throw new Error('Bạn đã đăng ký ca này.');
    if (this.mine().length + ids.length > this.period.maxPerEmployee)
      throw new Error('Tối đa 7 ca trong tuần.');
    if (ids.some((id) => this.remaining(id) <= 0))
      throw new Error('Một ca đã đủ chỗ. Vui lòng chọn lại.');
    this.store.update((s) =>
      ids.forEach((shiftId) =>
        s.employeeShifts.push({
          id: uid('es'),
          employeeId: this.auth.account()!.id,
          shiftId,
          status: 'REGISTERED',
        }),
      ),
    );
  }
}
