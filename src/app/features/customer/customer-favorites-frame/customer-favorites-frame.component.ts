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
  selector: 'app-customer-favorites-frame',
  standalone: false,
  templateUrl: './customer-favorites-frame.component.html',
  styleUrls: ['./customer-favorites-frame.component.css'],
})
export class CustomerFavoritesFrameComponent {
  rooms = inject(RoomService);
  favorites = inject(FavoriteService);
  get saved() {
    return this.rooms.rooms().filter((r) => this.favorites.has(r.id));
  }
}
