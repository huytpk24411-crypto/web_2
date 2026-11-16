import { ChangeDetectorRef, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Room, canScheduleViewing } from '../../classes/Room';
import { RoomTour } from '../../classes/RoomTour';
import { AuthService } from '../../services/auth-service';
import { FavoriteService } from '../../services/favorite-service';
import { RoomService } from '../../services/room-service';
import { ViewingService } from '../../services/viewing-service';
import { apiMessage } from '../../services/api-message';
import { HoldPolicyService } from '../../services/hold-policy-service';
@Component({
  selector: 'app-customer-room-detail',
  standalone: false,
  templateUrl: './customer-room-detail.html',
  styleUrls: ['./customer-room-detail.css'],
})
export class CustomerRoomDetailComponent {
  rooms = inject(RoomService);
  favorites = inject(FavoriteService);
  auth = inject(AuthService);
  viewings = inject(ViewingService);
  readonly addingToCart = signal(false);
  readonly cartError = signal('');
  readonly policyOpen = signal(false);
  readonly canView = canScheduleViewing;
  private holdPolicy = inject(HoldPolicyService);
  private cdr = inject(ChangeDetectorRef);
  route = inject(ActivatedRoute);
  router = inject(Router);
  private currentRoom = signal<(Room & { tour?: RoomTour }) | undefined>(undefined);
  get room() {
    return this.currentRoom();
  }
  set room(value: (Room & { tour?: RoomTour }) | undefined) {
    this.currentRoom.set(value);
  }
  readonly loadError = signal('');
  private loadingState = signal(true);
  get loading() {
    return this.loadingState();
  }
  set loading(value: boolean) {
    this.loadingState.set(value);
  }
  galleryOpen = false;
  tourOpen = false;
  get tour() {
    return this.room?.tour;
  }
  activeImage = 0;
  readonly toast = signal('');
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
      this.loadError.set('');
      this.tourOpen = false;
      this.policyOpen.set(false);
      this.room = undefined;
      this.activeImage = 0;
      this.loading = true;
      void this.rooms
        .getFromApi(id)
        .then((room) => {
          if (this.roomId === id) {
            this.room = room;
            this.handleFavoriteRequest();
            this.cdr.markForCheck();
          }
        })
        .catch((error) => {
          if (this.roomId === id) {
            this.loadError.set(apiMessage(error, 'Không tải được phòng.'));
            this.room = undefined;
            this.cdr.markForCheck();
          }
        })
        .finally(() => {
          if (this.roomId === id) {
            this.loading = false;
            this.cdr.markForCheck();
          }
        });
      this.cdr.markForCheck();
    });
    this.route.queryParams.pipe(takeUntilDestroyed()).subscribe((p) => {
      this.handleFavoriteRequest(p['action']);
    });
  }
  private async handleFavoriteRequest(action = this.route.snapshot.queryParamMap.get('action')) {
    if (action !== 'favorite' || !this.room || this.auth.account()?.role !== 'CUSTOMER') return;
    try {
      await this.favorites.save(this.room.id, true);
      this.toast.set('Đã thêm phòng vào danh sách yêu thích.');
    } catch (error) {
      this.toast.set(apiMessage(error, 'Không lưu được phòng yêu thích.'));
    }
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
      this.router.navigate(['/login'], {
        queryParams: {
          returnUrl: this.router.url,
          roomId: this.room.id,
          action: 'favorite',
        },
      });
  }
  go(action: 'booking' | 'viewing') {
    if (
      !this.room ||
      (action === 'booking' ? this.room.status !== 'AVAILABLE' : !canScheduleViewing(this.room))
    )
      return;
    if (action === 'booking' && this.auth.account()?.role === 'CUSTOMER') {
      this.policyOpen.set(true);
      return;
    }
    const target = action === 'booking' ? '/bookings/new' : '/viewings/new';
    if (this.auth.account()?.role === 'CUSTOMER')
      this.router.navigate([target], { queryParams: { roomId: this.room.id } });
    else
      this.router.navigate(['/login'], {
        queryParams: {
          returnUrl: target + '?roomId=' + this.room.id,
          roomId: this.room.id,
          action,
        },
      });
  }
  acceptHoldPolicy() {
    if (!this.room || this.room.status !== 'AVAILABLE') return;
    this.holdPolicy.accept(this.room.id);
    this.policyOpen.set(false);
    void this.router.navigate(['/bookings/new'], { queryParams: { roomId: this.room.id } });
  }
  async addToViewingCart() {
    if (!this.room || this.addingToCart()) return;
    this.addingToCart.set(true);
    this.cartError.set('');
    try {
      await this.viewings.addToCart(this.room.id);
      this.toast.set('Đã thêm phòng vào danh sách xem.');
    } catch (error) {
      this.cartError.set(
        apiMessage(error, 'Không thêm được phòng vào danh sách xem. Vui lòng thử lại.'),
      );
    } finally {
      this.addingToCart.set(false);
    }
  }
  get related() {
    return this.rooms
      .rooms()
      .filter((r) => r.id !== this.room?.id)
      .slice(4, 8);
  }
}
