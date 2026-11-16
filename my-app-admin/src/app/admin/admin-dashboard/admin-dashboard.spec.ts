import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthService } from '../../services/auth-service';
import { AdminDashboardAPI, AdminSummary } from '../../services/admin-dashboard-apiservice';

const report: AdminSummary = {
  month: '2026-11',
  asOf: '2026-11-05T00:00:00Z',
  revenue: 5000000,
  contractCount: 1,
  commission: 1000000,
  baseSalary: 0,
  bonus: 0,
  deductions: 0,
  netPay: 0,
  shiftCount: 0,
  lateCount: 0,
  topEmployees: [],
  rooms: { total: 3, byStatus: { AVAILABLE: 1, RENTED: 1, HELD: 1 }, occupancy: 33.3 },
  activeStaff: 2,
  pendingDeposits: 1,
  pendingDepositAmount: 4000000,
  today: {
    date: '2026-11-05',
    shifts: 2,
    assignments: 2,
    checkedIn: 1,
    checkedOut: 0,
    late: 1,
    absent: 0,
  },
};
describe('Admin summary API', () => {
  const account = signal({ id: 'admin-a', role: 'ADMIN' });
  const serverAuthenticated = signal(true);
  let api: AdminDashboardAPI, http: HttpTestingController;
  beforeEach(() => {
    account.set({ id: 'admin-a', role: 'ADMIN' });
    serverAuthenticated.set(true);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { account, serverAuthenticated } },
      ],
    });
    api = TestBed.inject(AdminDashboardAPI);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
    http.expectOne('/data/admin/summary?month=' + api.currentMonth()).flush(report);
  });
  afterEach(() => http.verify());
  it('requests a month with credentials and uses server operational counts', async () => {
    const pending = api.refresh('2026-10');
    const req = http.expectOne('/data/admin/summary?month=2026-10');
    expect(req.request.withCredentials).toBe(true);
    req.flush({ ...report, month: '2026-10' });
    await pending;
    expect(api.summary()?.rooms.byStatus['RENTED']).toBe(1);
    expect(api.summary()?.pendingDeposits).toBe(1);
    expect(api.summary()?.today.checkedIn).toBe(1);
  });
  it('clears rejected reads and shows a shared connection error', async () => {
    const pending = api.refresh('2026-10');
    http.expectOne('/data/admin/summary?month=2026-10').error(new ProgressEvent('error'));
    await pending;
    expect(api.summary()).toBeNull();
    expect(api.error()).toBe('Không kết nối được máy chủ. Vui lòng thử lại.');
  });
  it('hides previous administrator data and ignores a late response after account change', async () => {
    const pending = api.refresh('2026-10');
    account.set({ id: 'admin-b', role: 'ADMIN' });
    expect(api.summary()).toBeNull();
    http.expectOne('/data/admin/summary?month=2026-10').flush(report);
    await pending;
    expect(api.summary()).toBeNull();
  });
});
