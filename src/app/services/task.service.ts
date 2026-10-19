import { Injectable, inject } from '@angular/core';
import { DemoStore } from './demo-store.service';
import { AuthService } from './auth.service';
import { ShiftService } from './shift.service';
@Injectable({ providedIn: 'root' })
export class TaskService {
  private store = inject(DemoStore);
  private auth = inject(AuthService);
  private shifts = inject(ShiftService);
  list(id: string) {
    return this.shifts.get(id)
      ? this.store.state().tasks.filter((t) => t.employeeShiftIds.includes(id))
      : [];
  }
  toggle(taskId: string, assignmentId: string): void {
    const employeeId = this.auth.account()?.id;
    if (!employeeId || this.shifts.get(assignmentId)?.status !== 'IN_PROGRESS') return;
    this.store.update((s) => {
      const t = s.tasks.find((t) => t.id === taskId && t.employeeShiftIds.includes(assignmentId));
      if (!t || !t.assigneeIds.includes(employeeId)) return;
      t.doneBy = t.doneBy.includes(employeeId)
        ? t.doneBy.filter((id) => id !== employeeId)
        : [...t.doneBy, employeeId];
      t.status =
        t.doneBy.length === t.assigneeIds.length
          ? 'DONE'
          : t.doneBy.length
            ? 'IN_PROGRESS'
            : 'TODO';
    });
  }
}
