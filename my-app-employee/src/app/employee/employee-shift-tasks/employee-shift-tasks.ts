import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom, map, timer } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { AttendanceService } from '../../services/attendance-service';
import { AuthService } from '../../services/auth-service';
import { ShiftService } from '../../services/shift-service';
import { TaskService } from '../../services/task-service';
import { ViewingAPIService } from '../../services/viewing-apiservice';
import { ApiTaskViewing, ApiViewingRoom } from '../../classes/ShiftApi';
import { Task } from '../../classes/Task';
@Component({
  selector: 'app-employee-shift-tasks-frame',
  standalone: false,
  templateUrl: './employee-shift-tasks.html',
  styleUrls: ['./employee-shift-tasks.css'],
})
export class EmployeeShiftTasksComponent {
  auth = inject(AuthService);
  shifts = inject(ShiftService);
  attendance = inject(AttendanceService);
  tasks = inject(TaskService);
  private viewingApi = inject(ViewingAPIService);
  route = inject(ActivatedRoute);
  id = this.route.snapshot.paramMap.get('id') || '';
  // list() maps API records to new objects. Cache them between API changes so
  // rendering does not recreate NgModel controls and schedule another render.
  readonly allTasks = computed(() => this.tasks.list(this.id));
  filter = '';
  readonly tasksLoading = signal(false);
  readonly success = signal('');
  private drafts: Record<string, Pick<ApiViewingRoom, 'viewStatus' | 'note'>> = {};
  private _busy = signal(false);
  get busy() {
    return this._busy();
  }
  set busy(value: ReturnType<typeof this._busy>) {
    this._busy.set(value);
  }
  private _error = signal('');
  get error() {
    return this._error();
  }
  set error(value: ReturnType<typeof this._error>) {
    this._error.set(value);
  }
  ngOnInit() {
    void this.reload();
  }
  async reload(refresh = false) {
    if (this.busy || this.tasksLoading()) return;
    this.tasksLoading.set(true);
    try {
      await this.shifts.api.loadTasks(this.id);
      if (refresh) await this.shifts.api.refresh();
      this.drafts = {};
    } finally {
      this.tasksLoading.set(false);
    }
  }
  async toggle(taskId: string) {
    const task = this.tasks.list(this.id).find((item) => item.id === taskId);
    if (!task || task.kind === 'VIEWING' || !this.canEdit(task)) return;
    await this.perform(() => this.tasks.toggleRequest(taskId, this.id));
  }
  canEdit(task: Task) {
    return (
      task.status !== 'PENDING_CONFIRM' && task.editable === true && task.mine?.current === true
    );
  }
  canConfirm(task: Task) {
    return (
      task.mine?.current === true &&
      task.viewing?.status === 'CHO_XAC_NHAN' &&
      task.status !== 'DONE' &&
      task.status !== 'CANCELLED' &&
      task.status !== 'PENDING_CONFIRM' &&
      (this.assignment?.status === 'REGISTERED' || this.assignment?.status === 'IN_PROGRESS')
    );
  }
  canRecord(task: Task) {
    return this.canEdit(task) && task.viewing?.status === 'DA_XAC_NHAN';
  }
  draft(room: ApiViewingRoom) {
    return (this.drafts[room.detailId] ??= { viewStatus: room.viewStatus, note: room.note || '' });
  }
  viewingStatus(status: ApiTaskViewing['status']) {
    return (
      {
        CHO_XAC_NHAN: 'Chờ xác nhận',
        DA_XAC_NHAN: 'Đã xác nhận',
        DA_XEM: 'Đã xem',
        DA_HUY: 'Đã hủy',
      }[status] || 'Chưa xác định'
    );
  }
  taskStatus(status: Task['status']) {
    return (
      {
        UNASSIGNED: 'Chưa giao',
        TODO: 'Đã giao',
        IN_PROGRESS: 'Đã giao',
        PENDING_CONFIRM: 'Chờ xác nhận',
        DONE: 'Hoàn thành',
        WAITING_ADMIN: 'Chờ giao lại',
        CANCELLED: 'Đã hủy',
      }[status] || 'Chưa xác định'
    );
  }
  async confirmViewing(task: Task) {
    if (!this.canConfirm(task) || !task.viewing) return;
    await this.perform(async () => {
      await firstValueFrom(this.viewingApi.updateStatus(task.viewing!.id, 'DA_XAC_NHAN'));
      await this.shifts.api.refresh();
    }, 'Đã xác nhận lịch với khách.');
  }
  async saveRoom(task: Task, room: ApiViewingRoom) {
    if (!this.canRecord(task)) return;
    const draft = this.draft(room);
    if (draft.note.length > 1000) {
      this.error = 'Ghi chú phòng không quá 1000 ký tự. Vui lòng rút ngắn ghi chú.';
      return;
    }
    await this.perform(async () => {
      await firstValueFrom(
        this.viewingApi.updateDetail(room.detailId, draft.viewStatus, draft.note),
      );
      await this.shifts.api.refresh();
    }, 'Đã lưu kết quả xem phòng.');
  }
  async completeViewing(task: Task) {
    if (this.busy || !this.canRecord(task) || !task.viewing) return;
    if (!window.confirm('Hoàn tất dẫn khách xem phòng? Công việc sẽ được đánh dấu hoàn thành.'))
      return;
    await this.perform(async () => {
      await firstValueFrom(this.viewingApi.updateStatus(task.viewing!.id, 'DA_XEM'));
      await this.shifts.api.refresh();
    }, 'Đã hoàn tất dẫn xem.');
  }
  private async perform(action: () => Promise<unknown>, message = 'Đã cập nhật công việc.') {
    if (this.busy || this.tasksLoading() || this.shifts.api.loading()) return;
    this.busy = true;
    this.error = '';
    this.success.set('');
    try {
      await action();
      this.drafts = {};
      if (!this.shifts.api.error()) this.success.set(message);
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.busy = false;
    }
  }
  readonly clock$ = timer(0, 1000).pipe(map(() => new Date()));
  get elapsed() {
    const record = this.attendance.get(this.id);
    if (!record) return '00:00:00';
    const seconds = Math.max(
      0,
      Math.floor(
        ((record.checkOutAt ? Date.parse(record.checkOutAt) : Date.now()) -
          Date.parse(record.checkInAt)) /
          1000,
      ),
    );
    return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
      .map((n) => String(n).padStart(2, '0'))
      .join(':');
  }
  get timePercent() {
    const shift = this.shift;
    const record = this.attendance.get(this.id);
    if (!shift || !record) return 0;
    const start = Date.parse(shift.date + 'T' + shift.start);
    const end = Date.parse(shift.date + 'T' + shift.end);
    const now = record.checkOutAt ? Date.parse(record.checkOutAt) : Date.now();
    return end > start
      ? Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)))
      : 0;
  }
  get assignment() {
    return this.shifts.get(this.id);
  }
  get shift() {
    return this.shifts.shift(this.assignment?.shiftId || '');
  }
  get list() {
    return this.allTasks().filter((t) => t.title.toLowerCase().includes(this.filter.toLowerCase()));
  }
  trackTask(_index: number, task: Task) {
    return task.id;
  }
  trackRoom(_index: number, room: ApiViewingRoom) {
    return room.detailId;
  }
  get done() {
    return this.allTasks().filter((t) => t.mine?.personalStatus === 'DONE' || t.status === 'DONE')
      .length;
  }
  get percent() {
    const all = this.allTasks();
    return all.length ? Math.round((this.done / all.length) * 100) : 0;
  }
}
