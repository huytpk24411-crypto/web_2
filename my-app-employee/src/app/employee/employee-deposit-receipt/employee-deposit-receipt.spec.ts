import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { EmployeeModule } from '../employee-module';
import { AuthService } from '../../services/auth-service';
import { DepositSheet } from '../../classes/DepositSheet';
import { EmployeeDepositReceiptComponent } from './employee-deposit-receipt';

const SHEET: DepositSheet = {
  company: {
    name: 'Công ty cấp từ API',
    taxCode: 'MST-API',
    address: 'Địa chỉ công ty từ API',
    hotline: '19001080',
  },
  deposit: {
    id: 'deposit-test',
    number: 'PC-TEST',
    status: 'PAID',
    statusLabel: 'Đã thu cọc',
    createdAt: '2026-11-16T02:30:00Z',
    totalRequired: 4300000,
    holdCredit: 1000000,
    amountDue: 3300000,
    collected: {
      method: 'CASH',
      amount: 3300000,
      note: 'Ghi chú từ API',
      at: '2026-11-16T02:30:00Z',
    },
    proposedLease: {
      months: 12,
      startDate: '2026-12-01',
      endDate: '2027-12-01',
      monthlyRent: 4300000,
    },
  },
  hold: { number: 'GC-TEST' },
  customer: {
    fullName: 'Khách từ API',
    phone: '0901234567',
    identity: { number: '012345678901', issuedDate: '2020-01-02', issuedPlace: 'Nơi cấp từ API' },
    permanentAddress: 'Thường trú từ API',
  },
  employee: { fullName: 'Nhân viên từ API', employeeCode: 'NV-API' },
  room: {
    code: 'P-API',
    name: 'Phòng từ API',
    propertyName: 'Tòa từ API',
    floor: '3',
    address: 'Địa chỉ phòng từ API',
    type: 'STUDIO',
    monthlyRent: 4300000,
    electricityPrice: 4000,
    waterPrice: 100000,
    fees: [{ name: 'Phí vệ sinh', amount: 50000 }],
  },
  contract: null,
};

async function setup() {
  await TestBed.configureTestingModule({
    imports: [EmployeeModule],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: AuthService,
        useValue: {
          account: signal({ id: 'employee-account', role: 'EMPLOYEE' }),
          serverAuthenticated: signal(true),
        },
      },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: convertToParamMap({ id: SHEET.deposit.id }) },
          params: of({ id: SHEET.deposit.id }),
        },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(EmployeeDepositReceiptComponent);
  const http = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, http };
}

describe('EmployeeDepositReceiptComponent (B2)', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each(['CASH', 'BANK_TRANSFER'] as const)(
    'renders B2, empty signature spaces and actions for %s',
    async (method) => {
      const { fixture, http } = await setup();
      http.expectOne('/data/deposits/deposit-test/sheet').flush({
        ...SHEET,
        deposit: { ...SHEET.deposit, collected: { ...SHEET.deposit.collected, method } },
      });
      await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const paper = root.querySelector('.deposit-a4')!;
      for (const text of [
        SHEET.company!.name,
        SHEET.company!.taxCode,
        SHEET.company!.address,
        SHEET.company!.hotline,
        SHEET.customer.fullName,
        SHEET.customer.identity!.number,
        SHEET.customer.identity!.issuedPlace,
        SHEET.customer.permanentAddress,
        SHEET.employee.employeeCode,
        SHEET.room.address,
        'Phí vệ sinh',
        '01/12/2026',
        '01/12/2027',
        '02/01/2020',
        'Ba triệu ba trăm nghìn đồng chẵn',
        method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản',
        'Ghi chú từ API',
      ]) {
        expect(paper.textContent).toContain(text);
      }
      expect(paper.textContent?.replace(/\D/g, '')).toContain('3300000');
      const terms = paper.querySelectorAll('.sheet-terms li');
      expect(Array.from(terms).map((li) => li.textContent?.trim())).toEqual([
        'Bên A nhận tiền cọc để giữ phòng nêu trên cho Bên B đến ngày bắt đầu thuê.',
        'Nếu Bên B không ký hợp đồng thuê hoặc không dọn vào ở theo thỏa thuận, Bên B mất toàn bộ số tiền đã đặt cọc.',
        'Khi hai bên ký hợp đồng thuê, số tiền cọc chuyển thành tiền đảm bảo của hợp đồng thuê.',
      ]);
      const signatures = paper.querySelectorAll('.signature-space');
      expect(signatures).toHaveLength(2);
      signatures.forEach((space) => {
        expect(space.textContent?.trim()).toBe('');
        expect(space.children).toHaveLength(0);
      });
      expect(paper.querySelector('img, svg, canvas')).toBeNull();
      const contract = root.querySelector('a.contract-link')!;
      expect(contract.textContent).toContain('Lập hợp đồng');
      expect(contract.getAttribute('href')).toBe('/employee/deals/deposit-test');
      expect(root.querySelector('a[href="/employee/deposits/new"]')).toBeTruthy();
      expect(root.textContent).toContain('Tạo đơn cọc mới');
      const print = vi.spyOn(window, 'print').mockImplementation(() => {});
      const buttons = Array.from(root.querySelectorAll('button'));
      buttons.find((button) => button.textContent?.trim() === 'Tải PDF')!.click();
      buttons.find((button) => button.textContent?.trim() === 'In')!.click();
      expect(print).toHaveBeenCalledTimes(2);
      expect(root.textContent).toContain('Lưu dưới dạng PDF');
      http.verify();
      fixture.destroy();
    },
  );

  it('replaces Lập hợp đồng with Xem giao dịch when B2 includes a contract', async () => {
    const { fixture, http } = await setup();
    http
      .expectOne('/data/deposits/deposit-test/sheet')
      .flush({ ...SHEET, contract: { id: 'contract-test', number: 'HD-TEST', status: 'DRAFT' } });
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.contract-link').textContent).toContain(
      'Xem giao dịch',
    );
    expect(fixture.nativeElement.querySelector('.contract-link').textContent).not.toContain(
      'Lập hợp đồng',
    );
    http.verify();
    fixture.destroy();
  });

  it('shows a read error without a printable sheet and supports retry', async () => {
    const { fixture, http } = await setup();
    http
      .expectOne('/data/deposits/deposit-test/sheet')
      .flush({ code: 'NOT_YOUR_RECORD' }, { status: 403, statusText: 'Forbidden' });
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Bạn không có quyền',
    );
    expect(fixture.nativeElement.querySelector('app-deposit-sheet')).toBeNull();
    const retry = fixture.componentInstance.load();
    http.expectOne('/data/deposits/deposit-test/sheet').flush(SHEET);
    await retry;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-deposit-sheet')).toBeTruthy();
    http.verify();
    fixture.destroy();
  });
});
