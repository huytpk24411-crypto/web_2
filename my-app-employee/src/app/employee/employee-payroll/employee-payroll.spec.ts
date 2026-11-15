import { TestBed } from '@angular/core/testing';
import { PayrollAPIService } from '../../services/payroll-apiservice';
import { EmployeePayrollComponent } from './employee-payroll';
import { employeeHttpTest } from '../employee-http-testing';

describe('EmployeePayrollComponent with HTTP data', () => {
  it('renders an empty API response without inventing business records', async () => {
    const { fixture, http } = await employeeHttpTest(EmployeePayrollComponent);
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.children.length).toBeGreaterThan(0);
    http.verify();
    fixture.destroy();
  });
  it('renders readable reasons and dated late fees without IDs, JSON or negative zero', async () => {
    const { fixture, http } = await employeeHttpTest(EmployeePayrollComponent);
    const loaded = TestBed.inject(PayrollAPIService).refresh('2026-11');
    http.expectOne('/data/me/payroll-periods').flush([{ id: 'period-a', code: '2026-11' }]);
    let request!: ReturnType<typeof http.expectOne>;
    await vi.waitFor(() => {
      request = http.expectOne('/data/me/payslips?period=2026-11');
    });
    request.flush({
      id: 'slip-a',
      employeeId: 'employee-a',
      periodCode: '2026-11',
      baseSalary: 6000000,
      totalRevenue: 0,
      commissionAmount: 0,
      totalBonus: 0,
      totalDeductions: 0,
      netPay: 6000000,
      status: 'DRAFT',
      adjustment: {
        notes:
          '{"reason":"Đã đối soát","bonusReason":"Không thưởng","lateness":[]}\n2026-11-05: trễ 5 phút; attendance attendance-private; policy-private: 0 VND',
      },
      lateness: [{ attendanceId: 'attendance-private', lateMinutes: 5, amount: 0 }],
      transactions: [],
    });
    await loaded;
    fixture.detectChanges();
    const content = fixture.nativeElement.textContent as string;
    expect(content).toContain('Lý do khấu trừ: Đã đối soát');
    expect(content).toContain('Lý do thưởng: Không thưởng');
    expect(content).toContain('05/11/2026');
    expect(content).toContain('Trễ 5 phút');
    expect(content).not.toContain('attendance-private');
    expect(content).not.toContain('policy-private');
    expect(content).not.toContain('{"');
    expect(content.replace(/\s+/g, ' ')).not.toContain('-0');
    http.verify();
    fixture.destroy();
  });
});
