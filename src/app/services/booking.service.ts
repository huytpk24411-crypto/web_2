import { Injectable, inject } from '@angular/core';
import { DemoStore, uid } from './demo-store.service';
import { AuthService } from './auth.service';
import { BookingHold, Payment } from '../models/domain';
@Injectable({ providedIn: 'root' })
export class BookingService {
  private store = inject(DemoStore);
  private auth = inject(AuthService);
  list() {
    return this.store.state().bookings.filter((b) => b.customerId === this.auth.account()?.id);
  }
  get(id: string) {
    return this.list().find((b) => b.id === id);
  }
  expire(): void {
    this.store.update((s) => {
      for (const b of s.bookings) {
        if (
          b.status === 'CONFIRMED' &&
          b.expiresAt &&
          new Date(b.expiresAt).getTime() < Date.now() &&
          !b.creditedToDepositId
        ) {
          b.status = 'EXPIRED';
          const r = s.rooms.find((r) => r.id === b.roomId);
          if (r?.status === 'HELD') r.status = 'AVAILABLE';
        }
      }
    });
  }
  create(
    roomId: string,
    name: string,
    phone: string,
    details: Pick<BookingHold, 'moveIn' | 'note'> = {},
  ): BookingHold {
    this.expire();
    if (this.auth.account()?.role !== 'CUSTOMER') throw new Error('Cần tài khoản khách hàng.');
    if (!this.store.state().rooms.some((r) => r.id === roomId && r.status === 'AVAILABLE' && r.publicationStatus === 'PUBLISHED'))
      throw new Error('Phòng không còn trống.');
    const existing = this.list().find((b) => b.roomId === roomId && b.status === 'PENDING');
    if (existing) return existing;
    const booking: BookingHold = {
      ...details,
      id: uid('hold'),
      roomId,
      customerId: this.auth.account()!.id,
      name,
      phone,
      amount: 1000000,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };
    this.store.update((s) => s.bookings.push(booking));
    return booking;
  }
  confirmDemo(id: string): BookingHold {
    const existing = this.get(id);
    if (!existing) throw new Error('Không tìm thấy giữ chỗ.');
    if (existing.status === 'CONFIRMED') return existing;
    if (existing.status !== 'PENDING') throw new Error('Yêu cầu giữ chỗ đã hết hạn.');
    if (!this.store.state().rooms.some((r) => r.id === existing.roomId && r.status === 'AVAILABLE' && r.publicationStatus === 'PUBLISHED'))
      throw new Error('Phòng vừa được giữ bởi một giao dịch khác.');
    const now = new Date();
    const payment: Payment = {
      id: uid('pay'),
      referenceId: id,
      amount: existing.amount,
      method: 'QR',
      status: 'CONFIRMED_DEMO',
      confirmedAt: now.toISOString(),
    };
    this.store.update((s) => {
      const b = s.bookings.find((b) => b.id === id)!;
      b.status = 'CONFIRMED';
      b.paymentId = payment.id;
      b.expiresAt = new Date(now.getTime() + 48 * 3600000).toISOString();
      s.payments.push(payment);
      const room = s.rooms.find((r) => r.id === b.roomId)!;
      room.status = 'HELD';
      room.hasHistory = true;
    });
    return this.get(id)!;
  }
}
