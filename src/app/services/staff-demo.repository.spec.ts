import { StaffDemoRepository } from './staff-demo.repository';

function mondayAfter(days: number): string {
  const value = new Date();
  value.setDate(value.getDate() + days);
  value.setDate(value.getDate() - ((value.getDay() + 6) % 7));
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function openPeriod(repository: StaffDemoRepository, days = 14) {
  const weekStart = mondayAfter(days);
  repository.createPeriod({
    name: `Test ${weekStart}`,
    weekStart,
    opensAt: new Date(Date.now() - 60_000).toISOString(),
    closesAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    capacity: 4,
    locationId: repository.state().locations[0].id,
  });
  return repository.state().periods.find((period) => period.weekStart === weekStart)!;
}

describe('StaffDemoRepository', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('moves an assignment atomically, preserves its origin and flags unfinished work', () => {
    const repository = new StaffDemoRepository();
    const period = openPeriod(repository);
    const [source, target] = repository.state().shifts.filter((s) => s.periodId === period.id);
    repository.register('staff-demo-1', source.id);
    const assignment = repository.activeAssignments(source.id)[0];
    repository.createTask(source.id, 'Bàn giao lịch demo', ['staff-demo-1']);
    repository.moveAssignment(assignment.id, target.id);
    expect(repository.activeAssignments(source.id)).toHaveLength(0);
    expect(repository.activeAssignments(target.id)[0].movedFromAssignmentId).toBe(assignment.id);
    expect(repository.state().tasks.at(-1)?.needsReassignment).toBe(true);
    expect(repository.state().tasks.at(-1)?.currentShiftId).toBe(source.id);
    expect(new StaffDemoRepository().activeAssignments(target.id)).toHaveLength(1);
    const snapshot = localStorage.getItem('ihouzz-staff-demo-v1');
    expect(() => repository.moveAssignment(assignment.id, source.id)).toThrow();
    expect(localStorage.getItem('ihouzz-staff-demo-v1')).toBe(snapshot);
  });

  it('rejects full or overlapping replacement shifts without cancelling the original', () => {
    const repository = new StaffDemoRepository();
    const period = openPeriod(repository);
    const [source, target] = repository.state().shifts.filter((s) => s.periodId === period.id);
    repository.register('staff-demo-1', source.id);
    for (const id of ['staff-demo-2', 'staff-demo-3', 'staff-demo-4', 'staff-demo-6'])
      repository.register(id, target.id);
    const assignment = repository.activeAssignments(source.id)[0];
    expect(() => repository.moveAssignment(assignment.id, target.id)).toThrow('đủ người');
    expect(repository.activeAssignments(source.id)).toHaveLength(1);
    repository.cancelAssignment(repository.activeAssignments(target.id)[0].id);
    repository.createShift({
      periodId: target.periodId,
      date: target.date,
      capacity: 4,
      workLocationId: target.workLocationId,
      label: 'Ca trùng',
      start: '14:00',
      end: '16:00',
    });
    const overlapping = repository.state().shifts.at(-1)!;
    repository.register('staff-demo-1', overlapping.id);
    expect(() => repository.moveAssignment(assignment.id, target.id)).toThrow('Trùng giờ');
    expect(repository.activeAssignments(source.id)).toHaveLength(1);
  });

  it('archives staff from the operating list while keeping history and flagging future vacancies', () => {
    const repository = new StaffDemoRepository();
    const period = openPeriod(repository);
    const shift = repository.state().shifts.find((s) => s.periodId === period.id)!;
    repository.register('staff-demo-1', shift.id);
    repository.archiveEmployee('staff-demo-1');
    expect(repository.employees()).toHaveLength(5);
    expect(repository.employee('staff-demo-1')?.archivedAt).toBeTruthy();
    expect(repository.activeAssignments(shift.id)).toHaveLength(0);
    expect(repository.state().shifts.find((s) => s.id === shift.id)?.needsReassignment).toBe(true);
    expect(repository.metrics('staff-demo-1').completed).toBe(2);
    expect(new StaffDemoRepository().employees()).toHaveLength(5);
  });

  it('persists profile changes, rejects duplicate contact details, and resets the demo', () => {
    const repository = new StaffDemoRepository();
    const source = repository.employee('staff-demo-1')!;
    const { id: _id, employeeCode: _code, ...input } = source;
    input.fullName = 'Nhân sự thử nghiệm';
    input.email = 'test@example.test';
    input.phone = '0912345678';
    const saved = repository.saveEmployee(input);

    expect(new StaffDemoRepository().employee(saved.id)?.fullName).toBe('Nhân sự thử nghiệm');
    expect(() => repository.saveEmployee({ ...input, email: 'nhanvien1@example.test' })).toThrow(
      'Email hoặc số điện thoại',
    );

    repository.reset();
    expect(new StaffDemoRepository().employee(saved.id)).toBeUndefined();
  });

  it('assigns a shift without approval, enforces capacity and overlap, and releases a canceled spot', () => {
    const repository = new StaffDemoRepository();
    const period = openPeriod(repository);
    const shift = repository.state().shifts.find((item) => item.periodId === period.id)!;
    repository.createShift({
      periodId: period.id,
      date: shift.date,
      start: '09:00',
      end: '11:00',
      capacity: 4,
      workLocationId: shift.workLocationId,
      label: 'Ca chồng giờ',
    });
    const secondShift = repository
      .state()
      .shifts.find((item) => item.periodId === period.id && item.label === 'Ca chồng giờ')!;

    const assignments = ['staff-demo-1', 'staff-demo-2', 'staff-demo-3', 'staff-demo-4'].map(
      (employeeId) => {
        repository.register(employeeId, shift.id);
        return repository.activeAssignments(shift.id, employeeId)[0];
      },
    );
    expect(repository.remaining(shift)).toBe(0);
    expect(() => repository.register('staff-demo-6', shift.id)).toThrow('đủ chỗ');
    expect(() => repository.register('staff-demo-1', secondShift.id)).toThrow('trùng giờ');

    repository.cancelAssignment(assignments[0].id);
    repository.register('staff-demo-6', shift.id);
    expect(repository.activeAssignments(shift.id)).toHaveLength(4);
  });

  it('keeps task origin when carrying work and marks future shifts for reassignment on deactivation', () => {
    const repository = new StaffDemoRepository();
    const period = openPeriod(repository);
    const shifts = repository
      .state()
      .shifts.filter((item) => item.periodId === period.id)
      .slice(0, 2);
    repository.register('staff-demo-1', shifts[0].id);
    repository.register('staff-demo-1', shifts[1].id);
    repository.createTask(shifts[0].id, 'Việc cần chuyển', ['staff-demo-1']);
    const task = repository.state().tasks.find((item) => item.title === 'Việc cần chuyển')!;

    repository.carryTask(task.id, shifts[1].id);
    expect(repository.state().tasks.find((item) => item.id === task.id)).toMatchObject({
      originShiftId: shifts[0].id,
      currentShiftId: shifts[1].id,
    });
    repository.deactivate('staff-demo-1');
    expect(repository.employee('staff-demo-1')?.status).toBe('INACTIVE');
    expect(
      repository.state().shifts.find((item) => item.id === shifts[1].id)?.needsReassignment,
    ).toBe(true);
    expect(repository.state().tasks.find((item) => item.id === task.id)?.needsReassignment).toBe(
      true,
    );
  });

  it('does not allow a profile edit to bypass future-shift reassignment', () => {
    const repository = new StaffDemoRepository();
    const source = repository.employee('staff-demo-1')!;
    const { id: _id, employeeCode: _code, ...input } = source;
    input.status = 'INACTIVE';
    expect(() => repository.saveEmployee(input, source.id)).toThrow(
      'dùng thao tác Ngừng hoạt động',
    );
    expect(repository.employee(source.id)?.status).toBe('ACTIVE');
  });

  it('does not mutate the calendar just by reading an empty future week', () => {
    const repository = new StaffDemoRepository();
    const count = repository.state().shifts.length;
    expect(repository.week(mondayAfter(35))).toEqual([]);
    expect(repository.state().shifts.length).toBe(count);
    expect(() => openPeriod(repository, 35)).not.toThrow();
  });

  it('rejects overlapping edits and marks canceled work for reassignment', () => {
    const repository = new StaffDemoRepository();
    const period = openPeriod(repository);
    const [morning, afternoon] = repository
      .state()
      .shifts.filter((item) => item.periodId === period.id);
    repository.register('staff-demo-1', morning.id);
    repository.register('staff-demo-1', afternoon.id);
    repository.createTask(morning.id, 'Pending handover', ['staff-demo-1']);
    expect(() => repository.saveShift({ ...afternoon, start: '11:00' }, afternoon.id)).toThrow(
      'trùng giờ',
    );
    repository.cancelAssignment(repository.activeAssignments(morning.id)[0].id);
    expect(repository.state().tasks.at(-1)?.needsReassignment).toBe(true);
    expect(() =>
      repository.toggleTask(repository.state().tasks.at(-1)!.id, 'staff-demo-1'),
    ).toThrow('không còn nhận ca');
  });

  it('transfers unfinished work once to later occupied shifts, retaining completion and origin', () => {
    const repository = new StaffDemoRepository();
    const period = openPeriod(repository);
    const [first, second] = repository.state().shifts.filter((item) => item.periodId === period.id);
    repository.register('staff-demo-1', first.id);
    repository.register('staff-demo-2', first.id);
    repository.register('staff-demo-3', second.id);
    repository.createTask(first.id, 'Shared task', ['staff-demo-1', 'staff-demo-2']);
    const task = repository.state().tasks.at(-1)!;
    repository.toggleTask(task.id, 'staff-demo-1');
    const count = repository.state().tasks.length;
    repository.carryTask(task.id, second.id);
    expect(repository.state().tasks.length).toBe(count);
    const carried = repository.state().tasks.at(-1)!;
    expect(carried.doneBy).toEqual(['staff-demo-1']);
    expect(carried.assigneeIds).toEqual(['staff-demo-1', 'staff-demo-3']);
    expect(carried.transfers?.[0].previousAssigneeIds).toEqual(['staff-demo-1', 'staff-demo-2']);
    expect(() => repository.carryTask(task.id, first.id)).toThrow('ca sau');
    repository.toggleTask(task.id, 'staff-demo-3');
    expect(repository.state().tasks.at(-1)?.status).toBe('DONE');
    expect(repository.metrics('staff-demo-3', period.id).tasksDone).toBe(1);
  });

  it('counts completion only after checkout and derives punctuality from timestamps', () => {
    const repository = new StaffDemoRepository();
    const period = openPeriod(repository);
    const shift = repository.state().shifts.find((item) => item.periodId === period.id)!;
    repository.register('staff-demo-1', shift.id);
    const assignment = repository.activeAssignments(shift.id)[0];
    repository.checkIn(assignment.id, `${shift.date}T08:36:00`);
    expect(repository.metrics('staff-demo-1', period.id)).toMatchObject({
      completed: 0,
      onTimeRate: 0,
      attendanceCount: 1,
    });
    expect(() => repository.checkOut(assignment.id, `${shift.date}T08:00:00`)).toThrow('Giờ ra');
    repository.checkOut(assignment.id, `${shift.date}T12:30:00`);
    expect(new StaffDemoRepository().metrics('staff-demo-1', period.id).completed).toBe(1);
  });

  it('enforces closed registration periods and keeps historical shifts unchanged', () => {
    const repository = new StaffDemoRepository();
    const old = repository.state().shifts[0];
    expect(() => repository.register('staff-demo-6', old.id)).toThrow('đã bắt đầu');
    expect(() => repository.saveShift({ ...old, capacity: 8 }, old.id)).toThrow('lịch sử');
    const period = openPeriod(repository);
    repository.update(
      (state) =>
        (state.periods.find((item) => item.id === period.id)!.closesAt = new Date(
          Date.now() - 1000,
        ).toISOString()),
    );
    const shift = repository.state().shifts.find((item) => item.periodId === period.id)!;
    expect(() => repository.register('staff-demo-1', shift.id)).toThrow('đã đóng');
  });

  it('does not report success or mutate state when storage cannot save', () => {
    const repository = new StaffDemoRepository();
    const source = repository.employee('staff-demo-1')!;
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });
    expect(() => repository.saveEmployee({ ...source, fullName: 'Changed' }, source.id)).toThrow(
      'chưa được lưu',
    );
    expect(repository.employee(source.id)?.fullName).toBe(source.fullName);
    spy.mockRestore();
  });
});
