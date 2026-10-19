import { Injectable, inject } from '@angular/core';
import { DemoStore, uid } from './demo-store.service';
import { ShiftService } from './shift.service';
@Injectable({ providedIn: 'root' })
export class AttendanceService {
  private store = inject(DemoStore);
  private shifts = inject(ShiftService);
  get(id: string) {
    return this.store
      .state()
      .attendances.find((a) => a.employeeShiftId === id && this.shifts.get(id));
  }
  checkIn(id: string, evidence: string, note: string): void {
    const assignment = this.shifts.get(id);
    if (!assignment || assignment.status !== 'REGISTERED')
      throw new Error('Ca không hợp lệ hoặc đã chấm công.');
    if (!evidence) throw new Error('Vui lòng chọn ảnh minh chứng.');
    this.store.update((s) => {
      s.attendances.push({
        id: uid('att'),
        employeeShiftId: id,
        checkInAt: new Date().toISOString(),
        evidence,
        note,
      });
      s.employeeShifts.find((x) => x.id === id)!.status = 'IN_PROGRESS';
      if (!s.tasks.some((t) => t.employeeShiftIds.includes(id)))
        [
          'Cập nhật danh sách phòng trống',
          'Gọi xác nhận lịch xem phòng',
          'Kiểm tra hợp đồng và hồ sơ cọc',
        ].forEach((title, i) =>
          s.tasks.push({
            id: uid('task'),
            title,
            employeeShiftIds: [id],
            assigneeIds: i === 0 ? [assignment.employeeId, 'employee2'] : [assignment.employeeId],
            doneBy: [],
            status: 'TODO',
          }),
        );
    });
  }
  checkOut(id: string, handover: string, nextId?: string): void {
    if (this.shifts.get(id)?.status !== 'IN_PROGRESS')
      throw new Error('Ca chưa check-in hoặc đã kết thúc.');
    if (!handover.trim()) throw new Error('Vui lòng ghi nội dung bàn giao.');
    if (nextId && this.shifts.get(nextId)?.status !== 'REGISTERED')
      throw new Error('Ca tiếp nhận không hợp lệ.');
    this.store.update((s) => {
      s.attendances.find((a) => a.employeeShiftId === id)!.checkOutAt = new Date().toISOString();
      s.attendances.find((a) => a.employeeShiftId === id)!.handover = handover;
      s.employeeShifts.find((x) => x.id === id)!.status = 'COMPLETED';
      if (nextId)
        s.tasks
          .filter((t) => t.employeeShiftIds.includes(id) && t.status !== 'DONE')
          .forEach((t) => {
            t.carriedFrom = id;
            if (!t.employeeShiftIds.includes(nextId)) t.employeeShiftIds.push(nextId);
          });
    });
  }
}
