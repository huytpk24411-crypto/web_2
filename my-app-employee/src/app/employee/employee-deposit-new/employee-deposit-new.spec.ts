import { EmployeeDepositNewComponent } from './employee-deposit-new';
import { employeeHttpTest, flushEmployeeReads } from '../employee-http-testing';
import { API_HOLD } from '../../testing/api-fixtures';

describe('EmployeeDepositNewComponent with HTTP data', () => {
  it('keeps hold options stable across renders and refreshes without writing to the form', async () => {
    const { fixture, http } = await employeeHttpTest(EmployeeDepositNewComponent);
    const component = fixture.componentInstance;
    const refresh = component.deposits.money.refresh();
    await flushEmployeeReads(http, { '/data/holds/creditable': [API_HOLD] });
    await refresh;
    component.form.patchValue({ bookingId: API_HOLD.id, total: 1800000 });
    component.selectBooking();
    fixture.detectChanges();
    await fixture.whenStable();
    const select = fixture.nativeElement.querySelector(
      'select[formControlName="bookingId"]',
    ) as HTMLSelectElement;
    const option = select.options[1];
    const formValue = component.form.getRawValue();
    const changed = vi.fn();
    const subscription = component.form.valueChanges.subscribe(changed);
    for (let i = 0; i < 3; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
      expect(select.options[1]).toBe(option);
      expect(select.value).toBe(API_HOLD.id);
    }
    const reload = component.deposits.money.refresh();
    await flushEmployeeReads(http, { '/data/holds/creditable': [{ ...API_HOLD }] });
    await reload;
    fixture.detectChanges();
    await fixture.whenStable();
    expect(select.options[1]).toBe(option);
    expect(component.form.getRawValue()).toEqual(formValue);
    expect(changed).not.toHaveBeenCalled();
    expect(component.due()).toBe(800000);
    subscription.unsubscribe();
    http.verify();
    fixture.destroy();
  });
  it('computes the read-only collected amount from total minus matching hold credit', async () => {
    const { fixture, http } = await employeeHttpTest(EmployeeDepositNewComponent);
    const component = fixture.componentInstance;
    const refresh = component.deposits.money.refresh();
    await flushEmployeeReads(http, { '/data/holds/creditable': [API_HOLD] });
    await refresh;
    component.form.patchValue({ bookingId: API_HOLD.id, total: 1800000 });
    component.selectBooking();
    fixture.detectChanges();
    expect(component.credit()).toBe(1000000);
    expect(component.due()).toBe(800000);
    const amount = fixture.nativeElement.querySelector('.summary-amount');
    expect(amount.textContent).toContain('Số tiền đã thu');
    expect(amount.querySelector('input')).toBeNull();
    expect(amount.querySelector('h2').textContent.replace(/\D/g, '')).toBe('800000');
    component.form.controls.total.setValue(2500000);
    fixture.detectChanges();
    expect(amount.querySelector('h2').textContent.replace(/\D/g, '')).toBe('1500000');
    component.form.controls.bookingId.setValue('');
    expect(component.due()).toBe(2500000);
    component.form.patchValue({ bookingId: API_HOLD.id, phone: '0900000000' });
    expect(component.credit()).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('Công ty 50% · Chủ nhà 50%');
    expect(fixture.nativeElement.textContent).toContain(
      'Bạn tự chịu trách nhiệm biên lai thu tiền với khách hàng.',
    );
    expect(fixture.nativeElement.textContent).not.toContain('Thanh toán chờ đối soát');
    http.expectNone((r) => r.method === 'POST');
    http.verify();
    fixture.destroy();
  });
  it.each(['CASH', 'BANK_TRANSFER'] as const)(
    'submits A6 with collectedMethod %s and note, then opens the deal',
    async (collectedMethod) => {
      const { fixture, http } = await employeeHttpTest(EmployeeDepositNewComponent);
      const component = fixture.componentInstance;
      const navigate = vi.spyOn(component.router, 'navigate').mockResolvedValue(true);
      component.form.patchValue({
        bookingId: API_HOLD.id,
        roomId: API_HOLD.roomId,
        phone: API_HOLD.contact.phone,
        total: 1800000,
        collectedMethod,
        note: '  Đã thu trực tiếp từ khách  ',
        startDate: '2099-01-01',
        terms: true,
      });
      const load = component.loadCustomer();
      http.expectOne('/data/customers/identity-context').flush(
        JSON.stringify({
          id: API_HOLD.customerId,
          fullName: API_HOLD.contact.name,
          phone: API_HOLD.contact.phone,
          permanentAddress: 'Địa chỉ thường trú',
          identity: {
            number: '012345678901',
            issuedDate: '2020-01-01',
            issuedPlace: 'Cơ quan cấp',
            frontImage: '/uploads/cccd/front.jpg',
            backImage: '/uploads/cccd/back.jpg',
          },
        }),
      );
      await flushEmployeeReads(http, { '/data/holds/creditable': [API_HOLD] });
      await load;
      const submit = component.submit();
      const req = http.expectOne('/data/deposits');
      expect(req.request.body).toEqual({
        roomId: API_HOLD.roomId,
        customerPhone: API_HOLD.contact.phone,
        customerId: API_HOLD.customerId,
        holdId: API_HOLD.id,
        totalRequired: 1800000,
        collectedMethod,
        note: 'Đã thu trực tiếp từ khách',
        proposedLease: { months: 12, startDate: '2099-01-01' },
      });
      req.flush(
        JSON.stringify({
          id: 'deposit-a',
          roomId: API_HOLD.roomId,
          customerId: API_HOLD.customerId,
          employeeId: 'employee-a',
          totalRequired: 1800000,
          holdCredit: 1000000,
          amountDue: 800000,
          status: 'PAID',
          collected: { method: collectedMethod, amount: 800000 },
        }),
      );
      await flushEmployeeReads(http);
      await submit;
      expect(navigate).toHaveBeenCalledWith(['/employee/deals', 'deposit-a']);
      http.expectNone((r) => r.method === 'POST');
      http.verify();
      fixture.destroy();
    },
  );
  it('renders an empty API response without inventing business records', async () => {
    const { fixture, http } = await employeeHttpTest(EmployeeDepositNewComponent);
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.children.length).toBeGreaterThan(0);
    http.verify();
    fixture.destroy();
  });

  it('requires saved identity data before creating a deposit', async () => {
    const { fixture, http } = await employeeHttpTest(EmployeeDepositNewComponent);
    fixture.componentInstance.form.patchValue({
      customerName: 'Khách A',
      phone: '0901234567',
      roomId: 'room-a',
      total: 2000000,
      startDate: '2099-01-01',
      terms: true,
    });
    await fixture.componentInstance.submit();
    expect(fixture.componentInstance.error).toContain('CCCD');
    http.expectNone((r) => r.method === 'POST');
    http.verify();
    fixture.destroy();
  });
});
