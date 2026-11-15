import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthService } from './auth-service';
import { PayrollService } from './payroll-service';
describe('Employee payroll API ownership', () => {
  let service: PayrollService, http: HttpTestingController;
  const account = signal({ id: 'account-a', role: 'EMPLOYEE' });
  beforeEach(() => {
    account.set({ id: 'account-a', role: 'EMPLOYEE' });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { account, serverAuthenticated: signal(true) } },
      ],
    });
    service = TestBed.inject(PayrollService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('shows no payslips when the server is unreachable', async () => {
    TestBed.tick();
    http.expectOne('/data/me/payroll-periods').error(new ProgressEvent('error'));
    await Promise.resolve();
    await Promise.resolve();
    expect(service.slips).toEqual([]);
    expect(service.api.error()).toContain('Không kết nối được máy chủ');
  });
  it('uses server net pay and commission without adding deposit amounts', async () => {
    TestBed.tick();
    http.expectOne('/data/me/payroll-periods').flush([{ id: 'period', code: '2026-11' }]);
    await Promise.resolve();
    await Promise.resolve();
    http.expectOne('/data/me/payslips?period=2026-11').flush({
      id: 'slip',
      employeeId: 'employee-a',
      periodCode: '2026-11',
      baseSalary: 6000000,
      totalRevenue: 12600000,
      commissionAmount: 3780000,
      totalBonus: 300000,
      totalDeductions: 100000,
      netPay: 9980000,
      commission: { rateBps: 3000 },
      adjustment: { notes: 'Đã đối soát' },
    });
    await new Promise((resolve) => setTimeout(resolve));
    const slip = service.slips[0];
    expect(service.net(slip)).toBe(9980000);
    expect(service.commission(slip)).toBe(3780000);
    account.set({ id: 'account-b', role: 'EMPLOYEE' });
    expect(service.slips).toEqual([]);
  });
});
