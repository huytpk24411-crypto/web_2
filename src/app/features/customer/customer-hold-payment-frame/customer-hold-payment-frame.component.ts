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
  selector: 'app-customer-hold-payment-frame',
  standalone: false,
  templateUrl: './customer-hold-payment-frame.component.html',
  styleUrls: ['./customer-hold-payment-frame.component.css'],
})
export class CustomerHoldPaymentFrameComponent {
  rooms = inject(RoomService);
  auth = inject(AuthService);
  booking = inject(BookingService);
  route = inject(ActivatedRoute);
  router = inject(Router);
  private fb = inject(FormBuilder);
  room = this.rooms.get(this.route.snapshot.queryParamMap.get('roomId') || '');
  pendingId = '';
  error = '';
  form = this.fb.nonNullable.group({
    name: [this.auth.account()?.name || '', Validators.required],
    phone: [
      this.auth.account()?.phone || '',
      [Validators.required, Validators.pattern(PHONE_PATTERN)],
    ],
    moveIn: ['', Validators.required],
    note: [''],
    terms: [false, Validators.requiredTrue],
  });
  submit() {
    this.form.markAllAsTouched();
    if (this.form.invalid || !this.room) return;
    try {
      const v = this.form.getRawValue();
      if (new Date(v.moveIn + 'T23:59:59').getTime() < Date.now()) {
        this.error = 'Ngày dự kiến nhận phòng không được ở quá khứ.';
        return;
      }
      this.pendingId = this.booking.create(this.room.id, v.name, v.phone, {
        moveIn: v.moveIn,
        note: v.note,
      }).id;
      this.error = '';
    } catch (e) {
      this.error = (e as Error).message;
    }
  }
  confirm() {
    try {
      this.booking.confirmDemo(this.pendingId);
      this.router.navigate(['/bookings', this.pendingId, 'receipt']);
    } catch (e) {
      this.error = (e as Error).message;
    }
  }
  get holds() {
    return this.booking.list();
  }
}
