import { EmployeeCheckInComponent } from './employee-check-in';
import { employeeHttpTest, flushEmployeeReads } from '../employee-http-testing';
import { ApiAssignment } from '../../classes/ShiftApi';

async function renderCheckIn(now: string, canCheckIn = true) {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse(now));
  const context = await employeeHttpTest(EmployeeCheckInComponent);
  const assignment: ApiAssignment = {
    id: 'record-a',
    shiftId: 'shift-a',
    employeeId: 'employee-a',
    registrationId: 'r',
    status: 'REGISTERED',
    canCheckIn,
    shift: {
      id: 'shift-a',
      periodId: 'p',
      workLocationId: 'location',
      date: '2026-11-16',
      label: 'Ca sáng',
      startTime: '07:00',
      endTime: '11:00',
      startsAt: '2026-11-16T07:00:00+07:00',
      endsAt: '2026-11-16T11:00:00+07:00',
      capacity: 6,
      assignedCount: 1,
      status: 'OPEN',
    },
  };
  const refresh = context.fixture.componentInstance.shifts.api.refresh();
  await flushEmployeeReads(context.http, { '/data/me/shift-assignments': [assignment] });
  await refresh;
  context.fixture.componentInstance.file = new File(['image'], 'evidence.jpg', {
    type: 'image/jpeg',
  });
  context.fixture.detectChanges();
  return context;
}

describe('EmployeeCheckInComponent with HTTP data', () => {
  afterEach(() => vi.restoreAllMocks());
  it('renders an empty API response without inventing business records', async () => {
    const { fixture, http } = await employeeHttpTest(EmployeeCheckInComponent);
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.children.length).toBeGreaterThan(0);
    http.verify();
    fixture.destroy();
  });

  it('requires an actual image file before posting attendance', async () => {
    const { fixture, http } = await employeeHttpTest(EmployeeCheckInComponent);
    await fixture.componentInstance.submit();
    expect(fixture.componentInstance.error()).toContain('chọn ảnh');
    http.expectNone((r) => r.method === 'POST');
    http.verify();
    fixture.destroy();
  });

  it.each([
    ['2026-11-16T06:59:59+07:00', 'Chưa tới giờ ca làm. Check-in mở lúc 07:00 ngày 16/11.'],
    ['2026-11-16T11:00:00+07:00', 'Ca đã kết thúc, không thể check-in.'],
    ['2026-11-15T08:00:00+07:00', 'Chưa tới giờ ca làm. Check-in mở lúc 07:00 ngày 16/11.'],
    ['2026-11-17T08:00:00+07:00', 'Ca đã kết thúc, không thể check-in.'],
  ])('locks the form outside the exact shift at %s', async (now, message) => {
    const { fixture, http } = await renderCheckIn(now);
    const component = fixture.componentInstance;
    const request = vi.spyOn(component.attendance, 'checkInRequest');
    expect(fixture.nativeElement.querySelector('.check-in-window')?.textContent?.trim()).toBe(
      message,
    );
    expect(fixture.nativeElement.querySelector('.checkin-form button')?.disabled).toBe(true);
    await component.submit();
    expect(request).not.toHaveBeenCalled();
    http.expectNone((r) => r.method === 'POST');
    http.verify();
    fixture.destroy();
  });

  it.each(['2026-11-16T07:00:00+07:00', '2026-11-16T10:59:59+07:00'])(
    'allows check-in inside the window at %s',
    async (now) => {
      const { fixture, http } = await renderCheckIn(now);
      const component = fixture.componentInstance;
      const request = vi.spyOn(component.attendance, 'checkInRequest').mockResolvedValue(undefined);
      const navigate = vi.spyOn(component.router, 'navigate').mockResolvedValue(true);
      expect(fixture.nativeElement.querySelector('.checkin-form button')?.disabled).toBe(false);
      expect(fixture.nativeElement.querySelector('.check-in-window')).toBeNull();
      await component.submit();
      expect(request).toHaveBeenCalledWith('record-a', '', '', component.file);
      expect(navigate).toHaveBeenCalledWith(['/employee/shifts', 'record-a', 'tasks']);
      http.verify();
      fixture.destroy();
    },
  );

  it('updates the disabled form at the end of a shift through signals', async () => {
    const { fixture, http } = await renderCheckIn('2026-11-16T10:59:59+07:00');
    fixture.componentInstance.shifts.now.set(Date.parse('2026-11-16T11:00:00+07:00'));
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.checkin-form button')?.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Ca đã kết thúc, không thể check-in.');
    http.verify();
    fixture.destroy();
  });

  it('honors a false server flag even during shift hours', async () => {
    const { fixture, http } = await renderCheckIn('2026-11-16T08:00:00+07:00', false);
    const request = vi.spyOn(fixture.componentInstance.attendance, 'checkInRequest');
    expect(fixture.nativeElement.querySelector('.checkin-form button')?.disabled).toBe(true);
    await fixture.componentInstance.submit();
    expect(request).not.toHaveBeenCalled();
    http.verify();
    fixture.destroy();
  });
});
