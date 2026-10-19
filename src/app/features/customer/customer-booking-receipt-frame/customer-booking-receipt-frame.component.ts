import { Component, inject, Input, Output, EventEmitter } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, Validators } from '@angular/forms';
import { RoomService } from '../../../services/room.service';
import { AuthService } from '../../../services/auth.service';
import { FavoriteService } from '../../../services/favorite.service';
import { BookingService } from '../../../services/booking.service';
import { ViewingService } from '../../../services/viewing.service';
import { DemoStore } from '../../../services/demo-store.service';
import { PHONE_PATTERN, futureDate } from '../../../shared/validators';
import { ASSETS } from '../../../data/assets';
import { Room } from '../../../models/domain';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
@Component({
  selector: 'app-customer-booking-receipt-frame',
  standalone: false,
  templateUrl: './customer-booking-receipt-frame.component.html',
  styleUrls: ['./customer-booking-receipt-frame.component.css'],
})
export class CustomerBookingReceiptFrameComponent {
  booking = inject(BookingService);
  rooms = inject(RoomService);
  store = inject(DemoStore);
  route = inject(ActivatedRoute);
  id = this.route.snapshot.paramMap.get('id') || '';
  constructor() {
    this.booking.expire();
  }
  get hold() {
    return this.booking.get(this.id);
  }
  get payment() {
    return this.store.state().payments.find((p) => p.id === this.hold?.paymentId);
  }
  get room() {
    return this.rooms.get(this.hold?.roomId || '');
  }
  print() {
    window.print();
  }
}
