import { EmployeeCheckOutComponent } from './employee-check-out';
import { employeeHttpTest, flushEmployeeReads } from '../employee-http-testing';

describe('EmployeeCheckOutComponent with HTTP data', () => {
  it('renders an empty API response without inventing business records', async () => {
    const { fixture, http } = await employeeHttpTest(EmployeeCheckOutComponent);
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.children.length).toBeGreaterThan(0);
    http.verify();
    fixture.destroy();
  });
  it('explains that unfinished work returns to the administrator', async () => {
    const { fixture, http } = await employeeHttpTest(EmployeeCheckOutComponent);
    const refresh = fixture.componentInstance.shifts.api.refresh();
    await flushEmployeeReads(http, {
      '/data/me/shift-assignments': [
        {
          id: 'record-a',
          shiftId: 's',
          employeeId: 'employee-a',
          registrationId: 'r',
          status: 'IN_PROGRESS',
        },
      ],
    });
    await refresh;
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.textContent).toContain('bàn giao công việc chưa xong cho quản trị viên');
    expect(root.textContent).toContain('Việc chưa xong sẽ chuyển về quản trị viên để giao lại.');
    expect(root.textContent).not.toContain('tự chuyển sang ca kế tiếp');
    http.verify();
    fixture.destroy();
  });
});
