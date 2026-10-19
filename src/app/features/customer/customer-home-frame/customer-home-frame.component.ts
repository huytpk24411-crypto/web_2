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
import { RoomSearchService } from '../../../services/room-search.service';
import { LocationService } from '../../../services/location.service';
@Component({
  selector: 'app-customer-home-frame',
  standalone: false,
  templateUrl: './customer-home-frame.component.html',
  styleUrls: ['./customer-home-frame.component.css'],
})
export class CustomerHomeFrameComponent {
  rooms = inject(RoomService);
  search = inject(RoomSearchService);
  locations = inject(LocationService);
  get hot() {
    return this.search
      .results()
      .filter((r) => r.featured)
      .slice(0, 4);
  }
  get all() {
    return this.search
      .results()
      .filter((r) => !r.featured)
      .slice(0, 8);
  }
  get buildings() {
    return this.locations.properties()
      .filter((p) => this.rooms.rooms().some((r) => r.propertyId === p.id))
      .slice(0, 4);
  }
  count(propertyId: string) {
    return this.rooms.rooms().filter((r) => r.propertyId === propertyId && r.status === 'AVAILABLE')
      .length;
  }
}
