import { EmployeeShiftTasksComponent } from './employee-shift-tasks';
import { employeeHttpTest, flushEmployeeReads } from '../employee-http-testing';
import { ApiAssignment, ApiTask } from '../../classes/ShiftApi';

const assignment: ApiAssignment = {
  id: 'record-a',
  shiftId: 's',
  employeeId: 'employee-a',
  registrationId: 'r',
  status: 'REGISTERED',
  taskCount: 2,
  openTaskCount: 2,
};
function task(kind: 'GENERAL' | 'VIEWING', editable = false, current = true): ApiTask {
  const part = {
    id: 'part-' + kind,
    assignmentId: 'record-a',
    employeeId: 'employee-a',
    personalStatus: 'TODO' as const,
  };
  return {
    id: kind,
    title: kind === 'VIEWING' ? 'Dẫn khách xem phòng' : 'Kiểm tra phòng',
    kind,
    description: 'Nội dung cần thực hiện',
    status: 'TODO',
    currentShiftId: 's',
    assignees: [part],
    currentAssignees: current ? [part] : [],
    shiftLinks: [],
    mine: { taskAssignmentId: part.id, personalStatus: 'TODO', current },
    editable,
    ...(kind === 'VIEWING' && current
      ? {
          viewing: {
            id: 'viewing-a',
            status: 'CHO_XAC_NHAN' as const,
            date: '2026-11-15',
            startTime: '07:30',
            endTime: '08:00',
            viewerName: 'Khách A',
            viewerPhone: '0901234567',
            peopleCount: 2,
            note: 'Xem phòng buổi sáng',
            rooms: [
              {
                detailId: 'detail-a',
                roomId: 'room-a',
                code: 'P01',
                name: 'Phòng 01',
                address: 'Địa chỉ tòa nhà',
                viewStatus: 'CHUA_XEM' as const,
                note: 'Ghi chú phòng',
              },
            ],
          },
        }
      : {}),
  };
}

async function renderTasks(status: ApiAssignment['status'], tasks: ApiTask[]) {
  const context = await employeeHttpTest(EmployeeShiftTasksComponent);
  const refresh = context.fixture.componentInstance.shifts.api.refresh();
  await flushEmployeeReads(context.http, {
    '/data/me/shift-assignments': [{ ...assignment, status }],
    '/data/me/shift-assignments/record-a/tasks': tasks,
  });
  await refresh;
  context.fixture.detectChanges();
  return context;
}

describe('EmployeeShiftTasksComponent with HTTP data', () => {
  it.each([
    ['UNASSIGNED', 'Chưa giao'],
    ['TODO', 'Đã giao'],
    ['IN_PROGRESS', 'Đã giao'],
    ['PENDING_CONFIRM', 'Chờ xác nhận'],
    ['DONE', 'Hoàn thành'],
    ['WAITING_ADMIN', 'Chờ giao lại'],
  ] as const)('renders task status %s as %s', async (status, label) => {
    const general = { ...task('GENERAL'), status };
    const viewing = { ...task('VIEWING'), status };
    const { fixture, http } = await renderTasks('REGISTERED', [general, viewing]);
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('.task-row > .emp-badge')?.textContent?.trim()).toBe(label);
    expect(
      root.querySelector('.viewing-task .emp-card-head > .emp-badge')?.textContent?.trim(),
    ).toBe(label);
    http.verify();
    fixture.destroy();
  });
  it.each(['waitingAdmin', 'removed'] as const)(
    'renders %s work as returned to admin and keeps both task kinds read-only',
    async (marker) => {
      const tasks = (['GENERAL', 'VIEWING'] as const).map((kind) => {
        const item = task(kind, true);
        item.mine!.current = false;
        item.assignees[0][marker] = true;
        item.status = marker === 'waitingAdmin' ? 'WAITING_ADMIN' : 'IN_PROGRESS';
        return item;
      });
      const { fixture, http } = await renderTasks('IN_PROGRESS', tasks);
      const root: HTMLElement = fixture.nativeElement;
      expect(root.querySelector('.task-row')?.textContent).toContain('Đã chuyển về quản trị viên');
      expect(root.querySelector('.viewing-task')?.textContent).toContain(
        'Đã chuyển về quản trị viên',
      );
      expect(root.textContent).not.toContain('Đã chuyển sang ca khác');
      expect(root.querySelector<HTMLInputElement>('input[type="checkbox"]')?.disabled).toBe(true);
      expect(root.querySelector<HTMLSelectElement>('.viewing-task select')?.disabled).toBe(true);
      expect(root.querySelector<HTMLTextAreaElement>('.viewing-task textarea')?.disabled).toBe(
        true,
      );
      expect(root.textContent).not.toContain('Xác nhận lịch với khách');
      await fixture.componentInstance.toggle('GENERAL');
      await fixture.componentInstance.confirmViewing(fixture.componentInstance.list[1]);
      http.expectNone((request) => request.method !== 'GET');
      http.verify();
      fixture.destroy();
    },
  );
  it('keeps PENDING_CONFIRM read-only even if an outdated API response says editable', async () => {
    const pending = task('GENERAL', true);
    pending.status = 'PENDING_CONFIRM';
    pending.mine!.personalStatus = 'DONE';
    pending.assignees[0].personalStatus = 'DONE';
    const { fixture, http } = await renderTasks('IN_PROGRESS', [pending]);
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('.task-row > .emp-badge')?.textContent?.trim()).toBe('Chờ xác nhận');
    expect(root.querySelector<HTMLInputElement>('.task-row input')?.checked).toBe(true);
    expect(root.querySelector<HTMLInputElement>('.task-row input')?.disabled).toBe(true);
    await fixture.componentInstance.toggle(pending.id);
    await expect(
      fixture.componentInstance.tasks.toggleRequest(pending.id, 'record-a'),
    ).rejects.toThrow();
    http.expectNone((request) => request.method !== 'GET');
    http.verify();
    fixture.destroy();
  });
  it('keeps the old carry-over label when only another assignee has returned to admin', async () => {
    const item = task('GENERAL', false, false);
    item.assignees[0].transferredTo = 'next-part';
    item.shiftLinks = [{ id: 'link', shiftId: 'next-shift', reason: 'CARRY_OVER' }];
    item.assignees.push({
      ...item.assignees[0],
      id: 'other-part',
      assignmentId: 'other-record',
      waitingAdmin: true,
    });
    const { fixture, http } = await renderTasks('COMPLETED', [item]);
    expect(fixture.nativeElement.textContent).toContain('Đã chuyển sang ca khác');
    expect(fixture.nativeElement.textContent).not.toContain('Đã chuyển về quản trị viên');
    http.verify();
    fixture.destroy();
  });
  it('renders an empty API response without inventing business records', async () => {
    const { fixture, http } = await employeeHttpTest(EmployeeShiftTasksComponent);
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.children.length).toBeGreaterThan(0);
    http.verify();
    fixture.destroy();
  });
  it('previews REGISTERED tasks with confirmation available and result controls disabled', async () => {
    const { fixture, http } = await renderTasks('REGISTERED', [task('GENERAL'), task('VIEWING')]);
    const root: HTMLElement = fixture.nativeElement;
    expect(root.textContent).toContain('Chưa check-in — bạn có thể xem trước công việc');
    expect(root.querySelector('.assignment-notice a')?.getAttribute('href')).toBe(
      '/employee/shifts/record-a/check-in',
    );
    expect(root.querySelector('.timer-card')).toBeNull();
    expect(root.querySelector('.shift-banner')).toBeNull();
    expect(root.querySelector('.emp-step-strip')).toBeNull();
    expect(root.querySelector<HTMLInputElement>('input[type="checkbox"]')?.disabled).toBe(true);
    expect(root.querySelector('.viewing-task input[type="checkbox"]')).toBeNull();
    expect(root.querySelector<HTMLSelectElement>('.viewing-task select')?.disabled).toBe(true);
    expect(root.querySelector<HTMLTextAreaElement>('.viewing-task textarea')?.disabled).toBe(true);
    expect(root.querySelector('a[href="tel:0901234567"]')).not.toBeNull();
    expect(root.textContent).toContain('07:30–08:00 15/11/2026');
    expect(root.textContent).toContain('Nội dung cần thực hiện');
    const confirm = Array.from(root.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Xác nhận lịch với khách'),
    )!;
    expect(confirm.disabled).toBe(false);
    const pending = fixture.componentInstance.confirmViewing(
      fixture.componentInstance.list.find((t) => t.kind === 'VIEWING')!,
    );
    const req = http.expectOne('/viewings/viewing-a/status');
    expect(req.request.body).toEqual({ status: 'DA_XAC_NHAN' });
    req.flush('{}');
    const confirmed = task('VIEWING');
    confirmed.viewing!.status = 'DA_XAC_NHAN';
    await flushEmployeeReads(http, {
      '/data/me/shift-assignments': [assignment],
      '/data/me/shift-assignments/record-a/tasks': [task('GENERAL'), confirmed],
    });
    await pending;
    fixture.detectChanges();
    expect(root.textContent).toContain('Đã xác nhận');
    expect(root.querySelector<HTMLButtonElement>('.viewing-task > .emp-btn')?.disabled).toBe(true);
    http.verify();
    fixture.destroy();
  });
  it.each(['COMPLETED', 'ABSENT'] as const)(
    'renders %s history without mutable controls',
    async (status) => {
      const { fixture, http } = await renderTasks(status, [
        task('GENERAL', false, false),
        task('VIEWING'),
      ]);
      const root: HTMLElement = fixture.nativeElement;
      expect(root.textContent).toContain('Ca đã kết thúc — lịch sử công việc');
      expect(root.textContent).toContain('Đã chuyển sang ca khác');
      expect(root.querySelector<HTMLInputElement>('input[type="checkbox"]')?.disabled).toBe(true);
      expect(root.querySelector('.timer-card')).toBeNull();
      expect(root.querySelector('.emp-step-strip')).toBeNull();
      expect(
        Array.from(root.querySelectorAll('button')).some((button) =>
          button.textContent?.includes('Xác nhận lịch với khách'),
        ),
      ).toBe(false);
      http.verify();
      fixture.destroy();
    },
  );
  it('respects editable=false during IN_PROGRESS and keeps VIEWING free of checkboxes', async () => {
    const { fixture, http } = await renderTasks('IN_PROGRESS', [
      task('GENERAL'),
      task('VIEWING', true),
    ]);
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector<HTMLInputElement>('input[type="checkbox"]')?.disabled).toBe(true);
    expect(root.querySelector('.viewing-task input[type="checkbox"]')).toBeNull();
    expect(root.querySelector('.emp-step-strip')).not.toBeNull();
    http.verify();
    fixture.destroy();
  });
  it('requires confirmation before completing a viewing', async () => {
    const viewing = task('VIEWING', true);
    viewing.viewing!.status = 'DA_XAC_NHAN';
    const { fixture, http } = await renderTasks('IN_PROGRESS', [viewing]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await fixture.componentInstance.completeViewing(fixture.componentInstance.list[0]);
    expect(confirm).toHaveBeenCalledOnce();
    http.expectNone('/viewings/viewing-a/status');
    confirm.mockRestore();
    http.verify();
    fixture.destroy();
  });
  it('keeps form controls and unsaved notes across zoneless rendering and API refreshes', async () => {
    const viewing = task('VIEWING', true);
    viewing.viewing!.status = 'DA_XAC_NHAN';
    const { fixture, http } = await renderTasks('IN_PROGRESS', [viewing]);
    const component = fixture.componentInstance;
    const root: HTMLElement = fixture.nativeElement;
    const textarea = root.querySelector<HTMLTextAreaElement>('.viewing-task textarea')!;
    const row = root.querySelector('.viewing-task');
    const firstTask = component.list[0];
    component.draft(firstTask.viewing!.rooms[0]).note = 'Ghi chú chưa lưu';
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.list[0]).toBe(firstTask);
    expect(root.querySelector('.viewing-task textarea')).toBe(textarea);
    expect(textarea.value).toBe('Ghi chú chưa lưu');

    const refreshed = task('VIEWING', true);
    refreshed.viewing!.status = 'DA_XAC_NHAN';
    const refresh = component.shifts.api.refresh();
    await flushEmployeeReads(http, {
      '/data/me/shift-assignments': [{ ...assignment, status: 'IN_PROGRESS' }],
      '/data/me/shift-assignments/record-a/tasks': [refreshed],
    });
    await refresh;
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.list[0]).not.toBe(firstTask);
    expect(root.querySelector('.viewing-task')).toBe(row);
    expect(root.querySelector('.viewing-task textarea')).toBe(textarea);
    expect(textarea.value).toBe('Ghi chú chưa lưu');
    http.verify();
    fixture.destroy();
  });
  it('saves room results, completes the task and reloads task counts from the API', async () => {
    const viewing = task('VIEWING', true);
    viewing.viewing!.status = 'DA_XAC_NHAN';
    const { fixture, http } = await renderTasks('IN_PROGRESS', [viewing]);
    const component = fixture.componentInstance;
    const item = component.list[0],
      room = item.viewing!.rooms[0];
    component.draft(room).note = 'a'.repeat(1001);
    await component.saveRoom(item, room);
    http.expectNone('/viewing-details/detail-a');
    expect(component.error).toContain('không quá 1000 ký tự');

    component.draft(room).viewStatus = 'DA_XEM';
    component.draft(room).note = 'Khách đã xem phòng.';
    const save = component.saveRoom(item, room);
    const detail = http.expectOne('/viewing-details/detail-a');
    expect(detail.request.body).toEqual({ viewStatus: 'DA_XEM', note: 'Khách đã xem phòng.' });
    detail.flush('{}');
    viewing.viewing!.rooms[0] = { ...room, viewStatus: 'DA_XEM', note: 'Khách đã xem phòng.' };
    await flushEmployeeReads(http, {
      '/data/me/shift-assignments': [
        { ...assignment, status: 'IN_PROGRESS', taskCount: 1, openTaskCount: 1 },
      ],
      '/data/me/shift-assignments/record-a/tasks': [viewing],
    });
    await save;
    expect(component.list[0].viewing!.rooms[0].viewStatus).toBe('DA_XEM');

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const complete = component.completeViewing(component.list[0]);
    const status = http.expectOne('/viewings/viewing-a/status');
    expect(status.request.body).toEqual({ status: 'DA_XEM' });
    status.flush('{}');
    viewing.status = 'DONE';
    viewing.editable = false;
    viewing.mine!.personalStatus = 'DONE';
    viewing.viewing!.status = 'DA_XEM';
    await flushEmployeeReads(http, {
      '/data/me/shift-assignments': [
        { ...assignment, status: 'IN_PROGRESS', taskCount: 1, openTaskCount: 0 },
      ],
      '/data/me/shift-assignments/record-a/tasks': [viewing],
    });
    await complete;
    fixture.detectChanges();
    expect(component.assignment?.openTaskCount).toBe(0);
    expect(component.done).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('Hoàn thành');
    expect(fixture.nativeElement.querySelector('.viewing-task input[type="checkbox"]')).toBeNull();
    confirm.mockRestore();
    http.verify();
    fixture.destroy();
  });
});
