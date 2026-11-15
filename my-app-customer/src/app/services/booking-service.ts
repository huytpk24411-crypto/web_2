import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { firstValueFrom, map, Observable, takeUntil } from 'rxjs';
import { BookingHold } from '../classes/Booking';
import { HoldPayosLink, HoldPaymentStatus, MoneyHold, MoneyPayment } from '../classes/Money';
import { AuthService } from './auth-service';
import { RoomService } from './room-service';
import { apiMessage } from './api-message';
export const PAYOS_LOCATION = new InjectionToken<Pick<Location, 'assign'>>('PAYOS_LOCATION', {
  providedIn: 'root',
  factory: () => window.location,
});

@Injectable({ providedIn: 'root' })
export class BookingService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private rooms = inject(RoomService);
  private state = signal<{ owner: string; holds: MoneyHold[]; payments: MoneyPayment[] } | null>(
    null,
  );
  private version = 0;
  private requestKeys = new Map<string, { key: string; fingerprint: string }>();
  private options = { responseType: 'text' as const, withCredentials: true, timeout: 10000 };
  readonly loading = signal(false);
  readonly error = signal('');
  private owner(): string {
    if (!this.auth.hasRole(['CUSTOMER']))
      throw new Error('Vui lòng đăng nhập tài khoản khách hàng.');
    return this.auth.account()!.id;
  }
  private current() {
    const state = this.state();
    return this.auth.serverAuthenticated() && state?.owner === this.auth.account()?.id
      ? state
      : null;
  }
  private fromApi(b: MoneyHold): BookingHold {
    return {
      ...b,
      name: b.contact.name,
      phone: b.contact.phone,
      apiStatus: b.status,
      status:
        b.status === 'PAYMENT_PENDING'
          ? 'PENDING'
          : b.status === 'ACTIVE'
            ? 'CONFIRMED'
            : 'EXPIRED',
    };
  }
  list(): BookingHold[] {
    return (this.current()?.holds || []).map((b) => this.fromApi(b));
  }
  get(id: string): BookingHold | undefined {
    return this.list().find((b) => b.id === id);
  }
  payments(): MoneyPayment[] {
    return this.current()?.payments || [];
  }
  receipt(paymentId?: string) {
    return this.payments().find((p) => p.id === paymentId && p.status === 'CONFIRMED')?.receipt;
  }
  label(status: string): string {
    return (
      (
        {
          PAYMENT_PENDING: 'Chờ thanh toán',
          ACTIVE: 'Đang giữ chỗ',
          CONVERTED: 'Đã chuyển thành cọc',
          FORFEITED: 'Khách bỏ giữ chỗ',
          CANCELLED: 'Đã hủy',
          EXPIRED: 'Đã hết hạn',
          PENDING: 'Chưa hoàn tất',
          CONFIRMED: 'Đã xác nhận',
          REJECTED: 'Đã từ chối',
          FAILED: 'Không thành công',
        } as Record<string, string>
      )[status] || status
    );
  }
  methodLabel(method?: MoneyPayment['method']): string {
    return method
      ? {
          BANK_TRANSFER: 'Ngân hàng',
          ZALOPAY: 'ZaloPay',
          MOMO: 'MoMo',
          CASH: 'Tiền mặt',
          QR: 'QR',
        }[method]
      : 'Chưa thanh toán';
  }
  private getApi<T>(path: string): Promise<T> {
    return firstValueFrom(
      this.http.get('/data/' + path, this.options).pipe(map((text) => JSON.parse(text) as T)),
    );
  }
  async refresh(): Promise<void> {
    const owner = this.owner(),
      version = ++this.version;
    this.loading.set(true);
    this.error.set('');
    try {
      const { items: holds } = await this.getApi<{ items: MoneyHold[] }>('me/holds');
      if (!Array.isArray(holds)) throw new Error('Phản hồi giữ chỗ không hợp lệ.');
      const payments = await Promise.all(
        holds
          .filter((h) => h.paymentId)
          .map((h) => this.getApi<MoneyPayment>('payments/' + encodeURIComponent(h.paymentId!))),
      );
      if (this.auth.account()?.id === owner && version === this.version)
        this.state.set({ owner, holds, payments });
    } catch (error) {
      if (this.auth.account()?.id === owner && version === this.version)
        this.error.set(apiMessage(error, 'Không tải được giữ chỗ. Vui lòng thử lại.'));
      throw error;
    } finally {
      if (version === this.version) this.loading.set(false);
    }
  }
  private async digest(value: string): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(hash), (n) => n.toString(16).padStart(2, '0')).join('');
  }
  private async write<T>(path: string, body: unknown): Promise<{ result: T; storageKey: string }> {
    const owner = this.owner();
    const storageKey = 'ihouzz-request-key:' + (await this.digest(owner + ':' + path));
    const fingerprint = await this.digest(JSON.stringify(body));
    let pending = this.requestKeys.get(storageKey);
    if (!pending) {
      try {
        pending = JSON.parse(sessionStorage.getItem(storageKey) || 'null') || undefined;
      } catch {}
    }
    if (pending && pending.fingerprint !== fingerprint)
      throw new Error('Yêu cầu trước chưa xác định kết quả. Vui lòng thử lại cùng thông tin.');
    if (!pending)
      pending = {
        key: crypto.randomUUID(),
        fingerprint,
      };
    this.requestKeys.set(storageKey, pending);
    // Only retry metadata (for idempotent writes) is persisted, never a business record.
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(pending));
    } catch {}
    if (this.auth.account()?.id !== owner) throw new Error('Phiên đăng nhập đã thay đổi.');
    try {
      const result = await firstValueFrom(
        this.http
          .post('/data/' + path, body, {
            ...this.options,
            headers: { 'Idempotency-Key': pending.key },
          })
          .pipe(map((text) => JSON.parse(text) as T)),
      );
      return { result, storageKey };
    } catch (error) {
      // A definitive rejection may be corrected; an uncertain transport result keeps its key.
      if (error instanceof HttpErrorResponse) {
        let code = '';
        try {
          code = (typeof error.error === 'string' ? JSON.parse(error.error) : error.error)?.code;
        } catch {}
        const rejectedBeforePayment =
          (path === 'me/holds' || path.endsWith('/payos-link')) &&
          ['ROOM_LOCKED', 'HOLD_EXPIRED'].includes(code);
        if (
          error.status >= 400 &&
          error.status < 500 &&
          (error.status !== 409 || rejectedBeforePayment)
        )
          this.finish(storageKey);
      }
      throw error;
    }
  }
  private finish(storageKey: string): void {
    this.requestKeys.delete(storageKey);
    try {
      sessionStorage.removeItem(storageKey);
    } catch {}
  }
  async createRequest(
    roomId: string,
    name: string,
    phone: string,
    details: Pick<BookingHold, 'moveIn' | 'note'>,
  ): Promise<BookingHold> {
    const owner = this.owner();
    const { result: hold, storageKey } = await this.write<MoneyHold>('me/holds', {
      roomId,
      contactName: name,
      contactPhone: phone,
      ...details,
    });
    if (!hold?.id || !hold.contact)
      throw new Error('Chưa xác định yêu cầu giữ chỗ. Vui lòng thử lại cùng thông tin.');
    if (this.auth.account()?.id !== owner) throw new Error('Phiên đăng nhập đã thay đổi.');
    this.state.set({
      owner,
      holds: [...(this.current()?.holds || []).filter((h) => h.id !== hold.id), hold],
      payments: this.payments(),
    });
    this.finish(storageKey);
    return this.fromApi(hold);
  }
  async createPayosLink(id: string): Promise<HoldPayosLink> {
    const owner = this.owner();
    const { result, storageKey } = await this.write<HoldPayosLink>(
      'me/holds/' + encodeURIComponent(id) + '/payos-link',
      {},
    );
    if (this.auth.account()?.id !== owner) throw new Error('Phiên đăng nhập đã thay đổi.');
    if (!result?.checkoutUrl || !result.description || !Number.isFinite(result.amount))
      throw new Error('Không nhận được thông tin thanh toán. Vui lòng thử lại.');
    this.finish(storageKey);
    return result;
  }
  async paymentStatus(id: string, stop: Observable<void>): Promise<HoldPaymentStatus> {
    this.owner();
    return firstValueFrom(
      this.http
        .get('/data/me/holds/' + encodeURIComponent(id) + '/payment-status', this.options)
        .pipe(
          takeUntil(stop),
          map((text) => JSON.parse(text) as HoldPaymentStatus),
        ),
    );
  }
  async cancel(id: string): Promise<void> {
    const { storageKey } = await this.write<MoneyHold>(
      'me/holds/' + encodeURIComponent(id) + '/cancel',
      {},
    );
    await this.refresh();
    this.finish(storageKey);
    await this.rooms.refresh();
  }
}
