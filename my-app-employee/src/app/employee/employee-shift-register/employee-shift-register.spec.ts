import { EmployeeShiftRegisterComponent } from './employee-shift-register';
import { employeeHttpTest, flushEmployeeReads } from '../employee-http-testing';
import { ApiPeriod, ApiShift } from '../../classes/ShiftApi';

describe('EmployeeShiftRegisterComponent with HTTP data', () => {
  it('renders an empty API response without inventing business records', async () => {
    const { fixture, http } = await employeeHttpTest(EmployeeShiftRegisterComponent);
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.children.length).toBeGreaterThan(0);
    http.verify();
    fixture.destroy();
  });
  it('switches between open weeks and clears selections belonging to another week', async () => {
    const periods: ApiPeriod[] = ['2099-01-05', '2099-01-12'].map((weekStart, index) => ({
      id: 'period-' + index,
      name: 'Tuần ' + index,
      weekStart,
      weekEnd: weekStart,
      opensAt: '2098-12-01T00:00:00+07:00',
      closesAt: weekStart + 'T00:00:00+07:00',
      minShifts: 5,
      maxShifts: 8,
      status: 'OPEN',
    }));
    const shift = (index: number): ApiShift => ({
      id: 'shift-' + index,
      periodId: periods[index].id,
      workLocationId: 'office',
      date: periods[index].weekStart,
      label: 'Ca sáng',
      startTime: '07:00',
      endTime: '11:00',
      startsAt: periods[index].weekStart + 'T07:00:00+07:00',
      endsAt: periods[index].weekStart + 'T11:00:00+07:00',
      capacity: 6,
      assignedCount: 0,
      status: 'OPEN',
    });
    const values = {
      '/data/registration-periods': periods,
      '/data/shifts?periodId=period-0': [shift(0)],
      '/data/shifts?periodId=period-1': [shift(1)],
    };
    const { fixture, http } = await employeeHttpTest(EmployeeShiftRegisterComponent, values);
    const page = fixture.componentInstance;
    const select = fixture.nativeElement.querySelector(
      'select[aria-label="Chọn tuần đăng ký"]',
    ) as HTMLSelectElement;
    expect(select.options.length).toBe(2);
    page.toggle('shift-0');
    expect(page.selected).toEqual(['shift-0']);
    const changed = page.changePeriod('period-1');
    await flushEmployeeReads(http, values);
    await changed;
    fixture.detectChanges();
    expect(page.shifts.period.id).toBe('period-1');
    expect(page.selected).toEqual([]);
    expect(page.shifts.registrationShifts.map((shift) => shift.id)).toEqual(['shift-1']);
    page.shifts.now.set(Date.parse(periods[1].closesAt));
    page.toggle('shift-1');
    fixture.detectChanges();
    expect(page.selected).toEqual([]);
    expect(fixture.nativeElement.querySelector('.matrix input').disabled).toBe(true);
    expect(
      Array.from(
        fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
      ).find((button) => button.textContent?.includes('Xác nhận đăng ký'))?.disabled,
    ).toBe(true);
    http.expectNone((request) => request.method !== 'GET');
    http.verify();
    fixture.destroy();
  });
});
