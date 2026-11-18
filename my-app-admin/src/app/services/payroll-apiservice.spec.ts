import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Account } from '../classes/Account';
import { AuthService } from './auth-service';
import { PayrollAPIService } from './payroll-apiservice';

describe('P5 payroll transport and isolation', () => {
  const account = signal<Account | null>({ id: 'a', username: 'a', name: 'A', role: 'EMPLOYEE' });
  const serverAuthenticated = signal(true);
  let api: PayrollAPIService, http: HttpTestingController;
  beforeEach(async () => {
    account.set({ id: 'a', username: 'a', name: 'A', role: 'EMPLOYEE' });
    serverAuthenticated.set(true);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { account, serverAuthenticated } },
      ],
    });
    api = TestBed.inject(PayrollAPIService);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
    http.expectOne('/data/me/payroll-periods').flush([]);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  afterEach(() => http.verify());
  it('explains rejected policy ranges with a usable message', () => {
    const error = new HttpErrorResponse({ status: 400, error: { code: 'INVALID_POLICY_RANGE' } });
    expect(api.message(error)).toBe(
      'Mốc trên phải lớn hơn mốc dưới. Để trống mốc trên nếu không giới hạn.',
    );
  });
  it('uses payroll-month revenue for salaries while keeping actual company revenue separate', () => {
    const report = {
      month: '2026-12',
      revenue: 1000000,
      payrollRevenue: 3100000,
      carriedPayrollRevenue: 2100000,
      contractCount: 1,
      commission: 620000,
      baseSalary: 5000000,
      bonus: 0,
      deductions: 0,
      netPay: 5620000,
      shiftCount: 0,
      lateCount: 0,
      topEmployees: [
        { employeeId: 'other', name: 'Doanh thu thực thu', revenue: 1000000, contractCount: 1 },
      ],
      payrollTopEmployees: [
        {
          employeeId: 'employee',
          name: 'Nhân viên có khoản chuyển',
          revenue: 3100000,
          contractCount: 2,
        },
      ],
    };
    vi.spyOn(api, 'state').mockReturnValue({ ...api.state(), reports: { '2026-12': report } });
    const period = api.periodView('2026-12');
    expect(period.revenue).toBe(3100000);
    expect(period.companyRevenue).toBe(1000000);
    expect(period.carriedRevenue).toBe(2100000);
    expect(period.leader1).toBe('Nhân viên có khoản chuyển');
    expect(period.team1).toBe(3100000);
  });
  it('reports connection errors and keeps rejected reads empty', async () => {
    const unavailable = api.refresh();
    http.expectOne('/data/me/payroll-periods').error(new ProgressEvent('error'));
    await unavailable;
    expect(api.online()).toBe(true);
    const forbidden = api.refresh();
    http.expectOne('/data/me/payroll-periods').flush({}, { status: 403, statusText: 'Forbidden' });
    await forbidden;
    expect(api.online()).toBe(true);
    expect(api.error()).toContain('không có quyền');
  });
  it('retains idempotency after an uncertain write and never reports a local success', async () => {
    const path = 'admin/payroll-periods/p/calculate';
    const first = api.write(path),
      failed = expect(first).rejects.toThrow();
    const original = http.expectOne('/data/' + path),
      key = original.request.headers.get('Idempotency-Key');
    expect(original.request.withCredentials).toBe(true);
    original.error(new ProgressEvent('error'));
    await failed;
    expect(api.online()).toBe(true);
    const retry = api.write(path),
      rejected = expect(retry).rejects.toThrow();
    const next = http.expectOne('/data/' + path);
    expect(next.request.headers.get('Idempotency-Key')).toBe(key);
    next.flush({ code: 'PAYROLL_CLOSED' }, { status: 409, statusText: 'Closed' });
    await rejected;
    expect(api.online()).toBe(true);
  });
  it('hides previous employee data immediately on account change and ignores late responses', async () => {
    const read = api.refresh('2026-11');
    account.set({ id: 'b', username: 'b', name: 'B', role: 'EMPLOYEE' });
    expect(api.state().slips).toEqual({});
    http.expectOne('/data/me/payroll-periods').flush([]);
    await read;
    expect(api.state().slips).toEqual({});
  });
});
