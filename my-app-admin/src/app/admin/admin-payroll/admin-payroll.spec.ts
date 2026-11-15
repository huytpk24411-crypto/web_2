import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ApiPayslip } from '../../classes/PayrollApi';
import { PayrollAPIService } from '../../services/payroll-apiservice';
import { csv } from '../admin-finance-export';
import { AdminPayrollComponent } from './admin-payroll';

describe('Admin API payroll', () => {
  let component: AdminPayrollComponent, write: ReturnType<typeof vi.fn>;
  const period = {
    id: '2026-11',
    periodId: 'period-1',
    label: '11/2026',
    status: 'CLOSED',
    payout: 1234567,
    commission: 500000,
  };
  const slip = {
    id: 'slip-1',
    employeeId: 'e1',
    status: 'DRAFT',
    netPay: 1234567,
    employee: { fullName: 'Nhân viên', employeeCode: 'NV01', position: 'Tư vấn' },
    baseSalary: 1000000,
    commissionAmount: 500000,
    totalRevenue: 5000000,
    totalBonus: 0,
    totalDeductions: 265433,
    shiftCount: 5,
  } as ApiPayslip;
  const state = signal({
    periods: [{ id: 'period-1', code: '2026-11' }],
    slips: { '2026-11': [slip] },
    policies: [],
  });
  beforeEach(() => {
    state.set({
      periods: [{ id: 'period-1', code: '2026-11' }],
      slips: { '2026-11': [structuredClone(slip)] },
      policies: [],
    });
    write = vi.fn(async () => {});
    TestBed.configureTestingModule({
      providers: [
        {
          provide: PayrollAPIService,
          useValue: {
            currentMonth: () => '2026-11',
            state,
            periodView: () => period,
            write,
          },
        },
      ],
    });
    component = TestBed.runInInjectionContext(() => new AdminPayrollComponent());
  });
  it('uses authoritative payslip net amounts and the period API totals', () => {
    expect(component.periodRows).toHaveLength(1);
    expect(component.net(component.periodRows[0])).toBe(slip.netPay);
    expect(component.payout).toBe(period.payout);
  });
  it('does not approve a row locally when the API fails', async () => {
    write.mockRejectedValueOnce(new Error('Không kết nối được máy chủ. Vui lòng thử lại.'));
    component.detail(component.periodRows[0]);
    await component.approveRow();
    expect(write).toHaveBeenCalledWith('admin/payslips/slip-1/approve', {});
    expect(component.approved).toEqual([]);
    expect(component.dialog).toBe('detail');
    expect(component.toast()).toBe('');
    expect(component.actionError()).toContain('Không kết nối');
  });
  it('calculates and closes the selected period via P5, without generating session rows', async () => {
    component.dialog = 'create';
    await component.confirm();
    expect(write).toHaveBeenLastCalledWith('admin/payroll-periods/period-1/calculate', {});
    component.dialog = 'close';
    await component.confirm();
    expect(write).toHaveBeenLastCalledWith('admin/payroll-periods/period-1/close', {});
    expect(component.approved).toEqual([]);
  });
});

describe('CSV export safety', () => {
  it('quotes separators and neutralizes spreadsheet formulas including whitespace prefixes', () => {
    const output = csv([['=1+1', ' +cmd', '@sum', '-formula', 'a;"b', -100]]);
    expect(output).toBe('\uFEFF"\'=1+1";"\' +cmd";"\'@sum";"\'-formula";"a;""b";"-100"');
  });
});
