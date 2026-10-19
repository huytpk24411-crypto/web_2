import { Injectable, inject } from '@angular/core';
import { DemoStore } from './demo-store.service';
import { AuthService } from './auth.service';
@Injectable({ providedIn: 'root' })
export class DealService {
  private store = inject(DemoStore);
  private auth = inject(AuthService);
  list() {
    return this.store.state().deals;
  }
  get(id: string) {
    return this.list().find((d) => d.id === id);
  }
  complete(id: string) {
    if (!this.auth.isEmployee()) return;
    this.store.update((s) => {
      const d = s.deals.find((d) => d.id === id);
      if (
        !d ||
        d.status !== 'PENDING' ||
        !s.deposits.some((x) => x.id === d.depositId && x.status === 'CONFIRMED')
      )
        throw new Error('Cần hồ sơ cọc đã xác nhận trước khi bàn giao.');
      d.status = 'COMPLETED';
      const r = s.rooms.find((r) => r.id === d.roomId);
      if (r) r.status = 'RENTED';
    });
  }
  forfeit(id: string, reason: string) {
    if (!this.auth.isEmployee() || !reason.trim()) throw new Error('Vui lòng nhập lý do xử lý.');
    this.store.update((s) => {
      const d = s.deals.find((d) => d.id === id);
      const deposit = s.deposits.find((x) => x.id === d?.depositId);
      if (!d || d.status !== 'PENDING' || deposit?.status !== 'CONFIRMED')
        throw new Error('Chỉ xử lý bỏ cọc với giao dịch đã xác nhận cọc.');
      d.status = 'FORFEITED';
      d.forfeitureReason = reason.trim();
      d.forfeitedAt = new Date().toISOString();
      deposit.status = 'FORFEITED';
      const b = s.bookings.find((b) => b.id === deposit.bookingId);
      if (b) b.status = 'EXPIRED';
      const r = s.rooms.find((r) => r.id === d.roomId);
      if (r && r.publicationStatus !== 'HIDDEN') r.status = 'AVAILABLE';
    });
  }
}
