import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthService } from '../../services/auth-service';
import { PayrollAPIService } from '../../services/payroll-apiservice';
import { AdminReportsComponent } from './admin-reports';

describe('Admin live operational reports', () => {
  let component: AdminReportsComponent, http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: {
            account: signal({ id: 'admin', role: 'ADMIN' }),
            serverAuthenticated: signal(true),
          },
        },
        {
          provide: PayrollAPIService,
          useValue: { currentMonth: () => '2026-11', state: () => ({ policies: [], reports: {} }) },
        },
      ],
    });
    component = TestBed.runInInjectionContext(() => new AdminReportsComponent());
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('loads current occupancy and real work locations independently of the financial month', async () => {
    component.reportMonth = '2026-08';
    const pending = component.loadOperations();
    http.expectOne('/data/admin/reports/occupancy').flush({
      asOf: '2026-11-05T00:00:00Z',
      date: '2026-11-05',
      total: 2,
      occupancy: 50,
      byStatus: { RENTED: 1 },
      rows: [],
      depositCount: 1,
      contractCount: 1,
    });
    http.expectOne('/data/admin/work-locations').flush([
      { id: 'office', name: 'Trụ sở', allowedRadiusM: 125 },
      { id: 'closed', active: false },
    ]);
    await pending;
    expect(component.occupancy()?.date).toBe('2026-11-05');
    expect(component.locations()[0].allowedRadiusM).toBe(125);
    expect(component.isActive(component.locations()[0])).toBe(true);
    expect(component.isActive(component.locations()[1])).toBe(false);
  });
  it('keeps reports empty on an API failure and exposes the common error', async () => {
    const pending = component.loadOperations();
    http.expectOne('/data/admin/reports/occupancy').error(new ProgressEvent('error'));
    http.expectOne('/data/admin/work-locations').flush([]);
    await pending;
    expect(component.occupancy()).toBeNull();
    expect(component.locations()).toEqual([]);
    expect(component.error()).toBe('Không kết nối được máy chủ. Vui lòng thử lại.');
  });
});
