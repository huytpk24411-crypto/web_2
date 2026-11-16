import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiAssignment, ApiPeriod, ApiShift, ApiShiftState, ApiTask } from '../classes/ShiftApi';
import { AuthService } from './auth-service';
import { apiMessage } from './api-message';

export const SHIFT_ERROR_FALLBACK = 'Không thực hiện được thao tác. Vui lòng tải lại và thử lại.';
export function shiftApiMessage(error: unknown): string {
  let value = error instanceof HttpErrorResponse ? error.error : null;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      value = null;
    }
  }
  const labels: Record<string, string> = {
    INVALID_VIEWING_DETAILS: 'Kiểm tra kết quả xem và ghi chú của từng phòng.',
    SHIFT_CANCELLATION_NOT_ALLOWED: 'Nhân viên không được hủy ca đã đăng ký.',
    WEEK_EXISTS: 'Tuần này đã có đợt đăng ký.',
    MONDAY_REQUIRED: 'Ngày bắt đầu đợt phải là thứ Hai.',
    NAME_REQUIRED: 'Vui lòng nhập tên.',
    PERIOD_IN_USE: 'Không thể xóa đợt đã có nhân viên nhận ca hoặc đã có công việc.',
    PERIOD_STATE: 'Trạng thái đợt không cho phép thao tác này.',
    PERIOD_OPEN_WINDOW: 'Chỉ mở từ 08:00 thứ Năm đến trước 20:00 Chủ Nhật tuần trước.',
    TASK_LOCKED: 'Công việc đã hoàn thành hoặc đã hủy, không thể thay đổi.',
    ASSIGNEE_DONE: 'Không thể bỏ nhân viên đã hoàn thành phần việc.',
    ASSIGNEES_REQUIRED: 'Chọn ít nhất một nhân viên.',
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
    OUTSIDE_CHECK_IN_WINDOW: 'Chỉ được check-in trong giờ ca làm.',
    TASK_NOT_PENDING_CONFIRM: 'Công việc không ở trạng thái chờ xác nhận.',
    TASK_PENDING_CONFIRM:
      'Công việc đang chờ xác nhận hoàn thành, hãy xác nhận hoặc trả lại trước.',
    REASON_REQUIRED: 'Vui lòng nhập lý do từ 3 đến 500 ký tự.',
    SHIFT_STARTED: 'Ca đã bắt đầu, hãy chọn ca khác.',
    OUTSIDE_WORK_LOCATION: 'Bạn đang ngoài bán kính cho phép của trụ sở.',
    POLICY_NOT_CONFIGURED: 'Chưa cấu hình mức phạt trễ. Vui lòng liên hệ quản trị viên.',
    PAYROLL_PERIOD_LOCKED_OR_MISSING:
      'Kỳ lương chưa mở hoặc đã khóa. Vui lòng liên hệ quản trị viên.',
    ATTENDANCE_PHOTO_REQUIRED: 'Cần tải ảnh minh chứng trước khi xác nhận.',
  };
  if (labels[value?.code]) return labels[value.code];
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0 || error.status >= 500) return apiMessage(error, SHIFT_ERROR_FALLBACK);
    if (error.status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    if (error.status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
  }
  return SHIFT_ERROR_FALLBACK;
}

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
  private options = { withCredentials: true, timeout: 10000 };
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
    return shiftApiMessage(error);
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
      });
    }
  }
  async loadTasks(id: string) {
    if (this.taskAssignmentId !== id) this.data.update((s) => ({ ...s, tasks: [] }));
    this.taskAssignmentId = id;
    this.taskOwner = this.auth.account()?.id;
    if (!this.online()) return;
    const actor = this.auth.account()?.id,
      generation = this.generation;
    try {
      const tasks = await this.get<ApiTask[]>(`me/shift-assignments/${id}/tasks`);
      if (
        actor !== this.auth.account()?.id ||
        generation !== this.generation ||
        !this.online() ||
        id !== this.taskAssignmentId
      )
        return;
      this.data.update((s) => ({ ...s, tasks }));
      this.error.set('');
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
