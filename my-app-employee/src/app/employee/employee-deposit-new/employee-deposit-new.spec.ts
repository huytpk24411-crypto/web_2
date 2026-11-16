import { EmployeeDepositNewComponent } from './employee-deposit-new';
import { employeeHttpTest, flushEmployeeReads } from '../employee-http-testing';
import { API_HOLD } from '../../testing/api-fixtures';
import { DepositDocumentService } from '../../services/deposit-document-service';
import { DepositDraft } from '../../classes/DepositSheet';
import { Room } from '../../classes/Room';
import { WritableSignal } from '@angular/core';

const ROOM: Room = {
  id: API_HOLD.roomId,
  code: 'P-01',
  name: 'Phòng kiểm thử',
  propertyId: 'building-a',
  propertyName: 'Tòa kiểm thử A',
  floor: '1',
  number: '01',
  address: 'Địa chỉ phòng kiểm thử',
  district: '',
  price: 3000000,
  deposit: 3000000,
  area: 20,
  capacity: 2,
  type: 'STUDIO',
  status: 'AVAILABLE',
  publicationStatus: 'PUBLISHED',
  images: [],
  featured: false,
  hasHistory: false,
  amenities: [],
  description: '',
};
const DRAFT: DepositDraft = {
  id: 'nhap-test',
  employeeId: 'employee-a',
  data: {
    phone: '0901234567',
    customerName: 'Khách kiểm thử',
    propertyId: ROOM.propertyId,
    floor: '1',
    roomId: ROOM.id,
    total: 3000000,
    duration: 6,
    startDate: '2099-01-01',
    collectedMethod: 'CASH',
    note: 'Ghi chú kiểm thử',
  },
  label: {
    customerName: 'Khách kiểm thử',
    phone: '0901234567',
    roomCode: ROOM.code,
    roomName: ROOM.name,
  },
  createdAt: '2026-11-16T01:00:00Z',
  updatedAt: '2026-11-16T01:00:00Z',
};
const CUSTOMER_IDENTITY = {
  idNumber: '012345678901',
  issuedOn: '2020-01-01',
  issuedBy: 'Cục Cảnh sát QLHC về TTXH',
  permanentAddress: '12 Võ Văn Ngân, Thủ Đức',
  frontImageUrl: '/uploads/cccd/profile-front.png',
  backImageUrl: '/uploads/cccd/profile-back.png',
};

describe('EmployeeDepositNewComponent with HTTP data', () => {
  beforeEach(() => {
    vi.spyOn(DepositDocumentService.prototype, 'listDrafts').mockResolvedValue({ items: [] });
  });
  afterEach(() => vi.restoreAllMocks());
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
    'submits A6 with collectedMethod %s, draftId and note, then opens the receipt',
    async (collectedMethod) => {
      const { fixture, http } = await employeeHttpTest(EmployeeDepositNewComponent);
      const component = fixture.componentInstance;
      (component.rooms.publishedRooms as WritableSignal<Room[]>).set([ROOM]);
      vi.spyOn(component.rooms, 'get').mockImplementation((id) =>
        id === ROOM.id ? ROOM : undefined,
      );
      component.activeDraftId.set(DRAFT.id);
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
        draftId: DRAFT.id,
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
      expect(navigate).toHaveBeenCalledWith(['/employee/deposits', 'deposit-a', 'receipt']);
      expect(component.activeDraftId()).toBe('');
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

  it('requires complete identity data before creating a deposit', async () => {
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

  it('allows manual entry for a new customer and preserves it when phone and room are selected', async () => {
    const { fixture, http } = await employeeHttpTest(EmployeeDepositNewComponent);
    const c = fixture.componentInstance;
    for (const name of ['customerName', 'idNumber', 'issuedOn', 'issuedBy', 'permanentAddress']) {
      const input = fixture.nativeElement.querySelector(
        `input[formControlName="${name}"]`,
      ) as HTMLInputElement;
      expect(input.readOnly).toBe(false);
      expect(input.matches(':disabled')).toBe(false);
    }
    expect(fixture.nativeElement.querySelector('.identity-card button').disabled).toBe(false);
    c.form.controls.customerName.setValue('Khách tại văn phòng');
    c.identityForm.setValue(CUSTOMER_IDENTITY);
    c.form.patchValue({ phone: '0901234567', roomId: ROOM.id });
    expect(c.identityForm.getRawValue()).toEqual(CUSTOMER_IDENTITY);
    const save = c.saveIdentity();
    const request = http.expectOne('/data/customers/deposit-profile');
    expect(request.request.body).toEqual({
      ...CUSTOMER_IDENTITY,
      customerName: 'Khách tại văn phòng',
      customerPhone: '0901234567',
      roomId: ROOM.id,
    });
    request.flush(
      JSON.stringify({
        id: 'walk-in-customer',
        fullName: 'Khách tại văn phòng',
        phone: '0901234567',
      }),
    );
    expect(await save).toBe(true);
    expect(c.customer()?.id).toBe('walk-in-customer');
    expect(c.identityReady()).toBe(true);
    http.verify();
    fixture.destroy();
  });

  it('keeps manually entered details when phone lookup finds no existing customer', async () => {
    const { fixture, http } = await employeeHttpTest(EmployeeDepositNewComponent);
    const c = fixture.componentInstance;
    c.form.patchValue({ customerName: 'Khách mới', phone: '0901234567', roomId: ROOM.id });
    c.identityForm.setValue(CUSTOMER_IDENTITY);
    const load = c.loadCustomer();
    http.expectOne('/data/customers/identity-context').flush('null');
    await load;
    expect(c.customer()).toBeNull();
    expect(c.form.controls.customerName.value).toBe('Khách mới');
    expect(c.identityForm.getRawValue()).toEqual(CUSTOMER_IDENTITY);
    expect(c.customerMessage()).toContain('khách mới');
    expect(c.error).toBe('');
    http.verify();
    fixture.destroy();
  });

  it('saves edited name and identity for a customer loaded by phone', async () => {
    const { fixture, http } = await employeeHttpTest(EmployeeDepositNewComponent);
    const c = fixture.componentInstance;
    c.form.patchValue({ phone: '0901234567', roomId: ROOM.id });
    const load = c.loadCustomer();
    http.expectOne('/data/customers/identity-context').flush(
      JSON.stringify({
        id: 'existing-customer',
        fullName: 'Tên trước khi sửa',
        phone: '0901234567',
        permanentAddress: CUSTOMER_IDENTITY.permanentAddress,
        identity: {
          number: CUSTOMER_IDENTITY.idNumber,
          issuedDate: CUSTOMER_IDENTITY.issuedOn,
          issuedPlace: CUSTOMER_IDENTITY.issuedBy,
          frontImage: CUSTOMER_IDENTITY.frontImageUrl,
          backImage: CUSTOMER_IDENTITY.backImageUrl,
        },
      }),
    );
    await flushEmployeeReads(http);
    await load;
    expect(c.identityReady()).toBe(true);
    c.form.controls.customerName.setValue('Họ tên đã chỉnh sửa');
    c.identityForm.controls.permanentAddress.setValue('34 Võ Văn Ngân, Thủ Đức');
    expect(c.identityReady()).toBe(false);
    const save = c.saveIdentity();
    const request = http.expectOne('/data/customers/deposit-profile');
    expect(request.request.body.customerName).toBe('Họ tên đã chỉnh sửa');
    expect(request.request.body.permanentAddress).toBe('34 Võ Văn Ngân, Thủ Đức');
    request.flush(
      JSON.stringify({
        id: 'existing-customer',
        fullName: 'Họ tên đã chỉnh sửa',
        phone: '0901234567',
      }),
    );
    expect(await save).toBe(true);
    expect(c.customer()?.id).toBe('existing-customer');
    expect(c.customer()?.fullName).toBe('Họ tên đã chỉnh sửa');
    http.verify();
    fixture.destroy();
  });

  it('filters rooms by building regardless of floor and fills the selection from a paid hold', async () => {
    const { fixture, http } = await employeeHttpTest(EmployeeDepositNewComponent);
    const c = fixture.componentInstance;
    const second = { ...ROOM, id: 'room-2', code: 'P-02', floor: undefined };
    const third = {
      ...ROOM,
      id: 'room-3',
      propertyId: 'building-b',
      propertyName: 'Tòa kiểm thử B',
    };
    const held = { ...ROOM, status: 'HELD' as const };
    (c.rooms.publishedRooms as WritableSignal<Room[]>).set([second, third]);
    vi.spyOn(c.rooms, 'get').mockImplementation((id) =>
      [held, second, third].find((r) => r.id === id),
    );
    const refresh = c.deposits.money.refresh();
    await flushEmployeeReads(http, { '/data/holds/creditable': [API_HOLD] });
    await refresh;
    c.form.controls.propertyId.setValue('building-a');
    c.selectProperty();
    expect(c.filteredRooms().map((r) => r.id)).toEqual(['room-2', ROOM.id]);
    c.form.controls.roomId.setValue('room-2');
    c.form.controls.propertyId.setValue('building-b');
    c.selectProperty();
    expect(c.form.controls.roomId.value).toBe('');
    c.form.controls.bookingId.setValue(API_HOLD.id);
    c.selectBooking();
    expect(c.form.getRawValue()).toMatchObject({
      propertyId: 'building-a',
      roomId: ROOM.id,
      phone: API_HOLD.contact.phone,
    });
    expect(c.filteredRooms().map((r) => r.id)).toEqual(['room-2', ROOM.id]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('select[formControlName="floor"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('select[formControlName="roomId"]').value).toBe(
      ROOM.id,
    );
    http.verify();
    fixture.destroy();
  });

  it('saves all entered draft fields with POST, then updates the opened draft with PUT', async () => {
    const { fixture, http } = await employeeHttpTest(EmployeeDepositNewComponent);
    const c = fixture.componentInstance;
    c.form.patchValue({ phone: '0901234567' });
    expect(c.form.invalid).toBe(true);
    const save = c.saveDraft();
    const post = http.expectOne('/data/me/deposit-drafts');
    expect(post.request.method).toBe('POST');
    expect(Object.keys(post.request.body.data).sort()).toEqual(
      [
        'bookingId',
        'customerName',
        'phone',
        'propertyId',
        'roomId',
        'total',
        'duration',
        'startDate',
        'collectedMethod',
        'note',
        'idNumber',
        'issuedOn',
        'issuedBy',
        'permanentAddress',
        'frontImageUrl',
        'backImageUrl',
      ].sort(),
    );
    post.flush(DRAFT);
    await save;
    expect(c.activeDraftId()).toBe(DRAFT.id);
    expect(c.draftMessage()).toContain('Đã lưu nháp lúc');
    c.openDraft(DRAFT);
    c.form.controls.note.setValue('Nháp đã sửa');
    const update = c.saveDraft();
    const put = http.expectOne('/data/me/deposit-drafts/' + DRAFT.id);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body.data.note).toBe('Nháp đã sửa');
    put.flush({ ...DRAFT, data: put.request.body.data });
    await update;
    expect(c.drafts()).toHaveLength(1);
    http.verify();
    fixture.destroy();
  });

  it('restores draft fields, resets confirmation and identity, and does not load CCCD automatically', async () => {
    const { fixture, http } = await employeeHttpTest(EmployeeDepositNewComponent);
    const c = fixture.componentInstance;
    c.identityReady.set(true);
    c.form.controls.terms.setValue(true);
    c.identityForm.controls.idNumber.setValue('012345678901');
    c.openDraft(DRAFT);
    const { floor, ...savedFields } = DRAFT.data;
    expect(c.form.getRawValue()).toMatchObject({ ...savedFields, terms: false });
    expect(c.form.getRawValue()).not.toHaveProperty('floor');
    expect(c.identityReady()).toBe(false);
    expect(c.customer()).toBeNull();
    expect(c.identityForm.controls.idNumber.value).toBe('');
    expect(c.activeDraftId()).toBe(DRAFT.id);
    http.expectNone('/data/customers/identity-context');
    http.verify();
    fixture.destroy();
  });

  it('can save a separate new draft while another draft is open', async () => {
    const { fixture, http } = await employeeHttpTest(EmployeeDepositNewComponent);
    const c = fixture.componentInstance;
    c.drafts.set([DRAFT]);
    c.openDraft(DRAFT);
    c.form.controls.phone.setValue('0907654321');
    const save = c.saveDraft(true);
    const req = http.expectOne('/data/me/deposit-drafts');
    expect(req.request.method).toBe('POST');
    req.flush({ ...DRAFT, id: 'nhap-second', data: req.request.body.data });
    await save;
    expect(c.drafts().map((draft) => draft.id)).toEqual(['nhap-second', DRAFT.id]);
    expect(c.activeDraftId()).toBe('nhap-second');
    http.verify();
    fixture.destroy();
  });

  it('allows a cleared numeric input in an incomplete draft without sending null to B1', async () => {
    const { fixture, http } = await employeeHttpTest(EmployeeDepositNewComponent);
    const c = fixture.componentInstance;
    c.form.controls.phone.setValue('0901234567');
    const input = fixture.nativeElement.querySelector(
      'input[formControlName="total"]',
    ) as HTMLInputElement;
    input.value = '';
    input.dispatchEvent(new Event('input'));
    const save = c.saveDraft();
    const req = http.expectOne('/data/me/deposit-drafts');
    expect(req.request.body.data.total).toBeUndefined();
    expect(Object.values(req.request.body.data)).not.toContain(null);
    req.flush(DRAFT);
    await save;
    expect(c.draftError()).toBe('');
    http.verify();
    fixture.destroy();
  });

  it('requires entered information, confirms deletion, and clears the active draft after DELETE', async () => {
    const { fixture, http } = await employeeHttpTest(EmployeeDepositNewComponent);
    const c = fixture.componentInstance;
    await c.saveDraft();
    http.expectNone((r) => r.method === 'POST');
    expect(c.draftError()).toContain('ít nhất');
    c.drafts.set([DRAFT]);
    c.openDraft(DRAFT);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await c.deleteDraft(DRAFT);
    http.expectNone((r) => r.method === 'DELETE');
    confirm.mockReturnValue(true);
    const remove = c.deleteDraft(DRAFT);
    const req = http.expectOne('/data/me/deposit-drafts/' + DRAFT.id);
    expect(req.request.method).toBe('DELETE');
    req.flush({ ok: true });
    await remove;
    expect(c.drafts()).toEqual([]);
    expect(c.activeDraftId()).toBe('');
    http.verify();
    fixture.destroy();
  });

  it('restores identity and upload references from a draft without marking the customer verified', async () => {
    const { fixture, http } = await employeeHttpTest(EmployeeDepositNewComponent);
    const c = fixture.componentInstance;
    const identity = {
      idNumber: '012345678901',
      issuedOn: '2020-01-02',
      issuedBy: 'Cơ quan cấp',
      permanentAddress: 'Địa chỉ đã nhập',
      frontImageUrl: '/uploads/cccd/front.png',
      backImageUrl: '/uploads/cccd/back.png',
    };
    c.openDraft({ ...DRAFT, data: { ...DRAFT.data, ...identity } });
    expect(c.identityForm.getRawValue()).toEqual(identity);
    expect(c.identityReady()).toBe(false);
    c.identityForm.controls.permanentAddress.setValue('Địa chỉ sửa trong nháp');
    const save = c.saveDraft();
    const request = http.expectOne('/data/me/deposit-drafts/' + DRAFT.id);
    expect(request.request.body.data).toMatchObject({
      ...identity,
      permanentAddress: 'Địa chỉ sửa trong nháp',
    });
    request.flush({ ...DRAFT, data: request.request.body.data });
    await save;
    http.verify();
    fixture.destroy();
  });

  it('keeps a failed draft save available to retry and maps DRAFT_LIMIT', async () => {
    const { fixture, http } = await employeeHttpTest(EmployeeDepositNewComponent);
    const c = fixture.componentInstance;
    c.openDraft(DRAFT);
    const save = c.saveDraft();
    http
      .expectOne('/data/me/deposit-drafts/' + DRAFT.id)
      .flush({ code: 'DRAFT_LIMIT' }, { status: 409, statusText: 'Conflict' });
    await save;
    expect(c.activeDraftId()).toBe(DRAFT.id);
    expect(c.draftError()).toBe('Bạn đã có 20 nháp. Hãy xóa bớt nháp cũ.');
    expect(c.draftBusy()).toBe(false);
    http.verify();
    fixture.destroy();
  });

  it('previews the shared A4 sheet using current form values and amount words', async () => {
    const { fixture, http } = await employeeHttpTest(EmployeeDepositNewComponent);
    const c = fixture.componentInstance;
    c.form.patchValue({
      customerName: 'Khách xem trước',
      total: 4300000,
      startDate: '2099-01-31',
      duration: 1,
    });
    c.previewOpen.set(true);
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(dialog.querySelector('app-deposit-sheet').textContent).toContain('Khách xem trước');
    expect(dialog.textContent).toContain('Bốn triệu ba trăm nghìn đồng chẵn');
    expect(dialog.textContent).toContain('Chưa cấp');
    expect(c.endDate()).toBe('2099-02-28');
    dialog.querySelector('button').click();
    fixture.detectChanges();
    expect(c.previewOpen()).toBe(false);
    http.verify();
    fixture.destroy();
  });
});
