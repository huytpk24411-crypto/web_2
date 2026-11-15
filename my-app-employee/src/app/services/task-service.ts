import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth-service';
import { ShiftService } from './shift-service';
import { Task } from '../classes/Task';
@Injectable({ providedIn: 'root' })
export class TaskService {
  private auth = inject(AuthService);
  private shifts = inject(ShiftService);
  list(id: string): Task[] {
    return this.shifts.api
      .state()
      .tasks.filter(
        (t) => t.status !== 'CANCELLED' && t.assignees.some((a) => a.assignmentId === id),
      )
      .map((t) => ({
        id: t.id,
        title: t.title,
        kind: t.kind || 'GENERAL',
        description: t.description,
        mine: t.mine,
        returnedToAdmin: t.assignees.some(
          (part) =>
            part.id === t.mine?.taskAssignmentId &&
            (part.waitingAdmin === true || part.removed === true),
        ),
        editable: t.editable === true && t.status !== 'PENDING_CONFIRM',
        viewing: t.viewing,
        status: t.status,
        employeeShiftIds: t.assignees.map((a) => a.assignmentId),
        carriedFrom: t.assignees.find(
          (a) =>
            a.id === t.assignees.find((part) => part.assignmentId === id)?.fromTaskAssignmentId,
        )?.assignmentId,
        assigneeIds: t.currentAssignees.map((a) =>
          a.employeeId === this.shifts.get(id)?.employeeId ? this.auth.account()!.id : a.employeeId,
        ),
        doneBy: t.assignees
          .filter(
            (a) =>
              a.personalStatus === 'DONE' &&
              a.assignmentId === id &&
              a.employeeId === this.shifts.get(id)?.employeeId,
          )
          .map(() => this.auth.account()!.id),
      }));
  }
  async toggleRequest(taskId: string, assignmentId: string) {
    const task = this.shifts.api.state().tasks.find((t) => t.id === taskId);
    const row = task?.currentAssignees.find((a) => a.assignmentId === assignmentId);
    if (
      !row ||
      !task?.editable ||
      task.status === 'PENDING_CONFIRM' ||
      task.mine?.current !== true ||
      task.kind === 'VIEWING'
    )
      throw new Error('Công việc không thuộc ca đang làm của bạn.');
    await this.shifts.api.write(
      `tasks/${taskId}/my-status`,
      { assignmentId, personalStatus: row?.personalStatus === 'DONE' ? 'TODO' : 'DONE' },
      'PUT',
    );
    await this.shifts.api.loadTasks(assignmentId);
  }
}
