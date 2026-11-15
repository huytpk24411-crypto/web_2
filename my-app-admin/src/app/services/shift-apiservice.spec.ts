import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthService } from './auth-service';
import { ShiftAPIService } from './shift-apiservice';
import { Account } from '../classes/Account';

describe('P4 transport and account isolation', () => {
  const account = signal<Account | null>({ id: 'a', username: 'a', name: 'A', role: 'EMPLOYEE' });
  const serverAuthenticated = signal(true);
  let api: ShiftAPIService, http: HttpTestingController;
  beforeEach(async () => {
    account.set({ id: 'a', username: 'a', name: 'A', role: 'EMPLOYEE' });
    serverAuthenticated.set(true);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { account, serverAuthenticated } },
      ],
    });
    api = TestBed.inject(ShiftAPIService);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
    http.expectOne('/data/registration-periods/current').flush(null);
    http.expectOne('/data/me/shift-assignments').flush([]);
    await Promise.resolve();
    await Promise.resolve();
  });
  afterEach(() => http.verify());
  it.each([
    ['WEEK_EXISTS', 'Tuần này đã có đợt đăng ký.'],
    ['MONDAY_REQUIRED', 'Ngày bắt đầu đợt phải là thứ Hai.'],
    ['NAME_REQUIRED', 'Vui lòng nhập tên.'],
    ['PERIOD_IN_USE', 'Không thể xóa đợt đã có nhân viên nhận ca hoặc đã có công việc.'],
    ['PERIOD_STATE', 'Trạng thái đợt không cho phép thao tác này.'],
    ['PERIOD_OPEN_WINDOW', 'Chỉ mở từ 08:00 thứ Năm đến trước 20:00 Chủ Nhật tuần trước.'],
    ['TASK_LOCKED', 'Công việc đã hoàn thành hoặc đã hủy, không thể thay đổi.'],
    ['TASK_NOT_PENDING_CONFIRM', 'Công việc không ở trạng thái chờ xác nhận.'],
    [
      'TASK_PENDING_CONFIRM',
      'Công việc đang chờ xác nhận hoàn thành, hãy xác nhận hoặc trả lại trước.',
    ],
    ['SHIFT_STARTED', 'Ca đã bắt đầu, hãy chọn ca khác.'],
    ['REASON_REQUIRED', 'Lý do chưa đạt phải từ 3 đến 500 ký tự.'],
    ['ASSIGNEE_DONE', 'Không thể bỏ nhân viên đã hoàn thành phần việc.'],
    ['ASSIGNEES_REQUIRED', 'Chọn ít nhất một nhân viên trong ca.'],
    ['VIEWING_SHIFT_LOCKED', 'Việc dẫn khách gắn với giờ xem, không đổi ca được.'],
    ['TASK_HAS_PROGRESS', 'Không thể xóa công việc đã có phần hoàn thành.'],
    ['ONE_ASSIGNEE_REQUIRED', 'Việc dẫn khách xem phòng cần đúng một người phụ trách.'],
    ['VIEWING_TITLE_LOCKED', 'Không đổi tên việc dẫn khách xem phòng.'],
    ['VIEWING_TASK_CANCEL_VIA_VIEWING', 'Việc dẫn khách chỉ hủy khi lịch xem bị hủy.'],
    ['VIEWING_TASK_AUTO', 'Việc dẫn khách tự hoàn thành khi ghi kết quả xem phòng.'],
    ['INVALID_ASSIGNEE', 'Nhân viên được chọn không trực ca này.'],
    ['SHIFT_CLOSED', 'Ca đã kết thúc hoặc đã đóng.'],
    ['CHECK_IN_REQUIRED', 'Cần check-in ca trước khi ghi kết quả dẫn xem.'],
    ['VIEWING_OUTSIDE_SHIFT_HOURS', 'Giờ xem phải bắt đầu trong 07:00–10:30 hoặc 13:00–16:30.'],
  ])('maps SHIFT-API error %s without exposing server messages', (code, expected) => {
    expect(
      api.message(
        new HttpErrorResponse({ status: 409, error: { code, message: 'Raw server message' } }),
      ),
    ).toBe(expected);
  });
  it('uses a Vietnamese fallback for unknown codes and unstructured errors', () => {
    const fallback = 'Không thực hiện được thao tác. Vui lòng tải lại và thử lại.';
    expect(
      api.message(
        new HttpErrorResponse({
          status: 400,
          error: { code: 'UNRECOGNIZED', message: 'Raw error' },
        }),
      ),
    ).toBe(fallback);
    expect(
      api.message(new HttpErrorResponse({ status: 400, error: { message: 'Raw error' } })),
    ).toBe(fallback);
    expect(api.message(new Error('UNRECOGNIZED'))).toBe(fallback);
  });
  it('loads the management list without adding another read to shared refresh', async () => {
    const pending = api.listTasks();
    const request = http.expectOne('/data/admin/tasks');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.method).toBe('GET');
    request.flush([]);
    expect(await pending).toEqual([]);
  });
  it('discards a management response after the account changes', async () => {
    const pending = api.listTasks();
    const request = http.expectOne('/data/admin/tasks');
    account.set({ id: 'b', username: 'b', name: 'B', role: 'EMPLOYEE' });
    request.flush([{ id: 'old-owner-task' }]);
    expect(await pending).toEqual([]);
  });
  it.each([
    {
      action: 'draft',
      method: 'POST',
      path: '/data/admin/tasks',
      body: { title: 'Chưa giao', description: '', kind: 'GENERAL' as const },
    },
    {
      action: 'assign',
      method: 'POST',
      path: '/data/admin/tasks',
      body: {
        title: 'Đã giao',
        description: '',
        kind: 'GENERAL' as const,
        shiftId: 's',
        assigneeAssignmentIds: ['a'],
      },
    },
    {
      action: 'edit',
      method: 'PUT',
      path: '/data/admin/tasks/task',
      body: {
        title: 'Đổi ca',
        description: '',
        shiftId: 'new',
        assigneeAssignmentIds: ['new-assignment'],
      },
    },
    { action: 'delete', method: 'DELETE', path: '/data/admin/tasks/task', body: {} },
  ])('uses the v2 transport contract for $action', async ({ action, method, path, body }) => {
    const pending =
      action === 'delete'
        ? api.cancelTask('task')
        : action === 'edit'
          ? api.updateTask('task', body)
          : api.createTask({
              ...body,
              title: body.title!,
              description: body.description!,
              kind: 'GENERAL',
            });
    const request = http.expectOne(path);
    expect(request.request.method).toBe(method);
    expect(request.request.body).toEqual(body);
    expect(request.request.headers.has('Idempotency-Key')).toBe(true);
    request.flush(action === 'delete' ? { id: 'task', deleted: true } : { id: 'task' });
    for (let i = 0; i < 12; i++) await Promise.resolve();
    http.expectOne('/data/registration-periods/current').flush(null);
    http.expectOne('/data/me/shift-assignments').flush([]);
    const result = await pending;
    if (action === 'delete') expect(result).toEqual({ id: 'task', deleted: true });
  });
  it('retains the key after a lost write response and never reports a local success', async () => {
    const path = 'me/shift-assignments/a/check-out',
      body = { confirmed: true, evidenceUrl: '/uploads/attendance/a.jpg' };
    const first = api.write(path, body),
      rejected = expect(first).rejects.toThrow('Không kết nối được máy chủ');
    const a = http.expectOne('/data/' + path),
      key = a.request.headers.get('Idempotency-Key');
    expect(a.request.withCredentials).toBe(true);
    a.error(new ProgressEvent('error'));
    await rejected;
    expect(api.online()).toBe(true);
    const retry = api.write(path, body),
      rejectedAgain = expect(retry).rejects.toThrow();
    const b = http.expectOne('/data/' + path);
    expect(b.request.headers.get('Idempotency-Key')).toBe(key);
    b.flush({ code: 'P4_RECOVERY_REQUIRED' }, { status: 503, statusText: 'Retry' });
    await rejectedAgain;
    expect(api.online()).toBe(true);
  });
  it.each([
    { action: 'confirm', body: {} },
    { action: 'reject', body: { reason: 'Chưa đạt yêu cầu' } },
    {
      action: 'reject',
      body: { reason: 'Chưa đạt yêu cầu', shiftId: 's', assigneeAssignmentIds: ['a'] },
    },
  ])(
    'POSTs task $action with an encoded id, credentials and idempotency key',
    async ({ action, body }) => {
      const pending =
        action === 'confirm'
          ? api.confirmTask('task/id')
          : api.rejectTask('task/id', { ...body, reason: body.reason! });
      const request = http.expectOne(`/data/admin/tasks/task%2Fid/${action}`);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual(body);
      expect(request.request.withCredentials).toBe(true);
      expect(request.request.headers.has('Idempotency-Key')).toBe(true);
      request.flush({ id: 'task/id' });
      for (let i = 0; i < 12; i++) await Promise.resolve();
      http.expectOne('/data/registration-periods/current').flush(null);
      http.expectOne('/data/me/shift-assignments').flush([]);
      expect(await pending).toEqual({ id: 'task/id' });
    },
  );
  it.each([401, 403, 409])(
    'does not write locally when a write is rejected with HTTP %s',
    async (status) => {
      const request = api.write('me/shift-registrations', { periodId: 'p', shiftIds: ['s'] });
      const rejected = expect(request).rejects.toThrow();
      http
        .expectOne('/data/me/shift-registrations')
        .flush({ code: 'SHIFT_FULL' }, { status, statusText: 'Rejected' });
      await rejected;
      expect(api.online()).toBe(true);
    },
  );
  it('keeps unavailable reads empty and reports permission errors', async () => {
    const read = api.refresh();
    http.expectOne('/data/registration-periods/current').flush(null);
    http.expectOne('/data/me/shift-assignments').error(new ProgressEvent('error'));
    await read;
    expect(api.online()).toBe(true);
    expect(api.state().assignments).toEqual([]);
    expect(api.error()).toContain('Không kết nối được máy chủ');
    const retry = api.refresh();
    http.expectOne('/data/registration-periods/current').flush(null);
    http
      .expectOne('/data/me/shift-assignments')
      .flush({ code: 'NOT_YOUR_ASSIGNMENT' }, { status: 403, statusText: 'Forbidden' });
    await retry;
    expect(api.error()).toContain('không có quyền');
    expect(api.online()).toBe(true);
    // Retry of a rejected read must not expose data from any other actor.
    account.set({ id: 'b', username: 'b', name: 'B', role: 'EMPLOYEE' });
    expect(api.state().assignments).toEqual([]);
  });
});
