import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ContractReview } from '../../classes/ContractReview';
import { AdminModule } from '../admin-module';
import { AdminApprovalsComponent } from './admin-approvals';

describe('Admin contract reviews (A8)', () => {
  let fixture: ComponentFixture<AdminApprovalsComponent>;
  let component: AdminApprovalsComponent;
  let http: HttpTestingController;
  let pending: ContractReview[];
  let done: ContractReview[];
  const dossier: ContractReview = {
    deposit: { id: 'd1', number: 'COC1', status: 'CONTRACTED' },
    contract: {
      id: 'h1',
      number: 'HD1',
      status: 'SIGNED',
      createdAt: '2026-11-09T03:00:00Z',
      signedAt: '2026-11-10T03:00:00Z',
      startDate: '2026-11-15',
      endDate: '2027-11-14',
      monthlyRent: 4000000,
      electricityPrice: 3500,
      waterPrice: 15000,
      serviceFee: 100000,
      fees: { Internet: 80000 },
    },
    room: {
      code: 'P101',
      name: 'Phòng kiểm thử',
      propertyName: 'Tòa kiểm thử',
      address: 'Địa chỉ kiểm thử',
    },
    customer: { name: 'Khách kiểm thử', phone: '0901234567', identityMasked: '********1234' },
    employee: { id: 'e1', fullName: 'Nhân viên kiểm thử', employeeCode: 'NV01' },
    owner: { name: 'Chủ nhà kiểm thử', phone: '0902345678' },
    amounts: { total: 4000000, holdCredit: 1000000, companyShare: 2000000, ownerShare: 2000000 },
    depositAt: '2026-11-09T03:00:00Z',
    daysSinceDeposit: 7,
    overdue: true,
    outcome: 'PENDING',
  };

  function rows() {
    return Array.from(fixture.nativeElement.querySelectorAll('tbody tr')) as HTMLElement[];
  }
  function button(label: string, root: HTMLElement = fixture.nativeElement): HTMLButtonElement {
    const found = Array.from(root.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === label,
    );
    if (!found) throw new Error(`Không tìm thấy nút ${label}`);
    return found;
  }
  function flushLists() {
    http.expectOne('/data/admin/contract-reviews?state=pending').flush(pending);
    http.expectOne('/data/admin/contract-reviews?state=done').flush(done);
  }
  function confirmDialog() {
    const confirm = vi.spyOn(component, 'confirm');
    button('Xác nhận', fixture.nativeElement.querySelector('[role="dialog"]')).click();
    return confirm.mock.results[0].value as Promise<void>;
  }
  async function finishWrite(saving: Promise<void>) {
    // Resolve the transport and component continuations before flushing the reload.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    flushLists();
    await saving;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    pending = [structuredClone(dossier)];
    done = [
      {
        ...structuredClone(dossier),
        deposit: { id: 'd2', status: 'COMPLETED' },
        contract: { ...dossier.contract!, number: 'HD2', status: 'COMPLETED' },
        outcome: 'SUCCESS',
        decidedBy: { fullName: 'Quản trị kiểm thử' },
        decidedAt: '2026-11-16T03:15:00Z',
        note: 'Đã nhận phòng',
      },
      {
        ...structuredClone(dossier),
        deposit: { id: 'd3', status: 'ABANDONED' },
        contract: { ...dossier.contract!, number: 'HD3', status: 'VOID' },
        outcome: 'ABANDONED',
      },
    ];
    await TestBed.configureTestingModule({
      imports: [AdminModule],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AdminApprovalsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    flushLists();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('renders two tabs, pending count and result filters without decision actions on done rows', () => {
    const tabs = fixture.nativeElement.querySelectorAll(
      '[role="tab"]',
    ) as NodeListOf<HTMLButtonElement>;
    expect(tabs).toHaveLength(2);
    expect(tabs[0].textContent).toContain('Hợp đồng chưa xác nhận (1)');
    tabs[1].click();
    fixture.detectChanges();
    expect(rows()).toHaveLength(2);
    expect(fixture.nativeElement.textContent).not.toContain('Duyệt hợp đồng');
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = 'ABANDONED';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain('HD3');
    select.value = 'SUCCESS';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(rows()[0].textContent).toContain('HD2');
  });

  it('filters locally by contract, room, customer and employee without changing the pending count', () => {
    for (const query of ['hd1', 'p101', 'Khách kiểm thử', 'Nhân viên kiểm thử', 'nv01']) {
      component.search.set(query);
      expect(component.visible()).toHaveLength(1);
    }
    component.search.set('không khớp');
    fixture.detectChanges();
    expect(rows()).toHaveLength(0);
    expect(fixture.nativeElement.textContent).toContain('Hợp đồng chưa xác nhận (1)');
    http.expectNone((r) => r.url.includes('contract-reviews'));
  });

  it('shows the overdue warning at seven days and keeps both actions available before seven days', () => {
    expect(rows()[0].querySelector('.overdue')?.textContent).toContain('Đã quá 7 ngày');
    component.pending.set([{ ...dossier, daysSinceDeposit: 2, overdue: false }]);
    fixture.detectChanges();
    expect(rows()[0].querySelector('.overdue')).toBeNull();
    expect(button('Duyệt hợp đồng').disabled).toBe(false);
    expect(button('Khách bỏ cọc').disabled).toBe(false);
  });

  it.each(['DRAFT', null] as const)(
    'disables approval with a reason for an unsigned contract (%s)',
    (status) => {
      component.pending.set([
        { ...dossier, contract: status ? { ...dossier.contract!, status } : null },
      ]);
      fixture.detectChanges();
      expect(button('Duyệt hợp đồng').disabled).toBe(true);
      expect(button('Duyệt hợp đồng').title).toBe('Hợp đồng chưa ký');
      expect(button('Khách bỏ cọc').disabled).toBe(false);
      component.open('approve', component.pending()[0]);
      expect(component.dialog()).toBeNull();
      http.expectNone((r) => r.method === 'POST');
    },
  );

  it('approves only after confirmation, calls A8 and reloads both lists', async () => {
    button('Duyệt hợp đồng').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]').textContent).toContain(
      'Xác nhận khách đã dọn vào ở?',
    );
    http.expectNone((r) => r.method === 'POST');
    const saving = confirmDialog();
    const request = http.expectOne('/data/admin/deposits/d1/approve-contract');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.headers.get('Idempotency-Key')).toBeTruthy();
    pending = [];
    request.flush({});
    await finishWrite(saving);
    expect(component.dialog()).toBeNull();
    expect(component.toast()).toBe('Đã duyệt hợp đồng.');
    expect(fixture.nativeElement.textContent).toContain('Hợp đồng chưa xác nhận (0)');
  });

  it('records abandonment only after confirmation with an optional trimmed note', async () => {
    button('Khách bỏ cọc').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]').textContent).toContain(
      'doanh thu và phần của chủ nhà vẫn giữ.',
    );
    expect(fixture.nativeElement.querySelector('textarea').maxLength).toBe(500);
    http.expectNone((r) => r.method === 'POST');
    component.note.set('  Khách không nhận phòng  ');
    const saving = confirmDialog();
    const request = http.expectOne('/data/admin/deposits/d1/abandon');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ note: 'Khách không nhận phòng' });
    request.flush({});
    await finishWrite(saving);
    expect(component.toast()).toBe('Đã ghi nhận khách bỏ cọc.');
    expect(component.dialog()).toBeNull();
  });

  it('allows an empty note, guards against duplicate submits and keeps API errors inside the dialog', async () => {
    component.open('abandon', pending[0]);
    const saving = component.confirm();
    await component.confirm();
    const request = http.expectOne('/data/admin/deposits/d1/abandon');
    expect(request.request.body).toEqual({});
    request.flush({ code: 'ALREADY_DECIDED' }, { status: 409, statusText: 'Conflict' });
    await saving;
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[role="dialog"] [role="alert"]').textContent,
    ).toContain('Hợp đồng này đã được xác nhận.');
    expect(component.dialog()).not.toBeNull();
    expect(component.toast()).toBe('');
    expect(component.busy()).toBe(false);
  });

  it('shows a stale SIGNED conflict in the approval dialog and keeps it open', async () => {
    component.open('approve', pending[0]);
    const saving = component.confirm();
    http
      .expectOne('/data/admin/deposits/d1/approve-contract')
      .flush({ code: 'CONTRACT_NOT_SIGNED' }, { status: 409, statusText: 'Conflict' });
    await saving;
    expect(component.error()).toBe('Hợp đồng chưa ký.');
    expect(component.dialog()?.type).toBe('approve');
  });

  it('cancels without a write and rejects notes over 500 characters', async () => {
    component.open('abandon', pending[0]);
    component.note.set('x'.repeat(501));
    await component.confirm();
    expect(component.error()).toContain('500');
    component.close();
    await component.confirm();
    http.expectNone((r) => r.method === 'POST');
  });

  it('renders all main detail fields, masked identity, amounts, dates and decision information', () => {
    component.tab.set('done');
    fixture.detectChanges();
    button('Xem chi tiết', rows()[0]).click();
    fixture.detectChanges();
    const detail = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    for (const expected of [
      'HD2',
      '09/11/2026',
      '10/11/2026',
      '15/11/2026',
      '14/11/2027',
      '4.000.000 đ',
      '3.500 đ',
      '15.000 đ',
      '100.000 đ',
      '80.000 đ',
      '2.000.000 đ',
      '1.000.000 đ',
      'Khách kiểm thử',
      '0901234567',
      '********1234',
      'P101',
      'Phòng kiểm thử',
      'Tòa kiểm thử',
      'Địa chỉ kiểm thử',
      'Chủ nhà kiểm thử',
      'Nhân viên kiểm thử',
      'NV01',
      '7 ngày',
      'Thành công',
      'Quản trị kiểm thử',
      '16/11/2026 10:15',
      'Đã nhận phòng',
    ]) {
      expect(detail.textContent).toContain(expected);
    }
    expect(detail.querySelectorAll('dt').length).toBeGreaterThanOrEqual(30);
  });

  it('displays unavailable reads as an error without demo records', async () => {
    const loading = component.reload();
    http.expectOne('/data/admin/contract-reviews?state=pending').error(new ProgressEvent('error'));
    http.expectOne('/data/admin/contract-reviews?state=done').flush([]);
    await loading;
    fixture.detectChanges();
    expect(component.pending()).toEqual([]);
    expect(component.done()).toEqual([]);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Không kết nối được máy chủ',
    );
  });
});
