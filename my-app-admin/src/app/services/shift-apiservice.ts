import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  ApiAssignment,
  ApiPeriod,
  ApiShift,
  ApiShiftState,
  ApiTask,
  TaskCreate,
  TaskReject,
  TaskUpdate,
} from '../classes/ShiftApi';
import { AuthService } from './auth-service';
import { apiMessage } from './api-message';

@Injectable({ providedIn: 'root' })
export class ShiftAPIService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private owner = signal('');
  private generation = 0;
  private pending = new Map<string, string>();
  private uploaded = new WeakMap<File, string>();
  private taskAssignmentId = '';
  private taskOwner = this.auth.account()?.id;
  readonly online = computed(() => this.auth.serverAuthenticated());
  readonly loading = signal(false);
  readonly error = signal('');
  private data = signal<{
    period: ApiPeriod | null;
    periods: ApiPeriod[];
    shifts: ApiShift[];
    assignments: ApiAssignment[];
    tasks: ApiTask[];
    admin: ApiShiftState | null;
  }>(this.empty());
  readonly state = computed(() =>
    this.auth.serverAuthenticated() && this.owner() === this.auth.account()?.id
      ? this.data()
      : this.empty(),
  );
  private options = { withCredentials: true, timeout: 60000 };
  constructor() {
    effect(() => {
      const account = this.auth.account(),
        server = this.auth.serverAuthenticated();
      untracked(() => {
        this.generation++;
        this.owner.set('');
        this.data.set(this.empty());
        if (!server || this.taskOwner !== account?.id) this.taskAssignmentId = '';
        this.taskOwner = account?.id;
        this.error.set('');
        if (account && server && ['EMPLOYEE', 'ADMIN'].includes(account.role)) void this.refresh();
      });
    });
  }
  private empty() {
    return {
      period: null as ApiPeriod | null,
      periods: [] as ApiPeriod[],
      shifts: [] as ApiShift[],
      assignments: [] as ApiAssignment[],
      tasks: [] as ApiTask[],
      admin: null as ApiShiftState | null,
    };
  }
  private get<T>(path: string) {
    return firstValueFrom(this.http.get<T>('/data/' + path, this.options));
  }
  message(error: unknown): string {
    const value = error instanceof HttpErrorResponse ? error.error : null;
    const code = value?.code;
    if (error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500))
      return apiMessage(error, 'Không thực hiện được yêu cầu.');
    const labels: Record<string, string> = {
      WEEK_EXISTS: 'Tuần này đã có đợt đăng ký.',
      MONDAY_REQUIRED: 'Ngày bắt đầu đợt phải là thứ Hai.',
      NAME_REQUIRED: 'Vui lòng nhập tên.',
      PERIOD_IN_USE: 'Không thể xóa đợt đã có nhân viên nhận ca hoặc đã có công việc.',
      PERIOD_STATE: 'Trạng thái đợt không cho phép thao tác này.',
      PERIOD_ENDED: 'Tuần của đợt này đã kết thúc, không thể xếp bù ca.',
      TASK_LOCKED: 'Công việc đã hoàn thành hoặc đã hủy, không thể thay đổi.',
      TASK_NOT_PENDING_CONFIRM: 'Công việc không ở trạng thái chờ xác nhận.',
      EMPLOYEE_BUSY:
        'Nhân viên đã có lịch dẫn khách khác vào giờ này. Vui lòng chọn nhân viên hoặc giờ khác.',
      VIEWING_TIME_CONFLICT: 'Khách đã có lịch xem khác vào giờ này. Vui lòng chọn giờ khác.',
      VIEWING_PAST: 'Chọn giờ xem trong ca tương lai đã chọn.',
      TASK_PENDING_CONFIRM:
        'Công việc đang chờ xác nhận hoàn thành, hãy xác nhận hoặc trả lại trước.',
      SHIFT_STARTED: 'Ca đã bắt đầu, hãy chọn ca khác.',
      REASON_REQUIRED: 'Lý do chưa đạt phải từ 3 đến 500 ký tự.',
      ASSIGNEE_DONE: 'Không thể bỏ nhân viên đã hoàn thành phần việc.',
      ASSIGNEES_REQUIRED: 'Chọn ít nhất một nhân viên trong ca.',
      VIEWING_SHIFT_LOCKED: 'Việc dẫn khách gắn với giờ xem, không đổi ca được.',
      TASK_HAS_PROGRESS: 'Không thể xóa công việc đã có phần hoàn thành.',
      ONE_ASSIGNEE_REQUIRED: 'Việc dẫn khách xem phòng cần đúng một người phụ trách.',
      VIEWING_TITLE_LOCKED: 'Không đổi tên việc dẫn khách xem phòng.',
      VIEWING_TASK_CANCEL_VIA_VIEWING: 'Việc dẫn khách chỉ hủy khi lịch xem bị hủy.',
      VIEWING_TASK_AUTO: 'Việc dẫn khách tự hoàn thành khi ghi kết quả xem phòng.',
      INVALID_ASSIGNEE: 'Nhân viên được chọn không trực ca này.',
      SHIFT_CLOSED: 'Ca đã kết thúc hoặc đã đóng.',
      CHECK_IN_REQUIRED: 'Cần check-in ca trước khi ghi kết quả dẫn xem.',
      VIEWING_OUTSIDE_SHIFT_HOURS: 'Giờ xem phải bắt đầu trong 07:00–10:30 hoặc 13:00–16:30.',
      SHIFT_FULL: 'Ca vừa đủ 6 người. Vui lòng chọn ca khác.',
      CONCURRENT_CHANGE: 'Dữ liệu vừa thay đổi. Vui lòng tải lại và chọn ca còn chỗ.',
      ALREADY_REGISTERED: 'Bạn đã đăng ký ca này.',
      WEEKLY_SHIFT_LIMIT: 'Mỗi tuần tối đa 8 ca.',
      REQUIRE_5_TO_8_SHIFTS: 'Cần đăng ký từ 5 đến 8 ca trong tuần trước khi nộp.',
      REGISTRATION_CLOSED: 'Đợt đăng ký chưa mở hoặc đã đóng.',
      PERIOD_OPEN_WINDOW: 'Chỉ mở từ 08:00 thứ Năm đến trước 20:00 Chủ Nhật tuần trước.',
      OUTSIDE_CHECK_IN_WINDOW: 'Chỉ check-in trong thời gian của ca.',
      OUTSIDE_WORK_LOCATION: 'Bạn đang ngoài bán kính cho phép của trụ sở.',
      POLICY_NOT_CONFIGURED: 'Chưa cấu hình mức phạt trễ. Vui lòng liên hệ quản trị viên.',
      PAYROLL_PERIOD_LOCKED_OR_MISSING:
        'Kỳ lương chưa mở hoặc đã khóa. Vui lòng liên hệ quản trị viên.',
      ATTENDANCE_PHOTO_REQUIRED: 'Cần tải ảnh minh chứng trước khi xác nhận.',
    };
    return (
      labels[code] ||
      (error instanceof HttpErrorResponse && error.status === 401
        ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
        : error instanceof HttpErrorResponse && error.status === 403
          ? 'Bạn không có quyền thực hiện thao tác này.'
          : 'Không thực hiện được thao tác. Vui lòng tải lại và thử lại.')
    );
  }
  async refresh() {
    if (!this.auth.serverAuthenticated()) return;
    const actor = this.auth.account(),
      version = ++this.generation;
    if (!actor) return;
    this.loading.set(true);
    try {
      const next = this.empty();
      if (actor.role === 'ADMIN') {
        const [periods, admin] = await Promise.all([
          this.get<ApiPeriod[]>('admin/registration-periods'),
          this.get<ApiShiftState>('admin/shift-state'),
        ]);
        next.periods = periods;
        next.admin = admin;
        next.shifts = admin.Shift;
        next.assignments = admin.ShiftAssignment;
        next.tasks = admin.Task;
      } else {
        const [period, assignments] = await Promise.all([
          this.get<ApiPeriod | null>('registration-periods/current'),
          this.get<ApiAssignment[]>('me/shift-assignments'),
        ]);
        next.period = period;
        next.assignments = assignments;
        next.shifts = period
          ? await this.get<ApiShift[]>('shifts?periodId=' + encodeURIComponent(period.id))
          : [];
        for (const a of assignments)
          if (a.shift && !next.shifts.some((s) => s.id === a.shiftId)) next.shifts.push(a.shift);
        if (this.taskAssignmentId && assignments.some((a) => a.id === this.taskAssignmentId))
          next.tasks = await this.get<ApiTask[]>(
            `me/shift-assignments/${this.taskAssignmentId}/tasks`,
          );
      }
      if (version !== this.generation || actor.id !== this.auth.account()?.id) return;
      this.owner.set(actor.id);
      this.data.set(next);
      this.error.set('');
    } catch (error) {
      if (version !== this.generation) return;
      this.data.set(this.empty());
      this.error.set(this.message(error));
    } finally {
      if (version === this.generation) this.loading.set(false);
    }
  }
  async write<T>(
    path: string,
    body: unknown = {},
    method: 'POST' | 'PUT' | 'DELETE' = 'POST',
  ): Promise<T> {
    if (!this.online()) throw new Error('Cần phiên đăng nhập máy chủ.');
    const actor = this.auth.account()?.id,
      signature = `${actor}:${method}:${path}:${JSON.stringify(body)}`;
    let key = this.pending.get(signature);
    if (!key) {
      key = crypto.randomUUID();
      this.pending.set(signature, key);
    }
    try {
      const result = await firstValueFrom(
        this.http.request<T>(method, '/data/' + path, {
          ...this.options,
          body,
          headers: { 'Idempotency-Key': key },
        }),
      );
      this.pending.delete(signature);
      await this.refresh();
      return result;
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status >= 400 && error.status < 500)
        this.pending.delete(signature);
      throw Object.assign(new Error(this.message(error)), {
        status: error instanceof HttpErrorResponse ? error.status : undefined,
        code: error instanceof HttpErrorResponse ? error.error?.code : undefined,
      });
    }
  }
  createTask(body: TaskCreate) {
    return this.write<ApiTask>('admin/tasks', body);
  }
  async listTasks(): Promise<ApiTask[]> {
    if (!this.online()) throw new Error('Cần phiên đăng nhập máy chủ.');
    const actor = this.auth.account()?.id;
    try {
      const tasks = await this.get<ApiTask[]>('admin/tasks');
      return actor === this.auth.account()?.id && this.online() ? tasks : [];
    } catch (error) {
      throw new Error(this.message(error));
    }
  }
  updateTask(id: string, body: TaskUpdate) {
    return this.write<ApiTask>(`admin/tasks/${encodeURIComponent(id)}`, body, 'PUT');
  }
  confirmTask(id: string) {
    return this.write<ApiTask>(`admin/tasks/${encodeURIComponent(id)}/confirm`);
  }
  rejectTask(id: string, body: TaskReject) {
    return this.write<ApiTask>(`admin/tasks/${encodeURIComponent(id)}/reject`, body);
  }
  cancelTask(id: string) {
    return this.write<{ id: string; deleted: boolean }>(
      `admin/tasks/${encodeURIComponent(id)}`,
      {},
      'DELETE',
    );
  }
  renamePeriod(id: string, name: string) {
    return this.write<ApiPeriod>(
      `admin/registration-periods/${encodeURIComponent(id)}`,
      { name: name.trim() },
      'PUT',
    );
  }
  deletePeriod(id: string) {
    return this.write<{ id: string; deleted: boolean }>(
      `admin/registration-periods/${encodeURIComponent(id)}`,
      {},
      'DELETE',
    );
  }
  async loadTasks(id: string) {
    this.taskAssignmentId = id;
    this.taskOwner = this.auth.account()?.id;
    if (!this.online()) return;
    const actor = this.auth.account()?.id,
      generation = this.generation;
    try {
      const tasks = await this.get<ApiTask[]>(`me/shift-assignments/${id}/tasks`);
      if (actor !== this.auth.account()?.id || generation !== this.generation || !this.online())
        return;
      this.data.update((s) => ({
        ...s,
        tasks: [...s.tasks.filter((t) => !tasks.some((n) => n.id === t.id)), ...tasks],
      }));
    } catch (error) {
      if (actor === this.auth.account()?.id && generation === this.generation)
        this.error.set(this.message(error));
    }
  }
  async upload(file: File) {
    const cached = this.uploaded.get(file);
    if (cached) return cached;
    const body = new FormData();
    body.append('file', file);
    try {
      const url = (
        await firstValueFrom(
          this.http.post<{ url: string }>('/api/upload/attendance', body, this.options),
        )
      ).url;
      this.uploaded.set(file, url);
      return url;
    } catch (error) {
      throw new Error(this.message(error));
    }
  }
  locate(): Promise<{ lat: number; lng: number }> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Thiết bị không hỗ trợ GPS.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => reject(new Error('Không lấy được vị trí. Hãy cho phép GPS và thử lại.')),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
      );
    });
  }
}
