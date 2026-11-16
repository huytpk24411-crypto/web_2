import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BookingService } from './booking-service';
import { AuthService, sessionInterceptor } from './auth-service';
import { RoomService } from './room-service';
import { API_ACCOUNT, API_HOLD, API_PAYMENT } from '../testing/api-fixtures';
import { apiMessage } from './api-message';
import { HoldPayosLink, MoneyHold } from '../classes/Money';
import { Subject } from 'rxjs';
describe('Customer P3 holds, payments and receipts', () => {
  let booking: BookingService, http: HttpTestingController, auth: AuthService;
  beforeEach(() => {
    // Only the technical keys created by this suite are removed.
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith('ihouzz-request-key:')) sessionStorage.removeItem(key);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([sessionInterceptor])),
        provideHttpClientTesting(),
        { provide: RoomService, useValue: { refresh: vi.fn().mockResolvedValue(undefined) } },
      ],
    });
    auth = TestBed.inject(AuthService);
    auth.account.set(API_ACCOUNT);
    auth.serverAuthenticated.set(true);
    booking = TestBed.inject(BookingService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });
  async function request(path: string, method = 'POST'): Promise<TestRequest> {
    let result!: TestRequest;
    await vi.waitFor(() => {
      result = http.expectOne({ method, url: path });
    });
    return result;
  }
  async function flushHolds(hold: MoneyHold = API_HOLD, payment = API_PAYMENT): Promise<void> {
    (await request('/data/me/holds', 'GET')).flush(JSON.stringify({ items: [hold] }));
    if (hold.paymentId)
      (await request('/data/payments/' + hold.paymentId, 'GET')).flush(JSON.stringify(payment));
  }
  it('creates a pending hold using the policy amount and 15-minute deadline from HTTP', async () => {
    const createdAt = '2026-11-08T02:00:00Z';
    const expiresAt = '2026-11-08T02:15:00Z';
    const pending = booking.createRequest('phong-48', API_ACCOUNT.name, API_ACCOUNT.phone!, {
      moveIn: '2026-11-15',
      note: 'Gọi trước khi đến',
    });
    const req = await request('/data/me/holds');
    expect(req.request.body).toEqual({
      roomId: 'phong-48',
      contactName: API_ACCOUNT.name,
      contactPhone: API_ACCOUNT.phone,
      moveIn: '2026-11-15',
      note: 'Gọi trước khi đến',
    });
    expect(req.request.body.amount).toBeUndefined();
    req.flush(
      JSON.stringify({
        ...API_HOLD,
        status: 'PAYMENT_PENDING',
        isActive: false,
        amount: 725000,
        paymentId: undefined,
        createdAt,
        expiresAt,
        paymentExpiresAt: expiresAt,
      }),
    );
    const hold = await pending;
    expect(hold.amount).toBe(725000);
    expect(Date.parse(hold.expiresAt!) - Date.parse(hold.createdAt)).toBe(15 * 60000);
    expect(hold.apiStatus).toBe('PAYMENT_PENDING');
    expect(TestBed.inject(RoomService).refresh).toHaveBeenCalledOnce();
    expect(booking.receipt()).toBeUndefined();
  });
  it('creates a payOS link with an idempotency key, keeping the hold unpaid', async () => {
    const pending = booking.createPayosLink(API_HOLD.id);
    const req = await request('/data/me/holds/' + API_HOLD.id + '/payos-link');
    expect(req.request.body).toEqual({});
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.headers.get('Idempotency-Key')).toBeTruthy();
    const link: HoldPayosLink = {
      checkoutUrl: 'https://pay.payos.vn/test',
      qrCode: 'qr',
      orderCode: 100001,
      amount: 1000000,
      description: 'GC100001',
      expiresAt: API_HOLD.expiresAt!,
    };
    req.flush(JSON.stringify(link));
    expect(await pending).toEqual(link);
    expect(booking.payments()).toEqual([]);
    expect(booking.receipt()).toBeUndefined();
    http.expectNone('/data/me/holds/' + API_HOLD.id + '/complete-payment');
  });
  it('reuses the A1 key after an uncertain response across service recreation', async () => {
    const first = booking.createPayosLink(API_HOLD.id);
    const rejected = expect(first).rejects.toMatchObject({ status: 0 });
    const req = await request('/data/me/holds/' + API_HOLD.id + '/payos-link');
    const key = req.request.headers.get('Idempotency-Key');
    req.error(new ProgressEvent('error'));
    await rejected;
    const restored = TestBed.runInInjectionContext(() => new BookingService());
    const next = restored.createPayosLink(API_HOLD.id);
    const retry = await request('/data/me/holds/' + API_HOLD.id + '/payos-link');
    expect(retry.request.headers.get('Idempotency-Key')).toBe(key);
    retry.flush(
      JSON.stringify({
        checkoutUrl: 'https://pay.payos.vn/test',
        description: 'GC100001',
        amount: 1000000,
      }),
    );
    await next;
  });
  it('reads A3 without inventing a receipt and cancels an in-flight read on page teardown', async () => {
    const stop = new Subject<void>();
    const status = booking.paymentStatus(API_HOLD.id, stop);
    const result = {
      holdStatus: 'PAYMENT_PENDING',
      paymentStatus: 'PENDING',
      expiresAt: API_HOLD.expiresAt,
    };
    (await request('/data/me/holds/' + API_HOLD.id + '/payment-status', 'GET')).flush(
      JSON.stringify(result),
    );
    expect(await status).toEqual(result);
    expect(booking.receipt()).toBeUndefined();
    const next = booking.paymentStatus(API_HOLD.id, stop);
    const cancelled = expect(next).rejects.toThrow();
    const req = await request('/data/me/holds/' + API_HOLD.id + '/payment-status', 'GET');
    stop.next();
    expect(req.cancelled).toBe(true);
    await cancelled;
    stop.complete();
  });
  it.each([
    ['PAYMENT_PENDING', 'Chờ thanh toán'],
    ['ACTIVE', 'Đang giữ chỗ'],
    ['CONVERTED', 'Đã chuyển thành cọc'],
    ['FORFEITED', 'Khách bỏ giữ chỗ'],
  ])('labels %s according to DEP-API', (status, label) => {
    expect(booking.label(status)).toBe(label);
  });
  it('takes amount, expiry and status only from server records, without expiring them locally', async () => {
    const pending = booking.refresh();
    await flushHolds({ ...API_HOLD, amount: 725000, expiresAt: '2000-01-01T00:00:00Z' });
    await pending;
    expect(booking.get(API_HOLD.id)?.amount).toBe(725000);
    expect(booking.get(API_HOLD.id)?.status).toBe('CONFIRMED');
    expect(booking.receipt(API_PAYMENT.id)?.number).toBe(API_PAYMENT.receipt!.number);
    auth.account.set({ ...API_ACCOUNT, id: 'other' });
    expect(booking.list()).toEqual([]);
    expect(booking.payments()).toEqual([]);
  });
  it.each([0, 409, 503])('rejected hold %s never appears in the customer list', async (status) => {
    const pending = booking.createRequest('phong-48', API_ACCOUNT.name, API_ACCOUNT.phone!, {}),
      rejected = expect(pending).rejects.toMatchObject({ status });
    const req = await request('/data/me/holds');
    expect(req.request.headers.get('Idempotency-Key')).toBeTruthy();
    if (!status) req.error(new ProgressEvent('error'));
    else req.flush('{"code":"ROOM_LOCKED"}', { status, statusText: 'Rejected' });
    await rejected;
    expect(booking.list()).toEqual([]);
  });
  it('allows a different room after a definitive ROOM_LOCKED rejection', async () => {
    const failed = booking.createRequest('phong-48', API_ACCOUNT.name, API_ACCOUNT.phone!, {});
    const rejected = expect(failed).rejects.toMatchObject({ status: 409 });
    const first = await request('/data/me/holds');
    first.flush('{"code":"ROOM_LOCKED"}', { status: 409, statusText: 'Conflict' });
    await rejected;
    const retry = booking.createRequest('phong-49', API_ACCOUNT.name, API_ACCOUNT.phone!, {});
    const next = await request('/data/me/holds');
    expect(next.request.headers.get('Idempotency-Key')).not.toBe(
      first.request.headers.get('Idempotency-Key'),
    );
    next.flush(
      JSON.stringify({
        ...API_HOLD,
        roomId: 'phong-49',
        status: 'PAYMENT_PENDING',
        paymentId: undefined,
      }),
    );
    expect((await retry).roomId).toBe('phong-49');
  });
  it('reads a successful cancellation from the server and refreshes room availability', async () => {
    const loaded = booking.refresh();
    await flushHolds({ ...API_HOLD, status: 'PAYMENT_PENDING', paymentId: undefined });
    await loaded;
    vi.mocked(TestBed.inject(RoomService).refresh).mockClear();
    const cancelled = booking.cancel(API_HOLD.id);
    (await request('/data/me/holds/' + API_HOLD.id + '/cancel')).flush(
      JSON.stringify({ ...API_HOLD, status: 'CANCELLED', paymentId: undefined }),
    );
    await flushHolds({ ...API_HOLD, status: 'CANCELLED', isActive: false, paymentId: undefined });
    await cancelled;
    expect(booking.get(API_HOLD.id)?.apiStatus).toBe('CANCELLED');
    expect(TestBed.inject(RoomService).refresh).toHaveBeenCalledOnce();
  });
  it('shows no receipt while payment is pending and uses a real API receipt after reconciliation', async () => {
    let pending = booking.refresh();
    await flushHolds(API_HOLD, { ...API_PAYMENT, status: 'PENDING', receipt: undefined });
    await pending;
    expect(booking.receipt(API_PAYMENT.id)).toBeUndefined();
    pending = booking.refresh();
    await flushHolds();
    await pending;
    expect(booking.receipt(API_PAYMENT.id)).toEqual(API_PAYMENT.receipt);
  });
  it('clears authority when a protected endpoint rejects an expired session', async () => {
    const pending = booking.refresh(),
      rejected = expect(pending).rejects.toMatchObject({ status: 401 });
    http.expectOne('/data/me/holds').flush('{}', { status: 401, statusText: 'Unauthorized' });
    await rejected;
    expect(auth.serverAuthenticated()).toBe(false);
    expect(booking.list()).toEqual([]);
  });
  it('maps a room-lock conflict to Vietnamese', () => {
    // The message helper is shared with other customer flows.
    expect(
      apiMessage(new HttpErrorResponse({ status: 409, error: { code: 'ROOM_LOCKED' } }), 'other'),
    ).toBe('Phòng vừa được khách khác giữ chỗ');
  });
  it.each([0, 503])(
    'does not cancel a pending hold locally after a failed cancellation %s',
    async (status) => {
      const initial = {
        ...API_HOLD,
        status: 'PAYMENT_PENDING' as const,
        paymentId: undefined,
        isActive: false,
      };
      const loaded = booking.refresh();
      await flushHolds(initial);
      await loaded;
      const pending = booking.cancel(initial.id),
        rejected = expect(pending).rejects.toMatchObject({ status });
      const req = await request('/data/me/holds/' + initial.id + '/cancel');
      if (!status) req.error(new ProgressEvent('error'));
      else req.flush('offline', { status, statusText: 'Unavailable' });
      await rejected;
      expect(booking.get(initial.id)?.apiStatus).toBe('PAYMENT_PENDING');
    },
  );
});
