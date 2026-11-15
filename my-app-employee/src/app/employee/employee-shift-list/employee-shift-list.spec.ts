import { EmployeeShiftListComponent } from './employee-shift-list';
import { employeeHttpTest, flushEmployeeReads } from '../employee-http-testing';
import { ApiAssignment, ApiShift } from '../../classes/ShiftApi';
import { addCalendarDays } from '../../classes/shift-calendar';

function assignment(
  id: string,
  date = '2026-11-16',
  afternoon = false,
  status: ApiAssignment['status'] = 'REGISTERED',
  canCheckIn = false,
): ApiAssignment {
  const shift: ApiShift = {
    id: 'shift-' + id,
    periodId: 'period',
    workLocationId: 'location',
    date,
    label: afternoon ? 'Ca chiều' : 'Ca sáng',
    startTime: afternoon ? '13:00' : '07:00',
    endTime: afternoon ? '17:00' : '11:00',
    startsAt: date + (afternoon ? 'T13:00:00+07:00' : 'T07:00:00+07:00'),
    endsAt: date + (afternoon ? 'T17:00:00+07:00' : 'T11:00:00+07:00'),
    capacity: 6,
    assignedCount: 1,
    status: 'OPEN',
  };
  return {
    id,
    shiftId: shift.id,
    shift,
    employeeId: 'employee-a',
    registrationId: 'r',
    status,
    canCheckIn,
    taskCount: 3,
    openTaskCount: 2,
  };
}
async function render(assignments: ApiAssignment[] = [], now = '2026-11-16T06:59:59+07:00') {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse(now));
  const context = await employeeHttpTest(EmployeeShiftListComponent);
  const refresh = context.fixture.componentInstance.shifts.api.refresh();
  await flushEmployeeReads(context.http, { '/data/me/shift-assignments': assignments });
  await refresh;
  context.fixture.detectChanges();
  return context;
}

describe('EmployeeShiftListComponent weekly calendar (zoneless)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders an empty week inside the calendar with a registration link', async () => {
    const { fixture, http } = await render();
    const empty = fixture.nativeElement.querySelector('.week-empty') as HTMLElement;
    expect(empty.textContent).toContain('Không có ca trong tuần này');
    expect(empty.querySelector('a')?.getAttribute('href')).toBe('/employee/shifts/register');
    expect(fixture.nativeElement.querySelectorAll('.shift-card')).toHaveLength(0);
    http.verify();
    fixture.destroy();
  });

  it('places 14 assignments in the correct seven dates and two shift rows, hiding cancelled ones', async () => {
    const assignments = Array.from({ length: 7 }, (_, day) =>
      [false, true].map((afternoon) =>
        assignment(day + '-' + afternoon, addCalendarDays('2026-11-16', day), afternoon),
      ),
    ).flat();
    assignments.push(assignment('cancelled', '2026-11-16', false, 'CANCELLED'));
    const { fixture, http } = await render(assignments);
    const root: HTMLElement = fixture.nativeElement;
    const headers = Array.from(root.querySelectorAll<HTMLElement>('thead th[data-date]'));
    expect(headers.map((header) => header.dataset['date'])).toEqual(
      Array.from({ length: 7 }, (_, i) => addCalendarDays('2026-11-16', i)),
    );
    expect(headers.map((header) => header.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('Thứ 2'), expect.stringContaining('CN')]),
    );
    const rows = Array.from(root.querySelectorAll('.shift-row'));
    expect(rows).toHaveLength(2);
    rows.forEach((row, rowIndex) => {
      expect(row.querySelector('th')?.textContent).toContain(rowIndex ? 'Ca chiều' : 'Ca sáng');
      expect(row.querySelectorAll('td')).toHaveLength(7);
      Array.from(row.querySelectorAll('td')).forEach((cell, day) => {
        expect(cell.querySelectorAll('.shift-card')).toHaveLength(1);
        expect(cell.querySelector('.task-link')?.getAttribute('href')).toBe(
          '/employee/shifts/' + day + '-' + Boolean(rowIndex) + '/tasks',
        );
      });
    });
    expect(root.querySelectorAll('.shift-card')).toHaveLength(14);
    expect(root.querySelector('thead .today')?.getAttribute('aria-current')).toBe('date');
    expect(root.querySelector('thead .today')?.getAttribute('data-date')).toBe('2026-11-16');
    expect(root.querySelectorAll('tbody td.today')).toHaveLength(2);
    expect(root.textContent).toContain('16/11 – 22/11/2026');
    http.verify();
    fixture.destroy();
  });

  it('switches weeks and returns through the range label or current-week button without API requests', async () => {
    const { fixture, http } = await render([
      assignment('current'),
      assignment('next', '2026-11-23'),
      assignment('previous', '2026-11-09'),
    ]);
    const root: HTMLElement = fixture.nativeElement;
    const buttons = root.querySelectorAll<HTMLButtonElement>('.week-navigation button');
    buttons[3].click();
    await fixture.whenStable();
    expect(root.textContent).toContain('23/11 – 29/11/2026');
    expect(root.querySelector('.task-link')?.getAttribute('href')).toContain('/next/tasks');
    expect(root.querySelector('.today')).toBeNull();
    buttons[1].click();
    await fixture.whenStable();
    expect(root.textContent).toContain('16/11 – 22/11/2026');
    buttons[0].click();
    await fixture.whenStable();
    expect(root.textContent).toContain('09/11 – 15/11/2026');
    expect(root.querySelector('.task-link')?.getAttribute('href')).toContain('/previous/tasks');
    buttons[2].click();
    await fixture.whenStable();
    expect(root.querySelector('.task-link')?.getAttribute('href')).toContain('/current/tasks');
    http.expectNone((request) => request.method === 'GET');
    http.verify();
    fixture.destroy();
  });

  it('uses the Vietnam calendar even while UTC is still on Sunday', async () => {
    const { fixture, http } = await render([], '2026-11-15T17:01:00Z');
    expect(fixture.componentInstance.selectedWeek()).toBe('2026-11-16');
    expect(fixture.nativeElement.querySelector('thead .today')?.dataset.date).toBe('2026-11-16');
    http.verify();
    fixture.destroy();
  });

  it('locks check-in before opening, honors the server flag, and hides it at the exclusive end', async () => {
    const { fixture, http } = await render([
      assignment('record-a', '2026-11-16', false, 'REGISTERED', true),
    ]);
    const component = fixture.componentInstance;
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector<HTMLButtonElement>('button.check-in')?.disabled).toBe(true);
    expect(root.textContent).toContain('Check-in mở lúc 07:00 16/11');
    expect(root.querySelector('.task-link')?.textContent).toContain('Công việc (3)');
    component.shifts.now.set(Date.parse('2026-11-16T07:00:00+07:00'));
    await fixture.whenStable();
    expect(root.querySelector('a.check-in')?.getAttribute('href')).toBe(
      '/employee/shifts/record-a/check-in',
    );
    component.shifts.now.set(Date.parse('2026-11-16T10:59:59+07:00'));
    await fixture.whenStable();
    expect(root.querySelector('a.check-in')).not.toBeNull();
    component.shifts.now.set(Date.parse('2026-11-16T11:00:00+07:00'));
    await fixture.whenStable();
    expect(root.querySelector('.check-in')).toBeNull();
    http.verify();
    fixture.destroy();
  });

  it('keeps check-in locked when the server disallows it during shift hours', async () => {
    const { fixture, http } = await render([assignment('record-a')], '2026-11-16T08:00:00+07:00');
    expect(fixture.nativeElement.querySelector('button.check-in')?.disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('a.check-in')).toBeNull();
    http.verify();
    fixture.destroy();
  });

  it('renders status labels and actions for working, completed and absent assignments', async () => {
    const { fixture, http } = await render([
      assignment('working', '2026-11-16', false, 'IN_PROGRESS'),
      assignment('completed', '2026-11-17', false, 'COMPLETED'),
      assignment('absent', '2026-11-18', false, 'ABSENT'),
    ]);
    const cards = Array.from(
      fixture.nativeElement.querySelectorAll('.shift-card'),
    ) as HTMLElement[];
    expect(cards[0].textContent).toContain('Đang làm');
    expect(cards[0].textContent).toContain('● Đang diễn ra');
    expect(cards[0].querySelector('.task-link')?.textContent).toContain('Tiếp tục công việc');
    expect(cards[0].querySelector('a[href$="/check-out"]')?.textContent).toContain('Check-out');
    expect(cards[1].textContent).toContain('Hoàn thành');
    expect(cards[1].querySelector('a[href$="/check-out"]')?.textContent).toContain('Xem bàn giao');
    expect(cards[1].querySelector('.task-link')?.textContent).toBe('Công việc');
    expect(cards[2].textContent).toContain('Vắng');
    expect(cards[2].textContent).toContain('Không ghi nhận check-in');
    expect(cards[2].querySelector('a, button')).toBeNull();
    http.verify();
    fixture.destroy();
  });
});
