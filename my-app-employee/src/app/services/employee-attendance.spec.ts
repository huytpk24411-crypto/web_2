import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthService } from './auth-service';
import { ShiftService } from './shift-service';
import { AttendanceService } from './attendance-service';
import { TaskService } from './task-service';

describe('Employee attendance and tasks over HTTP', () => {
  let shifts: ShiftService,
    attendance: AttendanceService,
    tasks: TaskService,
    http: HttpTestingController;
  const assignment = {
    id: 'assignment-a',
    employeeId: 'employee-a',
    shiftId: 'shift-a',
    registrationId: 'registration-a',
    status: 'REGISTERED',
  };
  async function request(method: string, url: string): Promise<TestRequest> {
    let req!: TestRequest;
    await vi.waitFor(() => {
      req = http.expectOne({ method, url });
    });
    return req;
  }
  async function refresh(status = 'REGISTERED') {
    (await request('GET', '/data/registration-periods')).flush([]);
    http.expectOne('/data/me/shift-assignments').flush([{ ...assignment, status }]);
  }
  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: {
            account: signal({ id: 'account-a', role: 'EMPLOYEE' }),
            serverAuthenticated: signal(true),
          },
        },
      ],
    });
    shifts = TestBed.inject(ShiftService);
    attendance = TestBed.inject(AttendanceService);
    tasks = TestBed.inject(TaskService);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
    await refresh();
    await Promise.resolve();
    await Promise.resolve();
  });
  afterEach(() => {
    http.verify();
    vi.unstubAllGlobals();
  });
  it.each(['SHIFT_FULL', 'ALREADY_REGISTERED', 'WEEKLY_SHIFT_LIMIT', 'REQUIRE_5_TO_8_SHIFTS'])(
    'does not register locally after %s',
    async (code) => {
      const loading = shifts.api.refresh();
      (await request('GET', '/data/registration-periods')).flush([
        {
          id: 'open-week',
          name: 'Tuần đang mở',
          weekStart: '2099-01-05',
          weekEnd: '2099-01-11',
          opensAt: '2098-12-01T00:00:00+07:00',
          closesAt: '2099-01-05T00:00:00+07:00',
          minShifts: 5,
          maxShifts: 8,
          status: 'OPEN',
        },
      ]);
      http.expectOne('/data/me/shift-assignments').flush([assignment]);
      (await request('GET', '/data/shifts?periodId=open-week')).flush([]);
      await loading;
      const pending = shifts.registerRequest(['shift-b']),
        rejected = expect(pending).rejects.toThrow();
      http
        .expectOne('/data/me/shift-registrations')
        .flush({ code }, { status: 409, statusText: 'Conflict' });
      await rejected;
      expect(shifts.mine().map((a) => a.id)).toEqual(['assignment-a']);
    },
  );
  it('requires GPS and an uploaded file; retries an uncertain check-in with identical coordinates and key', async () => {
    const locate = vi.fn((success: (p: unknown) => void) =>
      success({ coords: { latitude: 10.8, longitude: 106.7 } }),
    );
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: locate } });
    const file = new File(['photo'], 'face.jpg', { type: 'image/jpeg' });
    const pending = attendance.checkInRequest(assignment.id, '', 'Bắt đầu', file);
    const rejected = expect(pending).rejects.toThrow('Không kết nối được máy chủ');
    const upload = await request('POST', '/api/upload/attendance');
    expect((upload.request.body as FormData).get('file')).toBe(file);
    upload.flush({ url: '/uploads/attendance/photo.jpg' });
    const checkIn = await request('POST', '/data/me/shift-assignments/assignment-a/check-in');
    expect(checkIn.request.body.geo).toEqual({ lat: 10.8, lng: 106.7 });
    expect(checkIn.request.body.evidenceUrl).toBe('/uploads/attendance/photo.jpg');
    const key = checkIn.request.headers.get('Idempotency-Key');
    checkIn.error(new ProgressEvent('error'));
    await rejected;
    expect(attendance.get(assignment.id)).toBeUndefined();
    const retry = attendance.checkInRequest(assignment.id, '', 'Đổi ghi chú', file);
    const denied = expect(retry).rejects.toThrow();
    const next = await request('POST', '/data/me/shift-assignments/assignment-a/check-in');
    expect(next.request.headers.get('Idempotency-Key')).toBe(key);
    expect(next.request.body.note).toBe('Bắt đầu');
    next.flush({ code: 'OUTSIDE_WORK_LOCATION' }, { status: 400, statusText: 'Invalid' });
    await denied;
    expect(locate).toHaveBeenCalledTimes(1);
    http.expectNone('/api/upload/attendance');
  });
  it('does not post attendance when GPS permission is denied', async () => {
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition: (_success: unknown, fail: () => void) => fail() },
    });
    await expect(
      attendance.checkInRequest(assignment.id, '', '', new File(['x'], 'face.jpg')),
    ).rejects.toThrow('cho phép GPS');
    http.expectNone((r) => r.method === 'POST');
  });
  it('does not post check-out without confirmation and a real file', async () => {
    await expect(attendance.checkOutRequest(assignment.id, '/preview.jpg', true)).rejects.toThrow(
      'ảnh minh chứng',
    );
    http.expectNone((r) => r.method === 'POST');
  });
  it('updates only the personal task status and reads the server group status', async () => {
    const updated = shifts.api.refresh();
    await refresh('IN_PROGRESS');
    await updated;
    const task = {
      id: 'task-a',
      title: 'Liên hệ khách',
      status: 'IN_PROGRESS',
      editable: true,
      mine: { taskAssignmentId: 'part-a', personalStatus: 'TODO', current: true },
      currentShiftId: 'shift-a',
      shiftLinks: [],
      assignees: [
        {
          id: 'part-a',
          assignmentId: assignment.id,
          employeeId: 'employee-a',
          personalStatus: 'TODO',
        },
      ],
      currentAssignees: [
        {
          id: 'part-a',
          assignmentId: assignment.id,
          employeeId: 'employee-a',
          personalStatus: 'TODO',
        },
      ],
    };
    const loaded = shifts.api.loadTasks(assignment.id);
    http.expectOne('/data/me/shift-assignments/assignment-a/tasks').flush([task]);
    await loaded;
    const toggled = tasks.completeRequest(task.id, assignment.id);
    const req = http.expectOne('/data/tasks/task-a/my-status');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ assignmentId: assignment.id, personalStatus: 'DONE' });
    req.flush({});
    await refresh('IN_PROGRESS');
    const done = {
      ...task,
      mine: { ...task.mine, personalStatus: 'DONE' },
      assignees: task.assignees.map((a) => ({ ...a, personalStatus: 'DONE' })),
      currentAssignees: task.currentAssignees.map((a) => ({ ...a, personalStatus: 'DONE' })),
    };
    (await request('GET', '/data/me/shift-assignments/assignment-a/tasks')).flush([done]);
    (await request('GET', '/data/me/shift-assignments/assignment-a/tasks')).flush([done]);
    await toggled;
    expect(tasks.list(assignment.id)[0].doneBy).toEqual(['account-a']);
    expect(tasks.list(assignment.id)[0].status).toBe('IN_PROGRESS');
  });
  it('uploads check-out evidence and reads task handover from the server', async () => {
    const active = shifts.api.refresh();
    await refresh('IN_PROGRESS');
    await active;
    const pending = attendance.checkOutRequest(
      assignment.id,
      '',
      true,
      new File(['photo'], 'out.jpg', { type: 'image/jpeg' }),
    );
    (await request('POST', '/api/upload/attendance')).flush({ url: '/uploads/attendance/out.jpg' });
    const checkOut = await request('POST', '/data/me/shift-assignments/assignment-a/check-out');
    expect(checkOut.request.body).toEqual({
      confirmed: true,
      evidenceUrl: '/uploads/attendance/out.jpg',
    });
    checkOut.flush({});
    await refresh('COMPLETED');
    (await request('GET', '/data/me/shift-assignments/assignment-a/tasks')).flush([]);
    await pending;
    expect(shifts.get(assignment.id)?.status).toBe('COMPLETED');
    const loaded = shifts.api.loadTasks('assignment-next');
    http.expectOne('/data/me/shift-assignments/assignment-next/tasks').flush([
      {
        id: 'task-carried',
        title: 'Tiếp tục liên hệ khách',
        status: 'TODO',
        currentShiftId: 'next-shift',
        shiftLinks: [],
        assignees: [
          {
            id: 'old-part',
            assignmentId: assignment.id,
            employeeId: 'employee-a',
            personalStatus: 'TODO',
            transferredTo: 'new-part',
          },
          {
            id: 'new-part',
            assignmentId: 'assignment-next',
            employeeId: 'employee-a',
            personalStatus: 'TODO',
            fromTaskAssignmentId: 'old-part',
          },
        ],
        currentAssignees: [
          {
            id: 'new-part',
            assignmentId: 'assignment-next',
            employeeId: 'employee-a',
            personalStatus: 'TODO',
          },
        ],
      },
    ]);
    await loaded;
    expect(tasks.list('assignment-next')[0].carriedFrom).toBe(assignment.id);
    expect(tasks.list('assignment-next')[0].status).toBe('TODO');
  });
});
