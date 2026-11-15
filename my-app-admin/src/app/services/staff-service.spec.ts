import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth-service';
import { StaffService } from './staff-service';
import { ShiftAPIService } from './shift-apiservice';
import { ApiPeriod, ApiShiftState } from '../classes/ShiftApi';
import { StaffProfile } from '../classes/StaffProfile';

const employee: StaffProfile = {
  id: 'employee-test',
  employeeCode: 'NV101',
  fullName: 'Nhân viên kiểm thử',
  birthDate: '2000-01-01',
  startDate: '2025-01-01',
  gender: 'OTHER',
  phone: '0901234567',
  email: 'staff@example.test',
  position: 'Tư vấn',
  contractType: 'FULL_TIME',
  status: 'ACTIVE',
  avatar: '/uploads/employees/avatar.png',
  workLocationId: '',
};
const period: ApiPeriod = {
  id: 'period-test',
  name: 'Tuần kiểm thử',
  weekStart: '2026-11-02',
  weekEnd: '2026-11-08',
  opensAt: '2026-10-29T01:00:00Z',
  closesAt: '2026-11-01T13:00:00Z',
  minShifts: 5,
  maxShifts: 8,
  status: 'FINALIZED',
};
function shiftState(): ApiShiftState {
  return {
    Employee: [employee],
    WorkLocation: [],
    Shift: [
      {
        id: 'shift-test',
        periodId: period.id,
        date: '2026-11-03',
        startTime: '07:00',
        endTime: '11:00',
        startsAt: '2026-11-03T00:00:00Z',
        endsAt: '2026-11-03T04:00:00Z',
        capacity: 6,
        assignedCount: 1,
        status: 'OPEN',
        label: 'Ca sáng',
        workLocationId: 'location-test',
      },
    ],
    ShiftAssignment: [
      {
        id: 'assignment-test',
        employeeId: employee.id,
        shiftId: 'shift-test',
        registrationId: 'registration-test',
        status: 'COMPLETED',
      },
    ],
    Attendance: [
      {
        id: 'attendance-test',
        assignmentId: 'assignment-test',
        checkInAt: '2026-11-03T00:00:01Z',
        checkOutAt: '2026-11-03T04:00:00Z',
        evidence: [],
      },
    ],
    Task: [
      {
        id: 'task-test',
        title: 'Công việc',
        currentShiftId: 'shift-test',
        status: 'DONE',
        shiftLinks: [{ id: 'link-test', shiftId: 'shift-test' }],
        assignees: [
          {
            id: 'part-test',
            assignmentId: 'assignment-test',
            employeeId: employee.id,
            personalStatus: 'DONE',
          },
        ],
        currentAssignees: [
          {
            id: 'part-test',
            assignmentId: 'assignment-test',
            employeeId: employee.id,
            personalStatus: 'DONE',
          },
        ],
      },
    ],
    Policy: [
      {
        id: 'late-policy',
        type: 'PHAT_TRE',
        version: 1,
        status: 'ACTIVE',
        effectiveFrom: '2026-01-01T00:00:00Z',
      },
    ],
    PolicyLevel: [{ id: 'level-test', policyId: 'late-policy', from: 1, to: 2, amount: 10000 }],
  };
}
describe('StaffService API state', () => {
  let http: HttpTestingController;
  let repository: StaffService;
  let data: ApiShiftState;
  let auth: {
    account: ReturnType<typeof signal>;
    serverAuthenticated: ReturnType<typeof signal<boolean>>;
  };
  async function settle() {
    for (let i = 0; i < 6; i++) await Promise.resolve();
    TestBed.tick();
  }
  async function flushShifts() {
    http.expectOne('/data/admin/registration-periods').flush([period]);
    http.expectOne('/data/admin/shift-state').flush(data);
    await settle();
  }
  beforeEach(async () => {
    data = shiftState();
    auth = {
      account: signal({ id: 'admin-test', role: 'ADMIN' }),
      serverAuthenticated: signal(true),
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
      ],
    });
    repository = TestBed.inject(StaffService);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
    http.expectOne('/data/admin/employees').flush([employee]);
    http.expectOne('/data/admin/work-locations').flush([]);
    await flushShifts();
  });
  afterEach(() => http.verify());
  it('labels fixed contract codes without exposing unknown raw values', () => {
    expect(repository.contractTypeLabel('FULL_TIME')).toBe('Toàn thời gian');
    expect(repository.contractTypeLabel('PART_TIME')).toBe('Bán thời gian');
    expect(repository.contractTypeLabel('INTERNSHIP')).toBe('Thực tập');
    expect(repository.contractTypeLabel('UNKNOWN_CODE')).toBe('Chưa xác định');
  });
  it('preserves AUTO_RANDOM assignments and UNASSIGNED tasks from the v2 shift state', async () => {
    data.ShiftAssignment[0].source = 'AUTO_RANDOM';
    data.Task[0] = {
      ...data.Task[0],
      status: 'UNASSIGNED',
      currentShiftId: null,
      shiftLinks: [],
      assignees: [],
      currentAssignees: [],
    };
    const refresh = TestBed.inject(ShiftAPIService).refresh();
    await flushShifts();
    await refresh;
    await settle();
    expect(repository.state().assignments[0].source).toBe('AUTO_RANDOM');
    expect(repository.state().tasks[0]).toMatchObject({
      status: 'UNASSIGNED',
      currentShiftId: '',
      assigneeIds: [],
      doneBy: [],
    });
  });
  it('derives completion, strict punctuality, rounded late minutes and policy matches from HTTP data', () => {
    expect(repository.metrics(employee.id, period.id)).toMatchObject({
      assigned: 1,
      completed: 1,
      onTime: 0,
      lateMinutes: 1,
      penalizedLate: 1,
      tasksTotal: 1,
      tasksDone: 1,
      taskRate: 100,
    });
    expect(repository.metrics(employee.id, 'another-period').assigned).toBe(0);
  });
  it('counts on-time check-ins at startsAt and zero-value penalty levels separately', async () => {
    data.Attendance[0].checkInAt = data.Shift[0].startsAt;
    const refresh = TestBed.inject(ShiftAPIService).refresh();
    await flushShifts();
    await refresh;
    await settle();
    expect(repository.metrics(employee.id)).toMatchObject({
      onTime: 1,
      lateMinutes: 0,
      penalizedLate: 0,
    });
    data.Attendance[0].checkInAt = '2026-11-03T00:02:00Z';
    data.PolicyLevel.push({ id: 'grace', policyId: 'late-policy', from: 2, to: null, amount: 0 });
    const next = TestBed.inject(ShiftAPIService).refresh();
    await flushShifts();
    await next;
    await settle();
    expect(repository.metrics(employee.id)).toMatchObject({
      onTime: 0,
      lateMinutes: 2,
      penalizedLate: 0,
    });
  });
  it('counts each employee once when a task has transfer history', async () => {
    data.Task[0].assignees.push({
      ...data.Task[0].assignees[0],
      id: 'old-part',
      personalStatus: 'TODO',
      transferredTo: 'part-test',
    });
    data.Task[0].shiftLinks.push({
      id: 'next-link',
      shiftId: 'shift-test',
      fromShiftId: 'previous-shift',
    });
    const refresh = TestBed.inject(ShiftAPIService).refresh();
    await flushShifts();
    await refresh;
    await settle();
    expect(repository.metrics(employee.id)).toMatchObject({ tasksTotal: 1, tasksDone: 1 });
    expect(repository.state().tasks[0].transferCount).toBe(1);
  });
  it('uses only current recipients and completion while retaining task details and history', async () => {
    const task = data.Task[0];
    task.kind = 'VIEWING';
    task.description = 'Đón khách tại sảnh';
    task.viewing = {
      id: 'viewing',
      status: 'DA_XAC_NHAN',
      date: '2026-11-03',
      startTime: '08:00',
      endTime: '08:30',
      viewerName: 'Khách kiểm thử',
      peopleCount: 2,
      rooms: [{ roomId: 'room', code: 'P101', name: 'Phòng 101' }],
    };
    task.status = 'TODO';
    task.assignees[0].removed = true;
    task.currentAssignees = [
      {
        ...task.assignees[0],
        id: 'new-part',
        employeeId: 'current-employee',
        personalStatus: 'TODO',
        removed: false,
      },
    ];
    const refresh = TestBed.inject(ShiftAPIService).refresh();
    await flushShifts();
    await refresh;
    await settle();
    expect(repository.state().tasks[0]).toMatchObject({
      kind: 'VIEWING',
      description: task.description,
      viewing: task.viewing,
      status: 'TODO',
      currentAssignees: task.currentAssignees,
      assigneeIds: ['current-employee'],
      doneBy: [],
      originShiftId: 'shift-test',
    });
    expect(repository.tasksFor(employee.id)).toEqual([]);
    expect(repository.tasksFor('current-employee')).toHaveLength(1);
    expect(task.assignees[0].personalStatus).toBe('DONE');
  });
  it('retains profiles when saving fails and sends the original server avatar URL', async () => {
    const saved = repository.saveEmployeeRecord({ ...employee, fullName: 'Tên mới' }, employee.id);
    const failed = expect(saved).rejects.toThrow();
    const request = http.expectOne('/data/admin/employees/' + employee.id);
    expect(request.request.body.avatar).toBe(employee.avatar);
    request.error(new ProgressEvent('error'));
    await failed;
    expect(repository.employee(employee.id)?.fullName).toBe(employee.fullName);
  });
  it('uses server validation for duplicate contact and inactive status changes', async () => {
    for (const code of ['PHONE_EXISTS', 'USE_DEACTIVATE']) {
      const save = repository.saveEmployeeRecord({ ...employee, status: 'INACTIVE' }, employee.id);
      const failed = expect(save).rejects.toThrow();
      http
        .expectOne('/data/admin/employees/' + employee.id)
        .flush({ code }, { status: 409, statusText: 'Conflict' });
      await failed;
      expect(repository.employee(employee.id)?.status).toBe('ACTIVE');
    }
  });
  it('accepts employee creation and temporary credentials only after the server responds', async () => {
    const save = repository.saveEmployeeRecord(employee);
    const request = http.expectOne('/data/admin/employees');
    expect(repository.temporaryPassword()).toBeNull();
    request.flush({
      employee: { ...employee, id: 'new-employee' },
      phone: employee.phone,
      temporaryPassword: 'Temporary123',
    });
    expect((await save).id).toBe('new-employee');
    expect(repository.temporaryPassword()?.password).toBe('Temporary123');
  });
  it('keeps assignments and unfinished work unchanged after rejected cancellation', async () => {
    const before = structuredClone(repository.state());
    const cancel = repository.cancelAssignment('assignment-test');
    const failed = expect(cancel).rejects.toThrow();
    const request = http.expectOne('/data/admin/shift-assignments/assignment-test');
    expect(request.request.method).toBe('DELETE');
    request.flush({ code: 'CANNOT_CANCEL_ASSIGNMENT' }, { status: 409, statusText: 'Conflict' });
    await failed;
    expect(repository.state()).toEqual(before);
  });
  it('refreshes released slots and reassignment flags after a successful API cancellation', async () => {
    const cancel = repository.cancelAssignment('assignment-test');
    data.ShiftAssignment[0].status = 'CANCELLED';
    data.Shift[0].assignedCount = 0;
    data.Task[0].status = 'WAITING_ADMIN';
    http
      .expectOne('/data/admin/shift-assignments/assignment-test')
      .flush({ id: 'assignment-test' });
    await settle();
    await flushShifts();
    await cancel;
    await settle();
    expect(repository.activeAssignments()).toHaveLength(0);
    expect(repository.state().tasks[0].needsReassignment).toBe(true);
  });
  it('deactivates through P6 and refreshes P4 history', async () => {
    const deactivate = repository.deactivateRecord(employee.id);
    http
      .expectOne('/data/admin/employees/' + employee.id + '/deactivate')
      .flush({ ...employee, status: 'INACTIVE' });
    await settle();
    await flushShifts();
    await deactivate;
    expect(repository.employee(employee.id)?.status).toBe('INACTIVE');
    expect(repository.state().attendance).toHaveLength(1);
  });
  it('clears state on disconnect instead of loading a browser snapshot', async () => {
    const refresh = repository.refreshEmployees();
    const failed = expect(refresh).rejects.toThrow('Không kết nối được máy chủ');
    http.expectOne('/data/admin/employees').error(new ProgressEvent('error'));
    http.expectOne('/data/admin/work-locations').flush([]);
    await failed;
    expect(repository.employees()).toEqual([]);
    auth.serverAuthenticated.set(false);
    TestBed.tick();
    expect(repository.state().assignments).toEqual([]);
    expect(repository.temporaryPassword()).toBeNull();
  });
  it('reading an empty future week does not create records or send writes', () => {
    expect(repository.week('2099-01-05')).toEqual([]);
    expect(repository.state().shifts).toHaveLength(1);
    http.expectNone((request) => request.method !== 'GET');
  });
});
