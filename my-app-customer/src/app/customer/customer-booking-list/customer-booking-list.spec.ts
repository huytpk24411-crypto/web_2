import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BookingService } from '../../services/booking-service';
import { RoomService } from '../../services/room-service';
import { BookingHold } from '../../classes/Booking';
import { API_ROOMS } from '../../testing/api-fixtures';
import { CustomerModule } from '../customer-module';
import { CustomerBookingListComponent } from './customer-booking-list';

describe('CustomerBookingListComponent', () => {
  const now = Date.parse('2026-11-17T08:00:00+07:00');
  const records = signal<BookingHold[]>([]);
  const refresh = vi.fn().mockResolvedValue(undefined);
  const hold = (
    id: string,
    apiStatus: BookingHold['apiStatus'],
    expiresAt: number,
  ): BookingHold => ({
    id,
    number: id,
    customerId: 'customer-test',
    roomId: API_ROOMS[2].id,
    name: 'Khách kiểm thử',
    phone: '0901234567',
    amount: 10000,
    status: 'CONFIRMED',
    apiStatus,
    createdAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
  });

  beforeEach(async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    records.set([
      hold('GC-active', 'ACTIVE', now + 48 * 3600000),
      hold('GC-pending', 'PAYMENT_PENDING', now + 15 * 60000),
      hold('GC-converted', 'CONVERTED', now + 3600000),
      hold('GC-expired', 'EXPIRED', now - 1000),
    ]);
    await TestBed.configureTestingModule({
      imports: [CustomerModule],
      providers: [
        provideRouter([]),
        {
          provide: BookingService,
          useValue: {
            list: () => records(),
            refresh,
            loading: signal(false),
            error: signal(''),
            label: BookingService.prototype.label,
          },
        },
        { provide: RoomService, useValue: { forRecord: () => API_ROOMS[2] } },
      ],
    }).compileComponents();
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('separates active, pending and historical records and handles the exact deadline', async () => {
    const fixture = TestBed.createComponent(CustomerBookingListComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;
    expect(component.grouped().active.map((h) => h.id)).toEqual(['GC-active']);
    expect(component.grouped().pending.map((h) => h.id)).toEqual(['GC-pending']);
    expect(component.grouped().history).toHaveLength(2);
    component.now.set(now + 48 * 3600000);
    expect(component.grouped().active).toHaveLength(0);
    expect(component.grouped().pending).toHaveLength(0);
    expect(component.status(records()[0])).toBe('Đã hết hạn');
  });

  it('filters by booking number and clears cards when the account records disappear', async () => {
    const fixture = TestBed.createComponent(CustomerBookingListComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.query.set('GC-active');
    expect(component.visible()).toHaveLength(1);
    component.query.set('unknown');
    expect(component.visible()).toHaveLength(0);
    component.query.set('');
    records.set([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.hold-card')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Bạn chưa có phòng đang giữ chỗ');
  });
});
