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
          useValue: {
            currentMonth: () => '2026-11',
            state: () => ({ policies: [], reports: {} }),
            write: vi.fn().mockResolvedValue({}),
          },
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
  function latePolicy() {
    component.policyType = 'PHAT_TRE';
    component.policyName = 'Phiên bản phạt đi trễ';
    component.policyFrom = '2026-11-19T08:00';
    component.policyLevels = [
      { from: 1, to: 2, amount: 20000, rateBps: null },
      { from: 2, to: 3, amount: 50000, rateBps: null },
      { from: 3, to: 5, amount: 100000, rateBps: null },
    ];
    return TestBed.inject(PayrollAPIService).write;
  }
  it.each([1, 0])(
    'identifies the invalid first range and prevents a write when upper bound is %s',
    async (to) => {
      const write = latePolicy();
      component.policyLevels[0].to = to;
      await component.savePolicy();
      expect(component.policyError()).toContain('Mức 1: mốc trên phải lớn hơn mốc dưới');
      expect(write).not.toHaveBeenCalled();
    },
  );
  it('accepts touching ranges, preserves the final unlimited bound and sends Vietnam dates', async () => {
    const write = latePolicy();
    component.policyLevels[2].to = null;
    await component.savePolicy();
    expect(component.policyError()).toBe('');
    expect(write).toHaveBeenCalledWith(
      'admin/policies',
      expect.objectContaining({
        type: 'PHAT_TRE',
        effectiveFrom: '2026-11-19T01:00:00.000Z',
        effectiveTo: null,
        levels: component.policyLevels,
      }),
    );
    expect(component.toast()).toContain('phiên bản nháp');
  });
  it('prevents overlapping ranges without changing entered values', async () => {
    const write = latePolicy();
    component.policyLevels[1].from = 1;
    await component.savePolicy();
    expect(component.policyError()).toContain('Mức 2 chồng khoảng với mức 1');
    expect(component.policyLevels[1].from).toBe(1);
    expect(write).not.toHaveBeenCalled();
  });
  it('continues the next level from the preceding upper bound', () => {
    latePolicy();
    component.addPolicyLevel();
    expect(component.policyLevels.at(-1)).toEqual({ from: 5, to: null, amount: 0, rateBps: null });
  });
  it('requires an explicit final upper bound before appending and never edits it automatically', () => {
    latePolicy();
    component.policyLevels[2].to = null;
    component.addPolicyLevel();
    expect(component.policyLevels).toHaveLength(3);
    expect(component.policyLevels[2].to).toBeNull();
    expect(component.policyError()).toContain('Nhập mốc trên');
  });
  it('keeps the hold policy at a single level', () => {
    component.policyType = 'GIU_CHO';
    component.changePolicyType();
    component.addPolicyLevel();
    expect(component.policyLevels).toHaveLength(1);
    expect(component.policyError()).toContain('một mức');
  });
  it('rejects invalid money and effective dates before sending a policy', async () => {
    const write = latePolicy();
    component.policyLevels[1].amount = -1;
    await component.savePolicy();
    expect(component.policyError()).toContain('Mức 2: số tiền');
    component.policyLevels[1].amount = 50000;
    component.policyTo = component.policyFrom;
    await component.savePolicy();
    expect(component.policyError()).toContain('Ngày hết hiệu lực phải sau');
    expect(write).not.toHaveBeenCalled();
  });
  it('starts the commission form with the five agreed BR-18 levels', () => {
    expect(component.policyLevels.map(({ from, to, rateBps }) => [from, to, rateBps])).toEqual([
      [0, 10000000, 2000],
      [10000000, 15000000, 3000],
      [15000000, 20000000, 3500],
      [20000000, 30000000, 4000],
      [30000000, null, 4500],
    ]);
  });
});
