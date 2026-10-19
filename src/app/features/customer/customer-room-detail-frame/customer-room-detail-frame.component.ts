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
  selector: 'app-customer-room-detail-frame',
  standalone: false,
  templateUrl: './customer-room-detail-frame.component.html',
  styleUrls: ['./customer-room-detail-frame.component.css'],
})
export class CustomerRoomDetailFrameComponent {
  rooms = inject(RoomService);
  favorites = inject(FavoriteService);
  auth = inject(AuthService);
  route = inject(ActivatedRoute);
  router = inject(Router);
  assets = ASSETS;
  room?: Room;
  loading = true;
  galleryOpen = false;
  activeImage = 0;
  toast = '';
  private roomId = '';
  get backUrl() {
    const from = this.route.snapshot.queryParamMap.get('from') || '';
    try {
      const url = new URL(from, 'http://ihouzz.local');
      if (
        from.startsWith('/') &&
        !from.startsWith('//') &&
        !from.includes('\\') &&
        url.origin === 'http://ihouzz.local' &&
        ['/', '/rooms'].includes(url.pathname)
      )
        return url.pathname + url.search;
    } catch {}
    return '/rooms';
  }
  constructor() {
    this.route.params.pipe(takeUntilDestroyed()).subscribe((p) => {
      const id = String(p['id']);
      this.roomId = id;
      this.room = this.rooms.get(id);
      this.activeImage = 0;
      if (!this.room) {
        this.loading = true;
        void this.rooms.getFromApi(id).then((room) => {
          if (this.roomId === id) {
            this.room = room;
            this.handleFavoriteRequest();
          }
        }).catch(() => {
          if (this.roomId === id) this.room = undefined;
        }).finally(() => {
          if (this.roomId === id) this.loading = false;
        });
      } else this.loading = false;
    });
    this.route.queryParams.pipe(takeUntilDestroyed()).subscribe((p) => {
      this.handleFavoriteRequest(p['action']);
    });
  }
  private handleFavoriteRequest(action = this.route.snapshot.queryParamMap.get('action')) {
    if (action !== 'favorite' || !this.room || this.auth.account()?.role !== 'CUSTOMER') return;
    if (!this.favorites.has(this.room.id)) this.favorites.toggle(this.room.id);
    this.toast = 'Đã thêm phòng vào danh sách yêu thích.';
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { action: null, roomId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
  favorite() {
    if (!this.room) return;
    if (this.auth.account()?.role === 'CUSTOMER') this.favorites.toggle(this.room.id);
    else
      this.router.navigate(['/register'], {
        queryParams: {
          returnUrl: this.router.url,
          roomId: this.room.id,
          action: 'favorite',
        },
      });
  }
  go(action: 'booking' | 'viewing') {
    if (!this.room) return;
    const target = action === 'booking' ? '/bookings/new' : '/viewings/new';
    if (this.auth.account()?.role === 'CUSTOMER')
      this.router.navigate([target], { queryParams: { roomId: this.room.id } });
    else
      this.router.navigate(['/register'], {
        queryParams: {
          returnUrl: target + '?roomId=' + this.room.id,
          roomId: this.room.id,
          action,
        },
      });
  }
  get related() {
    return this.rooms
      .rooms()
      .filter((r) => r.id !== this.room?.id)
      .slice(4, 8);
  }
}
