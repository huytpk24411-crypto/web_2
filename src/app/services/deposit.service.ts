import { Injectable, inject } from '@angular/core';
import { DemoStore, uid } from './demo-store.service';
import { AuthService } from './auth.service';
import { DepositDossier, Payment } from '../models/domain';
@Injectable({ providedIn: 'root' })
export class DepositService {
  private store = inject(DemoStore);
  private auth = inject(AuthService);
  list() {
    return this.store.state().deposits;
  }
  get(id: string) {
    return this.list().find((d) => d.id === id);
  }
  eligibleBookings() {
    return this.store
      .state()
      .bookings.filter(
        (b) =>
          b.status === 'CONFIRMED' &&
          !b.creditedToDepositId &&
          !!b.expiresAt &&
          new Date(b.expiresAt).getTime() > Date.now(),
      );
  }
  create(
    data: Pick<
      DepositDossier,
      | 'roomId'
      | 'customerName'
      | 'phone'
      | 'total'
      | 'method'
      | 'address'
      | 'duration'
      | 'startDate'
    >,
    bookingId?: string,
  ): DepositDossier {
    if (!this.auth.isEmployee()) throw new Error('Cần quyền nhân viên.');
    const b = bookingId
      ? this.eligibleBookings().find((b) => b.id === bookingId && b.roomId === data.roomId)
      : undefined;
    if (bookingId && !b) throw new Error('Giữ chỗ không hợp lệ hoặc đã được khấu trừ.');
    const room = this.store.state().rooms.find((r) => r.id === data.roomId);
    if (!room || (room.status !== 'AVAILABLE' && !b)) throw new Error('Phòng không khả dụng.');
    const credit = b?.amount || 0;
    if (!Number.isFinite(data.total) || data.total <= 0 || data.total < credit)
      throw new Error('Tổng cọc phải lớn hơn 0 và không nhỏ hơn tiền giữ chỗ.');
    const d: DepositDossier = {
      ...data,
      id: uid('deposit'),
      holdCredit: credit,
      due: data.total - credit,
      bookingId: b?.id,
      status: 'PENDING',
      createdBy: this.auth.account()!.id,
    };
    this.store.update((s) => {
      s.deposits.push(d);
      if (b) s.bookings.find((x) => x.id === b.id)!.creditedToDepositId = d.id;
    });
    return d;
  }
  confirmDemo(id: string, method: 'QR' | 'CASH'): DepositDossier {
    if (!this.auth.isEmployee()) throw new Error('Cần quyền nhân viên.');
    const d = this.get(id);
    if (!d) throw new Error('Không tìm thấy hồ sơ.');
    if (d.status === 'CONFIRMED') return d;
    if (d.status !== 'PENDING') throw new Error('Hồ sơ đã kết thúc.');
    const room = this.store.state().rooms.find((r) => r.id === d.roomId);
    const ownHold =
      d.bookingId &&
      this.store
        .state()
        .bookings.some(
          (b) => b.id === d.bookingId && b.status === 'CONFIRMED' && b.creditedToDepositId === d.id,
        );
    if (!room || (room.status !== 'AVAILABLE' && !ownHold))
      throw new Error('Phòng không còn khả dụng cho giao dịch này.');
    const p: Payment = {
      id: uid('pay'),
      referenceId: id,
      amount: d.due,
      method,
      status: 'CONFIRMED_DEMO',
      confirmedAt: new Date().toISOString(),
    };
    this.store.update((s) => {
      const x = s.deposits.find((x) => x.id === id)!;
      x.status = 'CONFIRMED';
      x.method = method;
      x.paymentId = p.id;
      s.payments.push(p);
      const r = s.rooms.find((r) => r.id === x.roomId)!;
      r.status = 'HELD';
      r.hasHistory = true;
      s.deals.push({
        id: uid('deal'),
        depositId: id,
        roomId: r.id,
        customerName: x.customerName,
        brokerageFee: r.price / 2,
        status: 'PENDING',
      });
    });
    return this.get(id)!;
  }
}
