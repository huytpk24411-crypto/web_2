import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { API_ACCOUNT, API_HOLD, API_PAYMENT, API_ROOMS } from '../../testing/api-fixtures';
import { AuthService } from '../../services/auth-service';
import { RoomService } from '../../services/room-service';
import { CONNECTION_ERROR } from '../../services/api-message';
import { CustomerModule } from '../customer-module';
import { CustomerBookingReceiptComponent } from './customer-booking-receipt';
import { MoneyPayment } from '../../classes/Money';
import { MoneyHold } from '../../classes/Money';
import { PAYOS_LOCATION } from '../../services/booking-service';

const SELF_PAYMENT: MoneyPayment = {
  ...API_PAYMENT,
  method: 'MOMO',
  confirmedBy: 'SYSTEM',
  confirmedByEmployeeId: null,
  receipt: {
    ...API_PAYMENT.receipt!,
    snapshot: {
      ...API_PAYMENT.receipt!.snapshot,
      holdId: API_HOLD.id,
      roomName: 'Tên phòng tại thời điểm thu tiền',
      roomAddress: 'Địa chỉ trên biên lai',
      method: 'MOMO',
      paidAt: API_PAYMENT.paidAt,
      expiresAt: API_HOLD.expiresAt,
    },
  },
};

describe('CustomerBookingReceiptComponent', () => {
  let http: HttpTestingController;
  let query: Record<string, string>;
  let assign: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    query = {};
    assign = vi.fn();
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
            get: (id: string) => API_ROOMS.find((room) => room.id === id),
            forRecord: RoomService.prototype.forRecord,
            refresh: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ id: API_HOLD.id }),
              get queryParamMap() {
                return convertToParamMap(query);
              },
            },
          },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const session = TestBed.inject(AuthService).restoreApiSession();
    http.expectOne({ method: 'GET', url: '/auth/profile' }).flush(JSON.stringify(API_ACCOUNT));
    await session;
  });
  afterEach(() => {
    try {
      http.verify();
    } finally {
      vi.restoreAllMocks();
      TestBed.resetTestingModule();
      vi.useRealTimers();
    }
  });
  async function request(url: string): Promise<TestRequest> {
    let result!: TestRequest;
    await vi.waitFor(() => {
      result = http.expectOne({ method: 'GET', url });
    });
    return result;
  }
  async function loadReceipt(payment = SELF_PAYMENT, hold: MoneyHold = API_HOLD) {
    const fixture = TestBed.createComponent(CustomerBookingReceiptComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.booking.loading()).toBe(true);
    (await request('/data/me/holds')).flush(JSON.stringify({ items: [hold] }));
    if (hold.paymentId)
      (await request('/data/payments/' + hold.paymentId)).flush(JSON.stringify(payment));
    if (hold.status === 'PAYMENT_PENDING')
      (await request('/data/me/holds/' + hold.id + '/payment-status')).flush(
        JSON.stringify({
          holdStatus: hold.status,
          paymentStatus: 'PENDING',
          expiresAt: hold.expiresAt,
        }),
      );
    await vi.waitFor(() => expect(fixture.componentInstance.busy()).toBe(false));
    await fixture.whenStable();
    return fixture;
  }
  it('khởi tạo và render frame bằng HTML từ phản hồi API', async () => {
    const fixture = await loadReceipt();
    expect(fixture.nativeElement.querySelector('.not-found')).toBeNull();
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.children.length).toBeGreaterThan(0);
    expect(fixture.nativeElement.textContent).toContain(API_PAYMENT.receipt!.number);
  });
  it('shows the issued snapshot, channel and home action even when the current room differs', async () => {
    const fixture = await loadReceipt();
    const document = fixture.nativeElement.querySelector('.receipt-document');
    expect(document.textContent).toContain('Tên phòng tại thời điểm thu tiền');
    expect(document.textContent).toContain('Địa chỉ trên biên lai');
    expect(document.textContent).toContain('MoMo');
    expect(document.textContent).toContain(API_HOLD.id);
    expect(document.textContent).not.toContain('Địa chỉ kiểm thử');
    const home = fixture.nativeElement.querySelector('.receipt-actions a');
    expect(home.getAttribute('href')).toBe('/');
    expect(home.textContent).toContain('Về trang chủ');
    expect(fixture.nativeElement.textContent).not.toMatch(/Chờ nhân viên|sau khi nhân viên/);
  });
  it('renders the deleted room snapshot and short hold number without a room detail link', async () => {
    const source = API_ROOMS.find((room) => room.id === API_HOLD.roomId)!;
    const roomSnapshot = {
      ...source,
      name: 'Phòng lưu trữ',
      address: 'Địa chỉ lưu trữ',
      propertyName: 'Tòa A',
      ownerId: 'owner',
      monthlyRent: source.price,
    };
    vi.spyOn(TestBed.inject(RoomService), 'get').mockReturnValue(undefined);
    const fixture = await loadReceipt(SELF_PAYMENT, {
      ...API_HOLD,
      number: 'GC-202611-0009',
      roomSnapshot,
    });
    expect(fixture.nativeElement.textContent).toContain('Phòng lưu trữ');
    expect(fixture.nativeElement.textContent).toContain('Địa chỉ lưu trữ');
    expect(fixture.nativeElement.textContent).toContain('GC-202611-0009');
    expect(fixture.nativeElement.querySelector('a[href^="/rooms/"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.receipt-document').textContent).toContain(
      'Tên phòng tại thời điểm thu tiền',
    );
  });
  it('prints only an issued server receipt and renders an asynchronous load error', async () => {
    const fixture = await loadReceipt();
    expect(fixture.componentInstance.receipt?.number).toBe(API_PAYMENT.receipt!.number);
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    fixture.componentInstance.print();
    expect(print).toHaveBeenCalledOnce();
    fixture.componentInstance.refresh();
    (await request('/data/me/holds')).flush('offline', { status: 503, statusText: 'Unavailable' });
    await vi.waitFor(() => expect(fixture.componentInstance.error()).toBe(CONNECTION_ERROR));
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      CONNECTION_ERROR,
    );
  });
  it('does not enable printing or issue a receipt while the API payment is pending', async () => {
    const fixture = await loadReceipt(
      { ...API_PAYMENT, status: 'PENDING', receipt: undefined },
      pendingHold(),
    );
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    expect(fixture.componentInstance.receipt).toBeUndefined();
    expect(fixture.componentInstance.confirmed).toBe(false);
    expect(fixture.nativeElement.querySelector('.receipt-actions button.no-print')).toBeNull();
    fixture.componentInstance.print();
    expect(print).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).not.toContain(API_PAYMENT.receipt!.number);
  });
  function pendingHold(): MoneyHold {
    return {
      ...API_HOLD,
      status: 'PAYMENT_PENDING',
      paymentId: undefined,
      isActive: false,
      expiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
    };
  }
  it('polls A3 every three seconds after return, then renders ACTIVE and its issued receipt', async () => {
    vi.useFakeTimers();
    const intervals = vi.spyOn(globalThis, 'setInterval');
    query['payos'] = 'return';
    const fixture = await loadReceipt(SELF_PAYMENT, pendingHold());
    expect(fixture.nativeElement.textContent).toContain('Đang chờ ngân hàng xác nhận thanh toán…');
    expect(fixture.nativeElement.textContent).not.toContain('Thanh toán thành công');
    expect(intervals).toHaveBeenCalledWith(expect.any(Function), 3000);
    await vi.advanceTimersByTimeAsync(3000);
    http.expectOne('/data/me/holds/' + API_HOLD.id + '/payment-status').flush(
      JSON.stringify({
        holdStatus: 'ACTIVE',
        paymentStatus: 'CONFIRMED',
        expiresAt: API_HOLD.expiresAt,
      }),
    );
    (await request('/data/me/holds')).flush(JSON.stringify({ items: [API_HOLD] }));
    (await request('/data/payments/' + API_HOLD.paymentId)).flush(JSON.stringify(SELF_PAYMENT));
    await vi.waitFor(() => expect(fixture.componentInstance.booking.loading()).toBe(false));
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Thanh toán thành công');
    expect(fixture.nativeElement.textContent).toContain(SELF_PAYMENT.receipt!.number);
    await vi.advanceTimersByTimeAsync(6000);
    http.expectNone('/data/me/holds/' + API_HOLD.id + '/payment-status');
    fixture.destroy();
  });
  it('shows cancel and retries through A1 only while the fifteen-minute hold is valid', async () => {
    query['payos'] = 'cancel';
    const hold = pendingHold();
    const fixture = await loadReceipt(SELF_PAYMENT, hold);
    const component = fixture.componentInstance;
    expect(fixture.nativeElement.textContent).toContain('Bạn đã hủy thanh toán.');
    const retry = fixture.nativeElement.querySelector('.notice button') as HTMLButtonElement;
    expect(retry.textContent.trim()).toBe('Thanh toán lại');
    retry.click();
    let req!: TestRequest;
    await vi.waitFor(() => {
      req = http.expectOne({ method: 'POST', url: '/data/me/holds/' + hold.id + '/payos-link' });
    });
    req.flush(
      JSON.stringify({
        checkoutUrl: 'https://pay.payos.vn/retry',
        description: 'GC100002',
        amount: hold.amount,
      }),
    );
    await vi.waitFor(() =>
      expect(assign).toHaveBeenCalledExactlyOnceWith('https://pay.payos.vn/retry'),
    );
    component.now.set(Date.parse(hold.expiresAt!));
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Giữ chỗ đã hết hạn');
    expect(fixture.nativeElement.querySelector('.notice button')).toBeNull();
    expect(fixture.nativeElement.querySelector('.notice a').textContent).toContain(
      'Chọn phòng khác',
    );
  });
  it('cancels an in-flight A3 request and all polling when leaving the receipt page', async () => {
    vi.useFakeTimers();
    const fixture = await loadReceipt(SELF_PAYMENT, pendingHold());
    await vi.advanceTimersByTimeAsync(3000);
    const req = http.expectOne('/data/me/holds/' + API_HOLD.id + '/payment-status');
    fixture.destroy();
    expect(req.cancelled).toBe(true);
    await vi.advanceTimersByTimeAsync(180000);
    http.expectNone('/data/me/holds/' + API_HOLD.id + '/payment-status');
  });
  it('keeps an already ACTIVE hold successful after a cancel redirect without starting A3', async () => {
    query['payos'] = 'cancel';
    const fixture = await loadReceipt();
    expect(fixture.nativeElement.textContent).toContain('Thanh toán thành công');
    expect(fixture.nativeElement.textContent).not.toContain('Bạn đã hủy thanh toán.');
    http.expectNone('/data/me/holds/' + API_HOLD.id + '/payment-status');
  });
  it('shows FORFEITED with the contract label rather than claiming a successful hold', async () => {
    const fixture = await loadReceipt(SELF_PAYMENT, { ...API_HOLD, status: 'FORFEITED' });
    expect(fixture.nativeElement.textContent).toContain('Khách bỏ giữ chỗ');
    expect(fixture.nativeElement.textContent).toContain('Tiền giữ chỗ không được hoàn lại.');
    expect(fixture.componentInstance.confirmed).toBe(false);
    http.expectNone('/data/me/holds/' + API_HOLD.id + '/payment-status');
  });
  it('stops at three minutes with a reload message when A3 keeps returning pending', async () => {
    vi.useFakeTimers();
    const fixture = await loadReceipt(SELF_PAYMENT, pendingHold());
    for (let i = 0; i < 59; i++) {
      await vi.advanceTimersByTimeAsync(3000);
      http.expectOne('/data/me/holds/' + API_HOLD.id + '/payment-status').flush(
        JSON.stringify({
          holdStatus: 'PAYMENT_PENDING',
          paymentStatus: 'PENDING',
          expiresAt: pendingHold().expiresAt,
        }),
      );
      await Promise.resolve();
    }
    await vi.advanceTimersByTimeAsync(3000);
    const atDeadline = http.match('/data/me/holds/' + API_HOLD.id + '/payment-status');
    expect(atDeadline.every((r) => r.cancelled)).toBe(true);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Chưa nhận được xác nhận từ ngân hàng');
    await vi.advanceTimersByTimeAsync(6000);
    http.expectNone('/data/me/holds/' + API_HOLD.id + '/payment-status');
    fixture.destroy();
  });
});
