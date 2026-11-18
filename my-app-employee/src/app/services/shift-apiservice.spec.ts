import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthService } from './auth-service';
import { ShiftAPIService } from './shift-apiservice';
import { Account } from '../classes/Account';
import { apiMessage } from './api-message';

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
    http.expectOne('/data/registration-periods').flush([]);
    http.expectOne('/data/me/shift-assignments').flush([]);
    await Promise.resolve();
    await Promise.resolve();
  });
  afterEach(() => http.verify());
  it.each([
    ['OUTSIDE_CHECK_IN_WINDOW', 'Chỉ được check-in trong giờ ca làm.'],
    ['TASK_NOT_PENDING_CONFIRM', 'Công việc không ở trạng thái chờ xác nhận.'],
    [
      'TASK_PENDING_CONFIRM',
      'Công việc đang chờ xác nhận hoàn thành, hãy xác nhận hoặc trả lại trước.',
    ],
    ['SHIFT_STARTED', 'Ca đã bắt đầu, hãy chọn ca khác.'],
  ])('translates ATT-API error %s in both frontend message tables', (code, message) => {
    for (const body of [{ code }, JSON.stringify({ code })]) {
      const error = new HttpErrorResponse({ status: 409, error: body });
      expect(api.message(error)).toBe(message);
      expect(apiMessage(error, 'fallback')).toBe(message);
    }
  });
  it.each(['CHECK_IN_REQUIRED', 'VIEWING_TASK_AUTO', 'TASK_LOCKED', 'SHIFT_CLOSED'])(
    'translates %s from object and text error bodies',
    (code) => {
      const objectMessage = api.message(new HttpErrorResponse({ status: 409, error: { code } }));
      expect(objectMessage).not.toContain(code);
      expect(objectMessage).not.toBe('Không thực hiện được thao tác. Vui lòng tải lại và thử lại.');
      expect(
        api.message(new HttpErrorResponse({ status: 409, error: JSON.stringify({ code }) })),
      ).toBe(objectMessage);
    },
  );
  it('hides unknown codes and untrusted server messages', () => {
    expect(
      api.message(
        new HttpErrorResponse({ status: 400, error: { code: 'UNKNOWN', message: 'raw error' } }),
      ),
    ).toBe('Không thực hiện được thao tác. Vui lòng tải lại và thử lại.');
  });
  it('replaces task responses so removed tasks cannot remain visible', async () => {
    const first = api.loadTasks('a');
    http.expectOne('/data/me/shift-assignments/a/tasks').flush([{ id: 'old' }]);
    await first;
    expect(api.state().tasks.map((task) => task.id)).toEqual(['old']);
    const second = api.loadTasks('a');
    http.expectOne('/data/me/shift-assignments/a/tasks').flush([]);
    await second;
    expect(api.state().tasks).toEqual([]);
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
    http.expectOne('/data/registration-periods').flush([]);
    http.expectOne('/data/me/shift-assignments').error(new ProgressEvent('error'));
    await read;
    expect(api.online()).toBe(true);
    expect(api.state().assignments).toEqual([]);
    expect(api.error()).toContain('Không kết nối được máy chủ');
    const retry = api.refresh();
    http.expectOne('/data/registration-periods').flush([]);
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
