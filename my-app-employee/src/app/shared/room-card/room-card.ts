import { Component, inject, Input, OnChanges, OnDestroy, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Room } from '../../classes/Room';
import { RoomTour } from '../../classes/RoomTour';
import { AuthService } from '../../services/auth-service';
import { FavoriteService } from '../../services/favorite-service';
import { RoomSearchService } from '../../services/room-search-service';
@Component({
  selector: 'app-room-card',
  standalone: false,
  templateUrl: './room-card.html',
  styleUrls: ['./room-card.css'],
})
export class RoomCardComponent implements OnDestroy, OnChanges {
  @Input({ required: true }) room!: Room & { tour?: RoomTour };
  get hasTour() {
    return !!this.room.tour;
  }
  favorites = inject(FavoriteService);
  auth = inject(AuthService);
  router = inject(Router);
  search = inject(RoomSearchService);
  get school() {
    const relation = this.search.rooms.locations.relations.find(
      (r) => r.propertyId === this.room.propertyId,
    );
    return relation ? this.search.rooms.locations.school(relation.schoolId) : undefined;
  }
  index = signal(0);
  previousIndex = signal(0);
  showPreviousPhoto = signal(false);
  previousPhotoVisible = signal(false);
  photoEntering = signal(false);
  private timer?: ReturnType<typeof setTimeout>;
  private photoTransition?: ReturnType<typeof setTimeout>;
  private previousPhotoCleanup?: ReturnType<typeof setTimeout>;
  private hovering = false;
  get from() {
    const path = this.router.url.split('?')[0];
    return path === '/' || path === '/rooms' ? this.router.url : '/rooms';
  }
  start() {
    this.stop();
    if (
      this.room.images.length < 2 ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !window.matchMedia('(hover: hover)').matches
    )
      return;
    this.hovering = true;
    this.scheduleNextPhoto();
  }
  stop() {
    this.hovering = false;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.clearPhotoTransition();
  }
  private scheduleNextPhoto() {
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.next();
    }, 2500);
  }
  private next() {
    this.changeImage((this.index() + 1) % this.room.images.length);
  }
  private changeImage(nextIndex: number) {
    const currentIndex = this.index();
    if (nextIndex === currentIndex) return;

    this.clearPhotoTransition();
    this.previousIndex.set(currentIndex);
    this.showPreviousPhoto.set(true);
    this.previousPhotoVisible.set(true);
    this.photoEntering.set(true);
    this.index.set(nextIndex);

    this.photoTransition = setTimeout(() => {
      this.photoEntering.set(false);
      this.previousPhotoVisible.set(false);
    }, 16);
    this.previousPhotoCleanup = setTimeout(() => {
      this.showPreviousPhoto.set(false);
      if (this.hovering) this.scheduleNextPhoto();
    }, 1516);
  }
  private clearPhotoTransition() {
    clearTimeout(this.timer);
    clearTimeout(this.photoTransition);
    clearTimeout(this.previousPhotoCleanup);
    this.timer = undefined;
    this.photoTransition = undefined;
    this.previousPhotoCleanup = undefined;
    this.showPreviousPhoto.set(false);
    this.previousPhotoVisible.set(false);
    this.photoEntering.set(false);
  }
  ngOnDestroy() {
    clearTimeout(this.timer);
    this.clearPhotoTransition();
  }
  ngOnChanges() {
    this.stop();
  }
  favorite() {
    if (this.auth.account()?.role === 'CUSTOMER') {
      this.favorites.toggle(this.room.id);
    } else {
      // Đăng nhập xong, trang đăng nhập lưu yêu thích rồi quay lại đúng trang đang xem.
      this.router.navigate(['/login'], {
        queryParams: { returnUrl: this.router.url, roomId: this.room.id, action: 'favorite' },
      });
    }
  }
}
