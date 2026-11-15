import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { API_ACCOUNT, API_HOLD, API_ROOMS } from '../../testing/api-fixtures';
import { HoldPayosLink, MoneyHold } from '../../classes/Money';
import { PAYOS_LOCATION } from '../../services/booking-service';
import { AuthService } from '../../services/auth-service';
import { RoomService } from '../../services/room-service';
import { CustomerModule } from '../customer-module';
import { CustomerBookingNewComponent } from './customer-booking-new';

describe('CustomerBookingNewComponent with HTTP holds', () => {
  let http: HttpTestingController;
  let hold: MoneyHold;
  let assign: ReturnType<typeof vi.fn>;
  const link: HoldPayosLink = {
    checkoutUrl: 'https://pay.payos.vn/checkout-test',
    qrCode: 'bank-qr',
    orderCode: 100001,
    amount: 725000,
    description: 'GC100001',
    expiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
  };
  beforeEach(async () => {
    assign = vi.fn();
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith('ihouzz-request-key:')) sessionStorage.removeItem(key);
    await TestBed.configureTestingModule({
      imports: [CustomerModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: PAYOS_LOCATION, useValue: { assign } },
        {
          provide: RoomService,
          useValue: {
            get: (id: string) => API_ROOMS.find((r) => r.id === id),
            rooms: () => API_ROOMS.filter((r) => r.status === 'AVAILABLE'),
            forRecord: RoomService.prototype.forRecord,
            refresh: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({ roomId: 'phong-48' }) } },
        },
      ],
    }).compileComponents();
    const auth = TestBed.inject(AuthService);
    auth.account.set(API_ACCOUNT);
    auth.serverAuthenticated.set(true);
    http = TestBed.inject(HttpTestingController);
    hold = {
      ...API_HOLD,
      status: 'PAYMENT_PENDING',
      isActive: false,
      paymentId: undefined,
      amount: 725000,
      moveIn: '2099-11-15',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
    };
  });
  afterEach(() => {
    try {
      http.verify();
    } finally {
      vi.restoreAllMocks();
      TestBed.resetTestingModule();
    }
  });
  async function request(url: string, method = 'GET'): Promise<TestRequest> {
    let result!: TestRequest;
    await vi.waitFor(() => {
      result = http.expectOne({ method, url });
    });
    return result;
  }
  async function load(holds: MoneyHold[] = []) {
    const fixture = TestBed.createComponent(CustomerBookingNewComponent);
    fixture.detectChanges();
    (await request('/data/me/holds')).flush(JSON.stringify({ items: holds }));
    if (holds.length)
      (await request('/data/me/holds/' + holds[0].id + '/payos-link', 'POST')).flush(
        JSON.stringify(link),
      );
    await vi.waitFor(() => {
      expect(fixture.componentInstance.booking.loading()).toBe(false);
      if (holds.length) expect(fixture.componentInstance.pendingId()).toBe(holds[0].id);
      expect(fixture.componentInstance.busy()).toBe(false);
    });
    await fixture.whenStable();
    return fixture;
  }
  it('shows the policy amount and payOS description after creating the pending hold', async () => {
    const fixture = await load();
    const component = fixture.componentInstance;
    expect(fixture.nativeElement.querySelectorAll('.step-strip > div').length).toBe(3);
    expect(fixture.nativeElement.querySelector('.qr-preview')).toBeNull();
    component.form.patchValue({ moveIn: '2099-11-15', terms: true });
    const submission = component.submit();
    (await request('/data/me/holds', 'POST')).flush(JSON.stringify(hold));
    (await request('/data/me/holds/' + hold.id + '/payos-link', 'POST')).flush(
      JSON.stringify(link),
    );
    await submission;
    await fixture.whenStable();
    expect(component.amount).toBe(725000);
    expect(component.canPay).toBe(true);
    expect(component.countdown).toMatch(/^1[45]:[0-5]\d$/);
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(fixture.nativeElement.querySelector('.qr-preview')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.channel').length).toBe(0);
    expect(fixture.nativeElement.querySelector('.transfer-reference').textContent).toContain(
      link.description,
    );
    expect(fixture.nativeElement.textContent).not.toMatch(/Chờ nhân viên|Mã giao dịch ngân hàng/);
  });
  it('renders a room conflict and re-enables the form after HTTP rejection', async () => {
    const fixture = await load();
    const component = fixture.componentInstance;
    component.form.patchValue({ moveIn: '2099-11-15', terms: true });
    const submission = component.submit();
    (await request('/data/me/holds', 'POST')).flush('{"code":"ROOM_LOCKED"}', {
      status: 409,
      statusText: 'Conflict',
    });
    await submission;
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Phòng vừa được khách khác giữ chỗ',
    );
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(false);
    expect(component.pendingId()).toBe('');
  });
  it('restores payment from the hold snapshot when the room is no longer public and copies the payOS description', async () => {
    const source = API_ROOMS.find((room) => room.id === hold.roomId)!;
    hold.number = 'GC-202611-0008';
    hold.roomSnapshot = {
      ...source,
      propertyName: 'Tòa lưu trữ',
      ownerId: 'owner',
      monthlyRent: source.price,
    };
    vi.spyOn(TestBed.inject(RoomService), 'get').mockReturnValue(undefined);
    vi.spyOn(TestBed.inject(RoomService), 'rooms').mockReturnValue([]);
    const fixture = await load([hold]);
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      await fixture.componentInstance.copyReference();
    } finally {
      if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
    expect(writeText).toHaveBeenCalledWith(link.description);
    expect(fixture.componentInstance.room?.code).toBe(source.code);
    expect(fixture.nativeElement.querySelector('.transfer-reference').textContent).toContain(
      link.description,
    );
    expect(fixture.nativeElement.textContent).not.toContain(hold.id);
  });
  it('calls A1 once on payment click and redirects in the same tab without confirming payment', async () => {
    const fixture = await load([hold]);
    const component = fixture.componentInstance;
    const button = fixture.nativeElement.querySelector('aside .btn.primary') as HTMLButtonElement;
    expect(button.textContent).toContain('Thanh toán qua ngân hàng (payOS)');
    button.click();
    button.click();
    const req = await request('/data/me/holds/' + hold.id + '/payos-link', 'POST');
    expect(req.request.body).toEqual({});
    expect(req.request.headers.get('Idempotency-Key')).toBeTruthy();
    req.flush(JSON.stringify(link));
    await vi.waitFor(() => expect(assign).toHaveBeenCalledExactlyOnceWith(link.checkoutUrl));
    expect(component.booking.get(hold.id)?.apiStatus).toBe('PAYMENT_PENDING');
    expect(component.booking.receipt()).toBeUndefined();
    http.expectNone('/data/me/holds/' + hold.id + '/complete-payment');
  });
  it('shows the configuration message and locks payment after A1 rejects with 503', async () => {
    const fixture = await load([hold]);
    const payment = fixture.componentInstance.pay();
    (await request('/data/me/holds/' + hold.id + '/payos-link', 'POST')).flush(
      JSON.stringify({ code: 'PAYMENT_GATEWAY_NOT_CONFIGURED' }),
      { status: 503, statusText: 'Unavailable' },
    );
    await payment;
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toBe(
      'Chưa cấu hình cổng thanh toán. Vui lòng liên hệ nhân viên.',
    );
    expect(fixture.nativeElement.querySelector('aside .btn.primary').disabled).toBe(true);
    await fixture.componentInstance.pay();
    http.expectNone((r) => r.method === 'POST');
    expect(assign).not.toHaveBeenCalled();
  });
  it('stops transfers at the deadline and reads EXPIRED from the server before starting again', async () => {
    const fixture = await load([hold]);
    const component = fixture.componentInstance;
    component.now.set(Date.parse(hold.expiresAt!));
    await fixture.whenStable();
    expect(component.countdown).toBe('00:00');
    expect(component.booking.get(hold.id)?.apiStatus).toBe('PAYMENT_PENDING');
    expect(fixture.nativeElement.querySelector('.qr-preview')).toBeNull();
    await component.pay();
    http.expectNone((r) => r.method === 'POST');
    const refresh = component.refreshPending();
    (await request('/data/me/holds')).flush(
      JSON.stringify({ items: [{ ...hold, status: 'EXPIRED' }] }),
    );
    await refresh;
    await fixture.whenStable();
    expect(component.pendingId()).toBe('');
    expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
  });
});
