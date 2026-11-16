import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { BookingHold } from '../../classes/Booking';
import { BookingService } from '../../services/booking-service';
import { RoomService } from '../../services/room-service';

type HoldTab = 'active' | 'pending' | 'history';

@Component({
  selector: 'app-customer-booking-list',
  standalone: false,
  templateUrl: './customer-booking-list.html',
  styleUrls: ['./customer-booking-list.css'],
})
export class CustomerBookingListComponent {
  readonly booking = inject(BookingService);
  readonly rooms = inject(RoomService);
  readonly tab = signal<HoldTab>('active');
  readonly query = signal('');
  readonly now = signal(Date.now());
  readonly tabs: { id: HoldTab; label: string }[] = [
    { id: 'active', label: 'Đang giữ chỗ' },
    { id: 'pending', label: 'Chờ thanh toán' },
    { id: 'history', label: 'Lịch sử giữ chỗ' },
  ];
  readonly grouped = computed(() => {
    const result: Record<HoldTab, BookingHold[]> = { active: [], pending: [], history: [] };
    for (const hold of this.booking.list()) result[this.group(hold)].push(hold);
    for (const items of Object.values(result))
      items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return result;
  });
  readonly visible = computed(() => {
    const query = this.query().trim().toLocaleLowerCase('vi');
    return this.grouped()[this.tab()].filter((hold) => {
      const room = this.rooms.forRecord(hold);
      return (
        !query ||
        `${hold.number || hold.id} ${room?.name || ''} ${room?.code || ''} ${room?.address || ''}`
          .toLocaleLowerCase('vi')
          .includes(query)
      );
    });
  });

  constructor() {
    void this.refresh();
    const clock = setInterval(() => this.now.set(Date.now()), 1000);
    const refresh = setInterval(() => {
      if (document.visibilityState === 'visible' && !this.booking.loading()) void this.refresh();
    }, 30000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(clock);
      clearInterval(refresh);
    });
  }

  async refresh() {
    if (this.booking.loading()) return;
    try {
      await this.booking.refresh();
    } catch {
      /* BookingService provides the visible error. */
    }
    this.now.set(Date.now());
  }

  group(hold: BookingHold): HoldTab {
    const live = Date.parse(hold.expiresAt || '') > this.now();
    if (hold.apiStatus === 'ACTIVE' && live) return 'active';
    if (hold.apiStatus === 'PAYMENT_PENDING' && live) return 'pending';
    return 'history';
  }

  status(hold: BookingHold) {
    if (
      ['ACTIVE', 'PAYMENT_PENDING'].includes(hold.apiStatus || '') &&
      this.group(hold) === 'history'
    )
      return 'Đã hết hạn';
    return this.booking.label(hold.apiStatus || hold.status);
  }

  remaining(hold: BookingHold) {
    const minutes = Math.max(0, Math.ceil((Date.parse(hold.expiresAt || '') - this.now()) / 60000));
    const hours = Math.floor(minutes / 60);
    return hours ? `${hours} giờ ${minutes % 60} phút` : `${minutes} phút`;
  }
}
