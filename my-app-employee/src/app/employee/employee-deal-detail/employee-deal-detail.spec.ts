import { EmployeeDealDetailComponent } from './employee-deal-detail';
import { employeeHttpTest, flushEmployeeReads } from '../employee-http-testing';

describe('EmployeeDealDetailComponent with HTTP data', () => {
  it('renders an empty API response without inventing business records', async () => {
    const { fixture, http } = await employeeHttpTest(EmployeeDealDetailComponent);
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.children.length).toBeGreaterThan(0);
    http.verify();
    fixture.destroy();
  });
  it('shows the contract number and current customer contact while keeping the ID in the URL', async () => {
    const { fixture, http } = await employeeHttpTest(EmployeeDealDetailComponent);
    const pending = fixture.componentInstance.refresh();
    await flushEmployeeReads(http, {
      '/data/deposits': {
        items: [
          {
            id: 'deposit-a',
            number: 'PC-2026-A',
            customerId: 'KH-01',
            roomId: 'room-a',
            customerName: 'Tên cũ',
            phone: '',
            status: 'PAID',
            totalRequired: 2000000,
            amountDue: 2000000,
            holdCredit: 0,
          },
        ],
      },
      '/data/contracts': {
        items: [
          {
            id: 'hd-private-uuid',
            number: 'HD-2026-001',
            depositId: 'deposit-a',
            customerId: 'KH-01',
            roomId: 'room-a',
            customerName: 'Nguyễn Văn An',
            phone: '0901234567',
            status: 'DRAFT',
          },
        ],
      },
    });
    await pending;
    fixture.detectChanges();
    const card = fixture.nativeElement.querySelector('.deal-card') as HTMLAnchorElement;
    expect(card.querySelector('.contract-id')?.textContent?.trim()).toBe('HD-2026-001');
    expect(card.textContent).toContain('Nguyễn Văn An');
    expect(card.textContent).toContain('0901234567');
    expect(card.textContent).not.toContain('hd-private-uuid');
    expect(card.textContent).not.toContain('KH-01');
    expect(card.getAttribute('href')).toBe('/employee/deals/hd-private-uuid');
    expect(fixture.nativeElement.firstElementChild.tagName).toBe('HEADER');
    http.verify();
    fixture.destroy();
  });
  it.each([
    ['DRAFT', 'Nháp'],
    ['SIGNED', 'Đã ký – chờ admin xác nhận'],
    ['COMPLETED', 'Thành công'],
    ['VOID', 'Không hiệu lực – khách bỏ cọc'],
  ])('renders %s in the list and detail with only the allowed actions', async (status, label) => {
    const { fixture, http } = await employeeHttpTest(EmployeeDealDetailComponent);
    const component = fixture.componentInstance;
    component.id = 'contract-a';
    const pending = component.refresh();
    await flushEmployeeReads(http, {
      '/data/deposits': {
        items: [
          {
            id: 'deposit-a',
            number: 'PC-A',
            customerId: 'customer-a',
            roomId: 'room-a',
            status: status === 'VOID' ? 'ABANDONED' : status === 'COMPLETED' ? 'COMPLETED' : 'PAID',
            totalRequired: 2000000,
            amountDue: 2000000,
            holdCredit: 0,
          },
        ],
      },
      '/data/contracts': {
        items: [
          {
            id: 'contract-a',
            depositId: 'deposit-a',
            roomId: 'room-a',
            number: 'HD-A',
            status,
          },
        ],
      },
    });
    await pending;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.deal-card').textContent).toContain(label);
    expect(fixture.nativeElement.querySelector('.dossier').textContent).toContain(label);
    const actions = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
      (button: unknown) => (button as HTMLButtonElement).textContent?.trim(),
    );
    expect(actions.includes('Đã ký')).toBe(status === 'DRAFT');
    expect(
      actions.some((text) => /Hoàn tất hợp đồng|bỏ cọc|Hủy hồ sơ cọc|thu tiền/.test(text || '')),
    ).toBe(false);
    expect(
      fixture.nativeElement.querySelectorAll('a[href*="receipt"], a[href*="forfeiture"]').length,
    ).toBe(0);
    expect(component.paidDeposits).toEqual([]);
    expect(fixture.nativeElement.querySelector('.abandonment-form')).toBeNull();
    if (status === 'VOID') {
      expect(fixture.nativeElement.querySelector('.dossier').textContent).toContain(
        'Khách bỏ cọc – hợp đồng không hiệu lực',
      );
    }
    if (status !== 'DRAFT') await component.sign();
    http.expectNone((r) => r.method === 'POST');
    http.verify();
    fixture.destroy();
  });

  it('opens contract creation directly for the new paid deposit', async () => {
    const { fixture, http } = await employeeHttpTest(EmployeeDealDetailComponent);
    const component = fixture.componentInstance;
    const pending = component.refresh();
    await flushEmployeeReads(http, {
      '/data/deposits': {
        items: [
          {
            id: 'record-a',
            number: 'PC-A',
            roomId: 'room-a',
            status: 'PAID',
            totalRequired: 2000000,
            holdCredit: 0,
            amountDue: 2000000,
            proposedLease: { startDate: '2099-01-01', months: 12, monthlyRent: 4000000 },
          },
        ],
      },
    });
    await pending;
    fixture.detectChanges();
    expect(component.contractDepositId).toBe('record-a');
    expect(component.contractStart).toBe('2099-01-01');
    expect(component.contractRent).toBe(4000000);
    expect(fixture.nativeElement.querySelector('input[name="contractStart"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.deal-card').textContent).toContain(
      'Chưa lập hợp đồng',
    );
    http.verify();
    fixture.destroy();
  });

  it('removes receipt and forfeiture routes from the employee module', async () => {
    const { fixture, http } = await employeeHttpTest(EmployeeDealDetailComponent);
    const paths = fixture.componentInstance.router.config.flatMap(
      (route) => route.children?.map((child) => child.path) || [],
    );
    expect(paths).toContain('deals/:id');
    expect(paths).toContain('deposits/new');
    expect(paths).not.toContain('deposits/:id/qr-receipt');
    expect(paths).not.toContain('deposits/:id/cash-receipt');
    expect(paths).not.toContain('deals/:id/forfeiture');
    http.verify();
    fixture.destroy();
  });
});
