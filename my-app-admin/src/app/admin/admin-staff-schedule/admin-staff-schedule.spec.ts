import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { AdminStaffScheduleComponent } from './admin-staff-schedule';
import { StaffService } from '../../services/staff-service';
import { ApiPeriod, ApiShiftState, ApiTask } from '../../classes/ShiftApi';
import {
  setupAdminHttp,
  settleAdminHttp,
  EMPTY_SHIFT_STATE,
  TEST_EMPLOYEE,
} from '../room-form/room-http-testing';

const makePeriod = (): ApiPeriod => ({
  id: 'period',
  name: 'Đợt đăng ký',
  weekStart: '2099-01-05',
  weekEnd: '2099-01-11',
  opensAt: '2099-01-01T08:00:00+07:00',
  closesAt: '2099-01-04T20:00:00+07:00',
  status: 'DRAFT',
  minShifts: 5,
  maxShifts: 8,
  shiftCount: 14,
  assignmentCount: 4,
  taskCount: 1,
  canDelete: false,
});
const makeTask = (patch: Partial<ApiTask> = {}): ApiTask => ({
  id: 'task',
  title: 'Kiểm tra phòng',
  kind: 'GENERAL',
  description: 'Kiểm tra thiết bị',
  currentShiftId: 'morning',
  status: 'TODO',
  shiftLinks: [{ id: 'link', shiftId: 'morning' }],
  assignees: [
    { id: 'part', assignmentId: 'a1', employeeId: TEST_EMPLOYEE.id, personalStatus: 'TODO' },
  ],
  currentAssignees: [
    { id: 'part', assignmentId: 'a1', employeeId: TEST_EMPLOYEE.id, personalStatus: 'TODO' },
  ],
  ...patch,
});
const makeState = (): ApiShiftState => ({
  ...EMPTY_SHIFT_STATE,
  Employee: [
    { ...TEST_EMPLOYEE, status: 'ACTIVE' },
    { ...TEST_EMPLOYEE, id: 'employee-2', fullName: 'Nhân viên thứ hai', status: 'ACTIVE' },
  ],
  Shift: ['morning', 'afternoon'].map((id, index) => ({
    id,
    periodId: 'period',
    workLocationId: '',
    date: '2099-01-05',
    label: index ? 'Ca chiều' : 'Ca sáng',
    startTime: index ? '13:00' : '07:00',
    endTime: index ? '17:00' : '11:00',
    startsAt: index ? '2099-01-05T13:00:00+07:00' : '2099-01-05T07:00:00+07:00',
    endsAt: index ? '2099-01-05T17:00:00+07:00' : '2099-01-05T11:00:00+07:00',
    capacity: 6,
    assignedCount: 2,
    status: 'OPEN',
  })),
  ShiftAssignment: [
    {
      id: 'a1',
      employeeId: TEST_EMPLOYEE.id,
      shiftId: 'morning',
      status: 'REGISTERED',
      registrationId: 'r1',
    },
    {
      id: 'a2',
      employeeId: 'employee-2',
      shiftId: 'morning',
      status: 'IN_PROGRESS',
      registrationId: 'r2',
    },
    {
      id: 'target-first',
      employeeId: TEST_EMPLOYEE.id,
      shiftId: 'afternoon',
      status: 'REGISTERED',
      registrationId: 'r1',
    },
    {
      id: 'target-chosen',
      employeeId: 'employee-2',
      shiftId: 'afternoon',
      status: 'REGISTERED',
      registrationId: 'r2',
    },
  ],
  Task: [makeTask()],
});
const makePendingTask = (patch: Partial<ApiTask> = {}) =>
  makeTask({
    status: 'PENDING_CONFIRM',
    pendingConfirm: {
      at: '2026-11-16T11:05:00+07:00',
      shift: {
        id: 'completed-shift',
        date: '2026-11-16',
        label: 'Ca sáng',
        startsAt: '2026-11-16T07:00:00+07:00',
      },
      employees: [
        {
          employeeId: TEST_EMPLOYEE.id,
          fullName: TEST_EMPLOYEE.fullName,
          employeeCode: TEST_EMPLOYEE.employeeCode,
          checkOutAt: '2026-11-16T11:05:00+07:00',
        },
      ],
    },
    ...patch,
  });
const makeViewing = (patch: Partial<ApiTask> = {}) =>
  makeTask({
    id: 'viewing-task',
    kind: 'VIEWING',
    title: 'Dẫn khách xem phòng',
    scheduledAt: '2099-01-05T08:00:00+07:00',
    scheduledEndAt: '2099-01-05T08:30:00+07:00',
    viewing: {
      id: 'viewing',
      status: 'DA_XAC_NHAN',
      date: '2099-01-05',
      startTime: '08:00',
      endTime: '08:30',
      viewerName: 'Khách kiểm thử',
      peopleCount: 2,
      rooms: [{ roomId: 'room', code: 'P101', name: 'Phòng 101' }],
    },
    ...patch,
  });

describe('SHIFT-06 schedule matrix, task wizard and registration periods', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<AdminStaffScheduleComponent>;
  let page: AdminStaffScheduleComponent;
  let repository: StaffService;
  let data: ApiShiftState;
  let periods: ApiPeriod[];
  const root = () => fixture.nativeElement as HTMLElement;
  const input = (selector: string) => root().querySelector<HTMLInputElement>(selector)!;
  function clickButton(text: string, scope: ParentNode = root()) {
    const button = Array.from(scope.querySelectorAll<HTMLButtonElement>('button')).find(
      (element) => element.textContent?.trim() === text,
    );
    expect(button, `Button "${text}" must be rendered`).toBeTruthy();
    expect(button!.disabled).toBe(false);
    button!.click();
  }
  async function microtasks() {
    for (let i = 0; i < 12; i++) await Promise.resolve();
  }
  async function refresh() {
    const pending = repository.shiftApi.refresh();
    http.expectOne('/data/admin/registration-periods').flush(periods);
    http.expectOne('/data/admin/shift-state').flush(data);
    await pending;
    TestBed.tick();
    fixture.detectChanges();
  }
  async function finishWrite(pending: Promise<unknown>, reloadTasks = false) {
    await microtasks();
    http.expectOne('/data/admin/registration-periods').flush(periods);
    http.expectOne('/data/admin/shift-state').flush(data);
    await microtasks();
    if (reloadTasks) http.expectOne('/data/admin/tasks').flush(data.Task);
    await pending;
    TestBed.tick();
    fixture.detectChanges();
  }
  async function openTasks() {
    page.selectTab('cong-viec');
    const request = http.expectOne('/data/admin/tasks');
    expect(request.request.method).toBe('GET');
    request.flush(data.Task);
    await microtasks();
    fixture.detectChanges();
  }
  async function type(selector: string, value: string) {
    const element = input(selector);
    element.value = value;
    element.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }
  beforeEach(async () => {
    http = await setupAdminHttp();
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(AdminStaffScheduleComponent);
    page = fixture.componentInstance;
    await settleAdminHttp(fixture, http);
    repository = TestBed.inject(StaffService);
    data = makeState();
    periods = [makePeriod()];
    repository.state.update((state) => ({
      ...state,
      employees: [
        ...state.employees,
        {
          ...state.employees[0],
          id: 'employee-2',
          employeeCode: 'NV102',
          fullName: 'Nhân viên thứ hai',
          status: 'ACTIVE',
        },
        { ...state.employees[0], id: 'inactive', fullName: 'Nhân viên nghỉ', status: 'INACTIVE' },
      ],
    }));
    await refresh();
    page.currentWeek = periods[0].weekStart;
    fixture.detectChanges();
  });
  afterEach(() => {
    fixture.destroy();
    http.verify();
    vi.restoreAllMocks();
  });

  it('renders active employees and two keyboard buttons per day, without the removed detail areas', () => {
    expect(root().querySelectorAll('.staff-matrix tbody tr')).toHaveLength(2);
    expect(root().querySelectorAll('.staff-matrix tbody tr:first-child .matrix-half')).toHaveLength(
      14,
    );
    expect(root().querySelector('.week-count')?.textContent).toContain('2 ca / tuần');
    expect(
      root().querySelector(
        '.staff-shift-detail, .schedule-metrics, .waiting-tasks, .adjust-trigger',
      ),
    ).toBeNull();
    expect(root().querySelector('.staff-matrix')?.textContent).not.toContain('Nhân viên nghỉ');
  });
  it('clicks an empty half and sends one POST with employeeId and shiftId, with a busy state', async () => {
    data.ShiftAssignment = data.ShiftAssignment.filter((a) => a.id !== 'target-chosen');
    await refresh();
    const add = vi.spyOn(page, 'addMatrixAssignment');
    const button = root().querySelector<HTMLButtonElement>(
      '[data-employee-id="employee-2"] [data-date="2099-01-05"][data-half="Chiều"] .matrix-empty',
    )!;
    expect(button.disabled).toBe(false);
    button.click();
    const request = http.expectOne('/data/admin/shift-registrations');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ employeeId: 'employee-2', shiftId: 'afternoon' });
    fixture.detectChanges();
    expect(root().textContent).toContain('Đang thêm…');
    button.click();
    http.expectNone('/data/admin/shift-registrations');
    data.ShiftAssignment.push({
      id: 'new',
      shiftId: 'afternoon',
      employeeId: 'employee-2',
      registrationId: 'r2',
      status: 'REGISTERED',
    });
    request.flush(data.ShiftAssignment.at(-1)!);
    await finishWrite(add.mock.results[0].value);
    expect(page.cellBusy()).toBe('');
    expect(page.assignmentFor('employee-2', 'afternoon')?.id).toBe('new');
  });
  it('disables past, full and missing halves and hides deletion after a shift starts', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2099-01-05T12:00:00+07:00'));
    data.ShiftAssignment = data.ShiftAssignment.filter(
      (a) => a.id !== 'a2' && a.id !== 'target-chosen',
    );
    data.Shift[1].capacity = 1;
    await refresh();
    expect(
      root().querySelector(
        '[data-employee-id="employee-test"] [data-half="Sáng"] .remove-assignment',
      ),
    ).toBeNull();
    const row = root().querySelector('[data-employee-id="employee-2"]')!;
    expect(
      Array.from(row.querySelectorAll<HTMLButtonElement>('.matrix-empty')).every((b) => b.disabled),
    ).toBe(true);
    expect(page.emptyReason('employee-2', repository.state().shifts[0])).toContain('đã kết thúc');
    expect(page.emptyReason('employee-2', repository.state().shifts[1])).toContain('đủ người');
  });
  it('shows AUTO_RANDOM and task statuses in the assignment popover, then closes with Escape or outside click', async () => {
    data.ShiftAssignment[0].source = 'AUTO_RANDOM';
    data.Task[0].status = 'WAITING_ADMIN';
    await refresh();
    const card = root().querySelector<HTMLButtonElement>(
      '[data-employee-id="employee-test"] .matrix-assignment',
    )!;
    expect(card.textContent).toContain('Tự xếp');
    card.click();
    await fixture.whenStable();
    const popover = root().querySelector('.assignment-popover')!;
    expect(popover.textContent).toContain('NV101');
    expect(popover.textContent).toContain('Kiểm tra phòng');
    expect(popover.textContent).toContain('Chờ giao lại');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();
    expect(root().querySelector('.assignment-popover')).toBeNull();
    card.click();
    await fixture.whenStable();
    document.body.click();
    await fixture.whenStable();
    expect(page.popover()).toBeNull();
  });
  it('shows the empty task text for a shift with no work', async () => {
    root()
      .querySelector<HTMLButtonElement>(
        '[data-employee-id="employee-test"] [data-half="Chiều"] .matrix-assignment',
      )!
      .click();
    await fixture.whenStable();
    expect(root().querySelector('.assignment-popover')?.textContent).toContain('Chưa có công việc');
  });
  it('allows filling a vacant ongoing shift but never offers removing a started assignment', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2099-01-05T08:00:00+07:00'));
    data.ShiftAssignment = data.ShiftAssignment.filter((a) => a.id !== 'a2');
    await refresh();
    const vacancy = root().querySelector<HTMLButtonElement>(
      '[data-employee-id="employee-2"] [data-date="2099-01-05"][data-half="Sáng"] .matrix-empty',
    )!;
    expect(vacancy.disabled).toBe(false);
    expect(
      root().querySelector(
        '[data-employee-id="employee-test"] [data-half="Sáng"] .remove-assignment',
      ),
    ).toBeNull();
  });
  it('requires employee, shift and task count confirmation before DELETE assignment', async () => {
    const remove = root().querySelector<HTMLButtonElement>(
      '[data-employee-id="employee-test"] [data-half="Sáng"] .remove-assignment',
    )!;
    expect(remove.getAttribute('aria-label')).toContain('Xóa ca sáng');
    remove.click();
    await fixture.whenStable();
    const dialog = root().querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Nhân viên kiểm thử');
    expect(dialog.textContent).toContain('Ca sáng');
    expect(dialog.textContent).toContain('1 công việc sẽ chuyển về Chờ giao lại');
    http.expectNone('/data/admin/shift-assignments/a1');
    const save = vi.spyOn(page, 'deleteAssignment');
    clickButton('Xóa', dialog);
    const request = http.expectOne('/data/admin/shift-assignments/a1');
    expect(request.request.method).toBe('DELETE');
    request.flush({ id: 'a1', deleted: true });
    data.ShiftAssignment = data.ShiftAssignment.filter((a) => a.id !== 'a1');
    await finishWrite(save.mock.results[0].value);
    expect(page.confirmAssignment()).toBeNull();
  });
  it('keeps failed matrix writes local-error-only and maps a server code to Vietnamese', async () => {
    data.ShiftAssignment = [];
    await refresh();
    const save = page.addMatrixAssignment('employee-test', repository.state().shifts[0]);
    http
      .expectOne('/data/admin/shift-registrations')
      .flush({ code: 'SHIFT_FULL' }, { status: 409, statusText: 'Conflict' });
    await save;
    await fixture.whenStable();
    expect(page.error).toContain('Ca vừa đủ 6 người');
    expect(page.error).not.toContain('SHIFT_FULL');
    expect(page.assignmentFor('employee-test', 'morning')).toBeUndefined();
    expect(page.cellBusy()).toBe('');
  });
  it('saves at step 1 without shiftId or recipients', async () => {
    await openTasks();
    clickButton('Thêm công việc');
    await fixture.whenStable();
    await type('[name="taskTitle"]', '  Kiểm kê mới  ');
    await type('[name="taskDescription"]', '  Kiểm tra thiết bị  ');
    const save = vi.spyOn(page, 'saveTask');
    clickButton('Lưu chưa giao');
    const request = http.expectOne('/data/admin/tasks');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      title: 'Kiểm kê mới',
      description: 'Kiểm tra thiết bị',
    });
    expect(request.request.body).not.toHaveProperty('shiftId');
    expect(request.request.body).not.toHaveProperty('assigneeAssignmentIds');
    request.flush(
      makeTask({ status: 'UNASSIGNED', currentShiftId: null, currentAssignees: [], assignees: [] }),
    );
    await finishWrite(save.mock.results[0].value, true);
    expect(page.editorOpen()).toBe(false);
  });
  it('completes the three wizard steps and POSTs checked assignment IDs', async () => {
    await openTasks();
    clickButton('Thêm công việc');
    await fixture.whenStable();
    await type('[name="taskTitle"]', 'Công việc mới');
    clickButton('Tiếp tục');
    await fixture.whenStable();
    input('input[type="radio"][value="afternoon"]').click();
    await fixture.whenStable();
    clickButton('Tiếp tục');
    await fixture.whenStable();
    input('.assignee-options input[type="checkbox"]').click();
    await fixture.whenStable();
    const save = vi.spyOn(page, 'saveTask');
    clickButton('Giao việc');
    const request = http.expectOne('/data/admin/tasks');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      title: 'Công việc mới',
      description: '',
      shiftId: 'afternoon',
      assigneeAssignmentIds: ['target-first'],
    });
    request.flush(makeTask());
    await finishWrite(save.mock.results[0].value, true);
  });
  it('validates the wizard and disables shifts without eligible staff', async () => {
    data.ShiftAssignment = data.ShiftAssignment.filter((a) => a.shiftId !== 'afternoon');
    await refresh();
    await openTasks();
    page.openTaskForm();
    await page.saveTask(true);
    expect(page.taskTitleError()).toContain('nhập tên');
    page.taskTitle.set('Công việc');
    page.taskDescription.set('x'.repeat(2001));
    await page.saveTask(true);
    expect(page.taskDescriptionError()).toContain('2000');
    page.taskDescription.set('');
    page.nextTaskStep();
    await fixture.whenStable();
    expect(input('input[value="afternoon"]').disabled).toBe(true);
    expect(root().querySelector('.shift-options')?.textContent).toContain(
      'Ca chưa có nhân viên trực',
    );
    page.changeTaskShift('morning');
    page.nextTaskStep();
    await page.saveTask();
    expect(page.taskFormError()).toContain('Chọn ít nhất một');
    http.expectNone((request) => request.method !== 'GET');
  });
  it.each(['UNASSIGNED', 'WAITING_ADMIN'] as const)(
    'assigns %s tasks via PUT shiftId and assigneeAssignmentIds',
    async (status) => {
      const task = makeTask({
        status,
        currentShiftId: status === 'UNASSIGNED' ? null : 'morning',
        currentAssignees: [],
        assignees: [],
      });
      page.editTask(task, true);
      page.changeTaskShift('afternoon');
      page.nextTaskStep();
      page.setTaskAssignee('target-chosen', true);
      const save = page.saveTask();
      const request = http.expectOne('/data/admin/tasks/task');
      expect(request.request.method).toBe('PUT');
      expect(request.request.body).toMatchObject({
        shiftId: 'afternoon',
        assigneeAssignmentIds: ['target-chosen'],
      });
      request.flush(makeTask());
      await finishWrite(save, true);
    },
  );
  it('clears old recipients when editing to another shift and PUTs only the reselected staff', async () => {
    page.editTask(makeTask());
    expect(page.taskAssigneeIds()).toEqual(['a1']);
    page.changeTaskShift('afternoon');
    expect(page.taskAssigneeIds()).toEqual([]);
    await page.saveTask();
    expect(page.taskFormError()).toContain('Chọn ít nhất một');
    http.expectNone('/data/admin/tasks/task');
    page.setTaskAssignee('target-chosen', true);
    const save = page.saveTask();
    const request = http.expectOne('/data/admin/tasks/task');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      title: 'Kiểm tra phòng',
      description: 'Kiểm tra thiết bị',
      shiftId: 'afternoon',
      assigneeAssignmentIds: ['target-chosen'],
    });
    request.flush(makeTask());
    await finishWrite(save, true);
  });
  it('keeps VIEWING name and containing shift locked and enforces one assignee', async () => {
    page.editTask(makeViewing());
    await fixture.whenStable();
    expect(input('[name="taskTitle"]').disabled).toBe(true);
    page.nextTaskStep();
    expect(page.taskShifts.map((s) => s.id)).toEqual(['morning']);
    page.changeTaskShift('afternoon');
    page.taskAssigneeIds.set(['target-chosen']);
    await page.saveTask();
    http.expectNone('/data/admin/tasks/viewing-task');
    page.changeTaskShift('morning');
    page.taskAssigneeIds.set(['a1', 'a2']);
    await page.saveTask();
    expect(page.taskFormError()).toContain('đúng một người');
    page.setTaskAssignee('a2', true);
    const save = page.saveTask();
    const request = http.expectOne('/data/admin/tasks/viewing-task');
    expect(request.request.body).toEqual({
      description: 'Kiểm tra thiết bị',
      shiftId: 'morning',
      assigneeAssignmentIds: ['a2'],
    });
    request.flush(makeViewing());
    await finishWrite(save, true);
  });
  it('locates the fixed viewing week when a waiting VIEWING has no current shift', () => {
    page.currentWeek = '2099-01-19';
    page.editTask(
      makeViewing({
        status: 'WAITING_ADMIN',
        currentShiftId: null,
        currentAssignees: [],
        assignees: [],
      }),
      true,
    );
    expect(page.taskWeek()).toBe('2099-01-05');
    expect(page.taskShiftId()).toBe('morning');
    expect(page.taskShifts.map((s) => s.id)).toEqual(['morning']);
  });
  it('locks completed recipients and refuses to remove them before a request', async () => {
    const task = makeTask();
    task.currentAssignees[0].personalStatus = 'DONE';
    page.editTask(task);
    expect(page.assigneeDone('a1')).toBe(true);
    page.setTaskAssignee('a1', false);
    expect(page.taskAssigneeIds()).toEqual(['a1']);
    page.taskAssigneeIds.set(['a2']);
    await page.saveTask();
    expect(page.taskFormError()).toContain('Không thể bỏ nhân viên');
    http.expectNone('/data/admin/tasks/task');
  });
  it('edits a past VIEWING description without changing its fixed shift or assignees', async () => {
    const viewing = makeViewing({
      status: 'WAITING_ADMIN',
      scheduledAt: '2000-01-01T08:00:00+07:00',
      scheduledEndAt: '2000-01-01T08:30:00+07:00',
    });
    page.editTask(viewing);
    page.taskDescription.set('Mô tả đã sửa');
    const save = page.saveTask(false, true);
    const request = http.expectOne('/data/admin/tasks/viewing-task');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ description: 'Mô tả đã sửa' });
    request.flush(viewing);
    await finishWrite(save, true);
  });
  it('confirms permanent task deletion and sends DELETE only after confirmation', async () => {
    await openTasks();
    root().querySelector<HTMLButtonElement>('[data-action="delete-task"]')!.click();
    await fixture.whenStable();
    const dialog = root().querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Xóa hẳn công việc Kiểm tra phòng? Không thể hoàn tác.');
    http.expectNone('/data/admin/tasks/task');
    const save = vi.spyOn(page, 'deleteTask');
    clickButton('Xóa', dialog);
    const request = http.expectOne('/data/admin/tasks/task');
    expect(request.request.method).toBe('DELETE');
    request.flush({ id: 'task', deleted: true });
    data.Task = [];
    await finishWrite(save.mock.results[0].value, true);
    expect(page.confirmTask()).toBeNull();
    expect(root().querySelector('[data-task-id="task"]')).toBeNull();
  });
  it('does not delete VIEWING, DONE or GENERAL with any completed history', async () => {
    const progressed = makeTask({ id: 'progressed' });
    progressed.assignees.push({
      ...progressed.assignees[0],
      id: 'old',
      removed: true,
      personalStatus: 'DONE',
    });
    data.Task = [makeViewing(), makeTask({ id: 'done', status: 'DONE' }), progressed];
    await openTasks();
    for (const task of data.Task) {
      page.requestDeleteTask(task);
      expect(page.confirmTask()).toBeNull();
    }
    expect(root().querySelector('[data-task-id="done"]')?.querySelectorAll('button')).toHaveLength(
      1,
    );
    expect(
      root().querySelector<HTMLButtonElement>(
        '[data-task-id="progressed"] [data-action="delete-task"]',
      )?.disabled,
    ).toBe(true);
    expect(root().querySelector('[data-task-id="progressed"]')?.textContent).toContain(
      'đã có phần hoàn thành',
    );
  });
  it('shows the pending count on the tab before opening, independently of task filters', async () => {
    data.Task = [makePendingTask(), makePendingTask({ id: 'pending-2' }), makeTask({ id: 'todo' })];
    await refresh();
    const tab = () => root().querySelector<HTMLButtonElement>('[aria-current="page"]');
    expect(
      Array.from(root().querySelectorAll('button')).some(
        (button) => button.textContent?.trim() === 'Công việc (2)',
      ),
    ).toBe(true);
    await openTasks();
    expect(tab()?.textContent?.trim()).toBe('Công việc (2)');
    expect(root().querySelector('#pending-confirm-title')?.textContent).toBe(
      'Chờ xác nhận hoàn thành (2)',
    );
    expect(root().querySelectorAll('[data-pending-task-id]')).toHaveLength(2);
    const row = root().querySelector('[data-pending-task-id="task"]')!;
    expect(row.textContent).toContain('Kiểm tra phòng');
    expect(row.textContent).toContain('Kiểm tra thiết bị');
    expect(row.textContent).toContain('Ca sáng T2 16/11');
    expect(row.textContent).toContain(`${TEST_EMPLOYEE.fullName} · ${TEST_EMPLOYEE.employeeCode}`);
    expect(row.textContent).toContain('11:05 16/11');
    page.setTaskFilter('PENDING_CONFIRM');
    expect(page.filteredTasks).toHaveLength(2);
    page.setTaskQuery('không khớp');
    await fixture.whenStable();
    expect(page.filteredTasks).toHaveLength(0);
    expect(root().querySelectorAll('[data-pending-task-id]')).toHaveLength(2);
    expect(tab()?.textContent?.trim()).toBe('Công việc (2)');
  });
  it('hides the pending block and tab count when no task is pending', async () => {
    await openTasks();
    expect(root().querySelector('.pending-confirm')).toBeNull();
    expect(root().querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('Công việc');
  });
  it('confirms once through POST and reloads the list and badge', async () => {
    data.Task = [makePendingTask()];
    await openTasks();
    const confirm = vi.spyOn(page, 'confirmPendingTask');
    clickButton('Xác nhận hoàn thành');
    const request = http.expectOne('/data/admin/tasks/task/confirm');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    expect(request.request.headers.has('Idempotency-Key')).toBe(true);
    await page.confirmPendingTask(data.Task[0]);
    http.expectNone('/data/admin/tasks/task/confirm');
    data.Task = [makeTask({ status: 'DONE', pendingConfirm: null })];
    request.flush(data.Task[0]);
    await finishWrite(confirm.mock.results[0].value, true);
    expect(page.toast).toBe('Đã xác nhận hoàn thành công việc.');
    expect(page.pendingConfirmCount()).toBe(0);
    expect(root().querySelector('.pending-confirm')).toBeNull();
    expect(root().querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('Công việc');
  });
  it('shows confirmation errors without changing pending status', async () => {
    data.Task = [makePendingTask()];
    await openTasks();
    const pending = page.confirmPendingTask(data.Task[0]);
    http
      .expectOne('/data/admin/tasks/task/confirm')
      .flush({ code: 'TASK_NOT_PENDING_CONFIRM' }, { status: 409, statusText: 'Conflict' });
    await pending;
    await fixture.whenStable();
    expect(root().querySelector('.pending-confirm [role="alert"]')?.textContent).toContain(
      'Công việc không ở trạng thái chờ xác nhận.',
    );
    expect(page.pendingConfirmCount()).toBe(1);
    expect(page.busy).toBe(false);
  });
  it.each(['', 'ab', '   ', 'a'.repeat(501)])(
    'rejects an invalid reason locally (%s)',
    async (reason) => {
      data.Task = [makePendingTask()];
      await openTasks();
      clickButton('Chưa hoàn thành');
      await fixture.whenStable();
      expect(page.rejectShiftId()).toBe('');
      expect(page.rejectAssigneeIds()).toEqual([]);
      await type('[name="rejectReason"]', reason);
      await page.submitTaskRejection(false);
      await page.submitTaskRejection(true);
      await fixture.whenStable();
      expect(page.rejectReasonError()).toContain('3 đến 500');
      const buttons = Array.from(
        root().querySelectorAll<HTMLButtonElement>('.task-rejection .wizard-actions button'),
      );
      expect(
        buttons
          .filter((button) => button.textContent?.includes('Trả lại'))
          .every((button) => button.disabled),
      ).toBe(true);
      http.expectNone('/data/admin/tasks/task/reject');
    },
  );
  it('returns for later with only the trimmed reason even when recipients were selected', async () => {
    data.Task = [makePendingTask()];
    await openTasks();
    clickButton('Chưa hoàn thành');
    await fixture.whenStable();
    await type('[name="rejectReason"]', '  Chưa đạt yêu cầu  ');
    const assign = () =>
      Array.from(root().querySelectorAll<HTMLButtonElement>('.task-rejection button')).find(
        (button) => button.textContent?.trim() === 'Trả lại & giao lại',
      )!;
    expect(assign().disabled).toBe(true);
    page.changeRejectShift('afternoon');
    page.setRejectAssignee('target-chosen', true);
    await fixture.whenStable();
    expect(assign().disabled).toBe(false);
    const submit = vi.spyOn(page, 'submitTaskRejection');
    clickButton('Trả lại, giao sau');
    const request = http.expectOne('/data/admin/tasks/task/reject');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ reason: 'Chưa đạt yêu cầu' });
    data.Task = [makeTask({ status: 'WAITING_ADMIN', pendingConfirm: null })];
    request.flush(data.Task[0]);
    await finishWrite(submit.mock.results[0].value, true);
    expect(page.rejectingTask()).toBeNull();
    expect(page.toast).toBe('Đã trả lại công việc.');
    expect(page.pendingConfirmCount()).toBe(0);
    expect(root().querySelector('[data-task-id="task"]')?.textContent).toContain('Chờ giao lại');
  });
  it('reassigns through the dialog checkboxes with the exact shift and recipients', async () => {
    data.Task = [makePendingTask()];
    await openTasks();
    clickButton('Chưa hoàn thành');
    await fixture.whenStable();
    await type('[name="rejectReason"]', 'Kiểm tra lại thiết bị');
    const select = root().querySelector<HTMLSelectElement>('[name="rejectShift"]')!;
    expect(select.value).toBe('');
    select.value = 'afternoon';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    const checkbox = root().querySelectorAll<HTMLInputElement>(
      '.task-rejection input[type="checkbox"]',
    )[1];
    checkbox.click();
    await fixture.whenStable();
    expect(page.rejectAssigneeIds()).toEqual(['target-chosen']);
    const submit = vi.spyOn(page, 'submitTaskRejection');
    clickButton('Trả lại & giao lại');
    const request = http.expectOne('/data/admin/tasks/task/reject');
    expect(request.request.body).toEqual({
      reason: 'Kiểm tra lại thiết bị',
      shiftId: 'afternoon',
      assigneeAssignmentIds: ['target-chosen'],
    });
    expect(request.request.headers.has('Idempotency-Key')).toBe(true);
    expect(page.busy).toBe(true);
    page.closeTaskRejection();
    expect(page.rejectingTask()).not.toBeNull();
    data.Task = [makeTask({ pendingConfirm: null })];
    request.flush(data.Task[0]);
    await finishWrite(submit.mock.results[0].value, true);
    expect(page.toast).toBe('Đã trả lại công việc và giao cho Nhân viên thứ hai.');
    expect(root().querySelector('.task-rejection')).toBeNull();
  });
  it('requires a new viewing time and exactly one employee when rejecting a viewing task', async () => {
    data.Task = [{ ...makePendingTask(), kind: 'VIEWING' }];
    await openTasks();
    page.openTaskRejection(data.Task[0]);
    page.rejectReason.set('Cần dẫn khách xem lại');
    page.changeRejectShift('afternoon');
    page.setRejectAssignee('target-chosen', true);
    expect(page.canRejectAndAssign).toBe(false);
    page.rejectViewingTime.set('13:30');
    expect(page.canRejectAndAssign).toBe(true);
    await page.submitTaskRejection(false);
    http.expectNone('/data/admin/tasks/task/reject');
    const submit = page.submitTaskRejection(true);
    const request = http.expectOne('/data/admin/tasks/task/reject');
    expect(request.request.body).toEqual({
      reason: 'Cần dẫn khách xem lại',
      shiftId: 'afternoon',
      assigneeAssignmentIds: ['target-chosen'],
      viewingStartTime: '13:30',
    });
    data.Task = [makeTask({ pendingConfirm: null })];
    request.flush(data.Task[0]);
    await finishWrite(submit, true);
  });
  it('offers only future staffed active shifts and resets recipients when changing shifts', async () => {
    data.Shift.push(
      { ...data.Shift[0], id: 'empty' },
      { ...data.Shift[0], id: 'cancelled', status: 'CANCELLED' },
    );
    data.ShiftAssignment.push({
      ...data.ShiftAssignment[0],
      id: 'cancelled-person',
      shiftId: 'cancelled',
    });
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(data.Shift[0].startsAt));
    await refresh();
    page.openTaskRejection(makePendingTask());
    page.rejectReason.set('Cần làm lại');
    expect(page.rejectShifts.map((shift) => shift.id)).toEqual(['afternoon']);
    page.changeRejectShift('afternoon');
    page.setRejectAssignee('target-chosen', true);
    expect(page.canRejectAndAssign).toBe(true);
    page.changeRejectShift('');
    expect(page.rejectAssigneeIds()).toEqual([]);
    page.changeRejectShift('afternoon');
    page.setRejectAssignee('a1', true);
    expect(page.rejectAssigneeIds()).toEqual([]);
    page.setRejectAssignee('target-chosen', true);
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(data.Shift[1].startsAt));
    await page.submitTaskRejection(true);
    expect(page.rejectError()).toContain('Chọn ca chưa bắt đầu');
    http.expectNone('/data/admin/tasks/task/reject');
  });
  it('keeps API errors and form values in the rejection dialog and supports cancel and Escape', async () => {
    data.Task = [makePendingTask()];
    await openTasks();
    page.openTaskRejection(data.Task[0]);
    page.rejectReason.set('Cần làm lại');
    page.changeRejectShift('afternoon');
    page.setRejectAssignee('target-chosen', true);
    const pending = page.submitTaskRejection(true);
    http
      .expectOne('/data/admin/tasks/task/reject')
      .flush({ code: 'SHIFT_STARTED' }, { status: 409, statusText: 'Conflict' });
    await pending;
    await fixture.whenStable();
    expect(root().querySelector('.task-rejection [role="alert"]')?.textContent).toBe(
      'Ca đã bắt đầu, hãy chọn ca khác.',
    );
    expect(page.rejectReason()).toBe('Cần làm lại');
    expect(page.rejectAssigneeIds()).toEqual(['target-chosen']);
    clickButton('Hủy', root().querySelector('.task-rejection')!);
    await fixture.whenStable();
    expect(root().querySelector('.task-rejection')).toBeNull();
    page.openTaskRejection(data.Task[0]);
    expect(page.rejectReason()).toBe('');
    page.escape();
    expect(page.rejectingTask()).toBeNull();
  });
  it('labels pending tasks and blocks all edit and delete entry points', async () => {
    data.Task = [makePendingTask()];
    await openTasks();
    const row = root().querySelector('[data-task-id="task"]')!;
    expect(row.querySelector('.task-status')?.textContent).toBe('Chờ xác nhận');
    expect(
      Array.from(row.querySelectorAll('button')).map((button) => button.textContent?.trim()),
    ).toEqual(['Xem']);
    page.editTask(data.Task[0]);
    page.requestDeleteTask(data.Task[0]);
    expect(page.editorOpen()).toBe(false);
    expect(page.confirmTask()).toBeNull();
    expect(page.taskDeleteReason(data.Task[0])).toBe('Đang chờ xác nhận hoàn thành');
    http.expectNone('/data/admin/tasks/task');
  });
  it('filters status and name, combines TODO/IN_PROGRESS, includes old DONE and paginates 20 rows', async () => {
    data.Task = Array.from({ length: 23 }, (_, i) =>
      makeTask({
        id: 't' + i,
        title: 'Công việc ' + i,
        status:
          i === 0
            ? 'DONE'
            : i === 1
              ? 'WAITING_ADMIN'
              : i === 2
                ? 'UNASSIGNED'
                : i === 3
                  ? 'IN_PROGRESS'
                  : 'TODO',
        updatedAt: '2000-01-01T00:00:00Z',
      }),
    );
    await openTasks();
    expect(root().querySelectorAll('.task-table tbody tr')).toHaveLength(20);
    expect(root().querySelector('[data-task-id="t0"]')).not.toBeNull();
    clickButton('Trang sau');
    await fixture.whenStable();
    expect(root().querySelectorAll('.task-table tbody tr')).toHaveLength(3);
    const select = root().querySelector<HTMLSelectElement>('[name="taskStatusFilter"]')!;
    select.value = 'ASSIGNED';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(page.filteredTasks).toHaveLength(20);
    expect(page.taskPage()).toBe(1);
    select.value = 'WAITING_ADMIN';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(root().querySelectorAll('[data-task-id]')).toHaveLength(1);
    expect(root().querySelector('[data-task-id="t1"]')).not.toBeNull();
    page.setTaskFilter('UNASSIGNED');
    expect(page.filteredTasks.map((t) => t.id)).toEqual(['t2']);
    page.setTaskFilter('DONE');
    expect(page.filteredTasks.map((t) => t.id)).toEqual(['t0']);
    page.setTaskFilter('');
    await fixture.whenStable();
    await type('[name="taskQuery"]', 'Công việc 22');
    expect(page.filteredTasks.map((t) => t.id)).toEqual(['t22']);
  });
  it('persists the tab query parameter while merging other parameters and restores it on creation', async () => {
    page.selectTab('dot-dang-ky');
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith([], {
      relativeTo: TestBed.inject(ActivatedRoute),
      queryParams: { tab: 'dot-dang-ky' },
      queryParamsHandling: 'merge',
    });
    fixture.destroy();
    const route = TestBed.inject(ActivatedRoute) as unknown as { queryParamMap: unknown };
    route.queryParamMap = of(convertToParamMap({ tab: 'cong-viec' }));
    fixture = TestBed.createComponent(AdminStaffScheduleComponent);
    page = fixture.componentInstance;
    http.expectOne('/data/admin/tasks').flush(data.Task);
    await microtasks();
    await fixture.whenStable();
    expect(page.tab()).toBe('cong-viec');
    expect(root().querySelector('.task-manager')).not.toBeNull();
  });
  it('shows a failed management read and retries without exposing raw error codes', async () => {
    page.selectTab('cong-viec');
    http
      .expectOne('/data/admin/tasks')
      .flush({ code: 'UNKNOWN', message: 'RAW' }, { status: 400, statusText: 'Rejected' });
    await microtasks();
    await fixture.whenStable();
    expect(page.tasksError()).toContain('Vui lòng tải lại');
    expect(root().querySelector('[role="alert"]')?.textContent).not.toContain('RAW');
    clickButton('Thử lại');
    http.expectOne('/data/admin/tasks').flush(data.Task);
    await microtasks();
    await fixture.whenStable();
    expect(root().querySelector('[data-task-id="task"]')).not.toBeNull();
    expect(page.tasksError()).toBe('');
  });
  it('opens the period tab and creates the exact empty matrix week', async () => {
    page.currentWeek = '2099-01-12';
    await fixture.whenStable();
    clickButton('Tạo đợt cho tuần này');
    await fixture.whenStable();
    expect(page.tab()).toBe('dot-dang-ky');
    expect(page.periodForm.weekStart).toBe('2099-01-12');
    expect(root().textContent).toContain('nhân viên chưa đủ 5 ca');
    const save = page.createPeriod();
    const request = http.expectOne('/data/admin/registration-periods');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      name: 'Đợt đăng ký tuần 12/01–18/01/2099',
      weekStart: '2099-01-12',
    });
    request.flush(makePeriod());
    await finishWrite(save);
  });
  it('offers "Xếp bù ca thiếu" only for closed/finalized periods and POSTs fill-minimum', async () => {
    const base = page.periods.find((p) => p.id === 'period')!;
    expect(page.canFillMinimum(base)).toBe(false);
    expect(page.canFillMinimum({ ...base, status: 'OPEN' })).toBe(false);
    expect(page.canFillMinimum({ ...base, status: 'CLOSED' })).toBe(true);
    expect(page.canFillMinimum({ ...base, status: 'FINALIZED', weekEnd: '2000-01-09' })).toBe(
      false,
    );
    const save = page.fillMinimum({ ...base, status: 'FINALIZED' });
    const request = http.expectOne('/data/admin/registration-periods/period/fill-minimum');
    expect(request.request.method).toBe('POST');
    request.flush({ ...makePeriod(), status: 'FINALIZED' });
    await finishWrite(save);
    expect(page.toast).toContain('Đã xếp bù ca');
  });
  it('lists periods newest first with server counts and hides unavailable deletion', async () => {
    periods = [{ ...makePeriod(), id: 'older', weekStart: '2098-12-29' }, makePeriod()];
    await refresh();
    page.selectTab('dot-dang-ky');
    fixture.detectChanges();
    const rows = root().querySelectorAll('.period-table tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('05/01–11/01/2099');
    expect(rows[0].querySelectorAll('.number')[0].textContent).toContain('14');
    expect(rows[0].querySelectorAll('.number')[1].textContent).toContain('4');
    expect(rows[0].querySelector('[data-action="delete-period"]')).toBeNull();
    expect(root().querySelector('.period-delete-note')?.textContent).toContain(
      'Chỉ xóa được đợt chưa có nhân viên nhận ca và chưa có công việc.',
    );
    expect(rows[0].querySelector('.action-reason')).toBeNull();
    page.requestDeletePeriod(page.currentPeriod!);
    expect(page.confirmPeriod).toBeUndefined();
  });

  it('shows only the relevant period action and describes a disabled opening without row paragraphs', async () => {
    periods = ['DRAFT', 'OPEN', 'CLOSED', 'FINALIZED'].map((status) => ({
      ...makePeriod(),
      id: status,
      status: status as ApiPeriod['status'],
      canDelete: status === 'CLOSED',
    }));
    await refresh();
    clickButton('Đợt đăng ký');
    await fixture.whenStable();
    for (const [status, action] of [
      ['DRAFT', 'Mở'],
      ['OPEN', 'Đóng'],
      ['CLOSED', 'Chốt'],
      ['FINALIZED', ''],
    ]) {
      const row = root().querySelector(`[data-period-id="${status}"]`)!;
      const labels = Array.from(row.querySelectorAll('button')).map((button) =>
        button.textContent?.trim(),
      );
      expect(labels).toEqual([
        'Xem lịch',
        'Sửa tên',
        ...(status === 'CLOSED' ? ['Xóa'] : []),
        ...(action ? [action] : []),
        ...(['CLOSED', 'FINALIZED'].includes(status) ? ['Xếp bù ca thiếu'] : []),
      ]);
      expect(row.querySelector('.action-reason')).toBeNull();
    }
    const open = root().querySelector<HTMLButtonElement>(
      '[data-period-id="DRAFT"] .period-row-actions button:last-child',
    )!;
    expect(open.disabled).toBe(true);
    expect(open.title).toContain('trước 20:00 Chủ Nhật');
    const reason = document.getElementById(open.getAttribute('aria-describedby')!);
    expect(reason?.classList.contains('sr-only')).toBe(true);
    expect(reason?.textContent?.trim()).toBe(open.title);
    http.expectNone((request) => request.method !== 'GET');
  });

  it('hides only past finalized weeks and toggles them without removing current or future periods', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2099-01-12T00:00:00+07:00'));
    periods = [
      { ...makePeriod(), id: 'past-finalized', status: 'FINALIZED' },
      { ...makePeriod(), id: 'past-closed', status: 'CLOSED' },
      {
        ...makePeriod(),
        id: 'current-finalized',
        status: 'FINALIZED',
        weekStart: '2099-01-12',
        weekEnd: '2099-01-18',
      },
      {
        ...makePeriod(),
        id: 'future-finalized',
        status: 'FINALIZED',
        weekStart: '2099-01-19',
        weekEnd: '2099-01-25',
      },
    ];
    await refresh();
    clickButton('Đợt đăng ký');
    await fixture.whenStable();
    expect(root().querySelector('[data-period-id="past-finalized"]')).toBeNull();
    expect(root().querySelectorAll('.period-table tbody tr')).toHaveLength(3);
    clickButton('Hiện các đợt đã chốt (1)');
    await fixture.whenStable();
    expect(root().querySelector('[data-period-id="past-finalized"]')).not.toBeNull();
    expect(root().querySelectorAll('.period-table tbody tr')).toHaveLength(4);
    clickButton('Ẩn các đợt đã chốt');
    await fixture.whenStable();
    expect(root().querySelector('[data-period-id="past-finalized"]')).toBeNull();
    expect(root().querySelector('[data-period-id="past-closed"]')).not.toBeNull();
    expect(root().querySelector('[data-period-id="current-finalized"]')).not.toBeNull();
    expect(root().querySelector('[data-period-id="future-finalized"]')).not.toBeNull();
  });

  it('updates the default period name with the selected week until the user edits the name', async () => {
    page.selectTab('dot-dang-ky');
    page.resetPeriodForm('2099-01-12');
    await fixture.whenStable();
    const name = input('.staff-period-form input[name="name"]');
    const week = input('.staff-period-form input[name="weekStart"]');
    expect(name.value).toBe('Đợt đăng ký tuần 12/01–18/01/2099');
    week.value = '2099-01-19';
    week.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(name.value).toBe('Đợt đăng ký tuần 19/01–25/01/2099');
    name.value = 'Đợt theo tên riêng';
    name.dispatchEvent(new Event('input'));
    week.value = '2099-01-26';
    week.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(name.value).toBe('Đợt theo tên riêng');
    expect(page.periodForm.name).toBe('Đợt theo tên riêng');
    clickButton('Hủy', root().querySelector('.staff-period-form')!);
    await fixture.whenStable();
    page.resetPeriodForm('2099-12-28');
    await fixture.whenStable();
    expect(input('.staff-period-form input[name="name"]').value).toBe(
      'Đợt đăng ký tuần 28/12–03/01/2100',
    );
    http.expectNone('/data/admin/registration-periods');
  });

  it('renames a period with a trimmed PUT payload', async () => {
    const period = page.currentPeriod!;
    page.editPeriod(period);
    page.periodName = '  Tuần trực đã sửa  ';
    const save = page.savePeriodName(period);
    const request = http.expectOne('/data/admin/registration-periods/period');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ name: 'Tuần trực đã sửa' });
    request.flush({ ...period, name: 'Tuần trực đã sửa' });
    await finishWrite(save);
    expect(page.editingPeriodId).toBe('');
  });

  it('requires confirmation naming the period and 14 shifts before DELETE', async () => {
    periods[0].canDelete = true;
    await refresh();
    page.requestDeletePeriod(page.currentPeriod!);
    fixture.detectChanges();
    expect(root().querySelector('[role="dialog"]')?.textContent).toContain('Đợt đăng ký');
    expect(root().querySelector('[role="dialog"]')?.textContent).toContain('14 ca');
    http.expectNone('/data/admin/registration-periods/period');
    const save = page.deletePeriod();
    const request = http.expectOne('/data/admin/registration-periods/period');
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toEqual({});
    request.flush({ id: 'period', deleted: true });
    periods = [];
    data.Shift = [];
    await finishWrite(save);
    expect(page.confirmPeriod).toBeUndefined();
  });

  it('validates Monday and duplicate weeks locally without calling create API', async () => {
    page.periodForm.name = 'Đợt mới';
    page.periodForm.weekStart = '2099-01-06';
    await page.createPeriod();
    expect(page.periodWeekError).toBe('Ngày bắt đầu đợt phải là thứ Hai.');
    page.periodForm.weekStart = '2099-01-05';
    await page.createPeriod();
    expect(page.periodWeekError).toBe('Tuần này đã có đợt đăng ký.');
    http.expectNone('/data/admin/registration-periods');
  });

  it('explains state restrictions and enforces the exclusive Sunday closing boundary', () => {
    const period = page.currentPeriod!;
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(period.opensAt));
    expect(page.periodActionReason(period, 'open')).toBe('');
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(period.closesAt));
    expect(page.periodActionReason(period, 'open')).toContain('trước 20:00 Chủ Nhật');
    expect(page.periodActionReason(period, 'close')).toContain('đang mở');
    expect(page.periodActionReason(period, 'finalize')).toContain('Đóng đợt');
  });
});
