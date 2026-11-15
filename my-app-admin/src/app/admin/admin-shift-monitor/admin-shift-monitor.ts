import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timer } from 'rxjs';
import { ShiftAPIService } from '../../services/shift-apiservice';
@Component({
  selector: 'app-admin-shift-monitor',
  standalone: false,
  templateUrl: './admin-shift-monitor.html',
  styleUrls: ['./admin-shift-monitor.css'],
})
export class AdminShiftMonitorComponent {
  readonly api = inject(ShiftAPIService);
  constructor() {
    timer(60000, 60000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (this.api.online()) void this.api.refresh();
      });
  }
  get latePolicy(): {
    version: number;
    levels: { from: number; to: number | null; amount: number | null; rateBps: number | null }[];
  } {
    const data = this.api.state().admin,
      now = new Date();
    const p = data?.Policy.filter(
      (p) =>
        p.type === 'PHAT_TRE' &&
        p.status === 'ACTIVE' &&
        new Date(p.effectiveFrom) <= now &&
        (!p.effectiveTo || now < new Date(p.effectiveTo)),
    ).sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime())[0];
    return {
      version: p?.version || 0,
      levels:
        data?.PolicyLevel.filter((l) => l.policyId === p?.id)
          .slice()
          .sort((a, b) => a.from - b.from)
          .map((l) => ({ ...l, rateBps: null })) || [],
    };
  }
  get visibleShifts() {
    const data = this.api.state().admin;
    if (!data) return [];
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    return data.ShiftAssignment.filter((a) => a.status !== 'CANCELLED').flatMap((a) => {
      const s = data.Shift.find((s) => s.id === a.shiftId && s.date === today);
      if (!s) return [];
      const record = data.Attendance.find((r) => r.assignmentId === a.id);
      const e = data.Employee.find((e) => e.id === a.employeeId);
      const name = e?.fullName || e?.name || a.employeeId;
      const late = !!record && new Date(record.checkInAt) > new Date(s.startsAt);
      return [
        {
          initials: name
            .split(' ')
            .slice(-2)
            .map((w) => w[0])
            .join(''),
          name,
          detail: `${s.label} · ${s.startTime}–${s.endTime}`,
          tone: late || a.status === 'ABSENT' ? 'late' : 'normal',
          status:
            a.status === 'ABSENT'
              ? 'Vắng mặt'
              : a.status === 'COMPLETED'
                ? 'Đã kết thúc'
                : record
                  ? late
                    ? 'Đi trễ'
                    : 'Đã check-in'
                  : 'Chưa check-in',
          location: data.WorkLocation.find((l) => l.id === s.workLocationId)?.name || '',
          time: record
            ? new Date(record.checkInAt).toLocaleTimeString('vi-VN', {
                timeZone: 'Asia/Ho_Chi_Minh',
              })
            : '—',
        },
      ];
    });
  }
}
