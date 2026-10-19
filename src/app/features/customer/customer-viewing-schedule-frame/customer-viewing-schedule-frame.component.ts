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
  selector: 'app-customer-viewing-schedule-frame',
  standalone: false,
  templateUrl: './customer-viewing-schedule-frame.component.html',
  styleUrls: ['./customer-viewing-schedule-frame.component.css'],
})
export class CustomerViewingScheduleFrameComponent {
  rooms = inject(RoomService);
  viewings = inject(ViewingService);
  auth = inject(AuthService);
  route = inject(ActivatedRoute);
  assets = ASSETS;
  private fb = inject(FormBuilder);
  selected: string[] = [];
  error = '';
  success = '';
  form = this.fb.nonNullable.group({
    name: [this.auth.account()?.name || '', Validators.required],
    phone: [
      this.auth.account()?.phone || '',
      [Validators.required, Validators.pattern(PHONE_PATTERN)],
    ],
    at: ['', [Validators.required, futureDate]],
    note: [''],
  });
  constructor() {
    const id = this.route.snapshot.queryParamMap.get('roomId');
    if (id && this.rooms.get(id)?.status === 'AVAILABLE') this.selected = [id];
  }
  toggle(id: string) {
    this.selected = this.selected.includes(id)
      ? this.selected.filter((x) => x !== id)
      : [...this.selected, id];
  }
  get firstRoom() {
    return this.rooms.get(this.selected[0]);
  }
  get available() {
    return this.rooms.rooms().filter((r) => r.status === 'AVAILABLE');
  }
  submit() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    try {
      const result = this.viewings.create({ ...this.form.getRawValue(), roomIds: this.selected });
      this.success = result.id;
      this.error = '';
    } catch (e) {
      this.error = (e as Error).message;
    }
  }
  cancel(id: string) {
    this.viewings.cancel(id);
  }
}
