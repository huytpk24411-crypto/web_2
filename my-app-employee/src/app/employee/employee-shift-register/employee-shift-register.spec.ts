import { EmployeeShiftRegisterComponent } from './employee-shift-register';
import { employeeHttpTest } from '../employee-http-testing';

describe('EmployeeShiftRegisterComponent with HTTP data', () => {
  it('renders an empty API response without inventing business records', async () => {
    const { fixture, http } = await employeeHttpTest(EmployeeShiftRegisterComponent);
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.children.length).toBeGreaterThan(0);
    http.verify();
    fixture.destroy();
  });
});
