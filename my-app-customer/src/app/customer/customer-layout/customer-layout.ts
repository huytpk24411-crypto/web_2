import {
  Component,
  ElementRef,
  HostListener,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth-service';
import { FavoriteService } from '../../services/favorite-service';
import { NotificationService } from '../../services/notification-service';
@Component({
  selector: 'app-customer-layout',
  standalone: false,
  templateUrl: './customer-layout.html',
  styleUrls: ['./customer-layout.css'],
})
export class CustomerLayoutComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  favorites = inject(FavoriteService);
  notifications = inject(NotificationService);
  readonly notificationsOpen = signal(false);
  readonly accountOpen = signal(false);
  readonly isHome = signal(false);
  readonly headerLight = signal(true);
  readonly headerHidden = signal(false);
  @ViewChild('header') private header?: ElementRef<HTMLElement>;
  @ViewChild('accountToggle') private accountToggle?: ElementRef<HTMLButtonElement>;
  @ViewChild('notificationToggle') private notificationToggle?: ElementRef<HTMLButtonElement>;
  private router = inject(Router);
  private zone = inject(NgZone);
  private routeSubscription?: Subscription;
  private motion?: MediaQueryList;
  private previousY = 0;
  private direction = 0;
  private distance = 0;
  private reverseDistance = 0;
  private readonly onScroll = () => this.updateScroll();
  private readonly onMotionChange = () => {
    if (this.motion?.matches) this.setHidden(false);
  };

  ngOnInit() {
    this.motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.syncRoute();
    this.routeSubscription = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.accountOpen.set(false);
        this.notificationsOpen.set(false);
        this.syncRoute();
      }
    });
    this.zone.runOutsideAngular(() => {
      window.addEventListener('scroll', this.onScroll, { passive: true });
      this.motion?.addEventListener('change', this.onMotionChange);
    });
  }

  ngOnDestroy() {
    window.removeEventListener('scroll', this.onScroll);
    this.motion?.removeEventListener('change', this.onMotionChange);
    this.routeSubscription?.unsubscribe();
  }

  private syncRoute() {
    this.isHome.set(this.router.url.split(/[?#]/)[0] === '/');
    this.previousY = Math.max(0, window.scrollY);
    this.distance = 0;
    this.reverseDistance = 0;
    this.direction = 0;
    this.headerLight.set(!this.isHome() || this.previousY > 24);
    this.setHidden(false);
  }

  private setHidden(hidden: boolean) {
    if (this.headerHidden() !== hidden) this.zone.run(() => this.headerHidden.set(hidden));
  }

  private updateScroll() {
    const y = Math.max(0, window.scrollY);
    const delta = y - this.previousY;
    this.previousY = y;
    const light = !this.isHome() || (y <= 24 ? false : y > 72 ? true : this.headerLight());
    if (light !== this.headerLight()) this.zone.run(() => this.headerLight.set(light));
    if (
      y <= 160 ||
      this.motion?.matches ||
      this.accountOpen() ||
      this.notificationsOpen() ||
      this.header?.nativeElement.contains(document.activeElement)
    ) {
      this.distance = 0;
      this.reverseDistance = 0;
      this.direction = 0;
      this.setHidden(false);
      return;
    }
    // Accumulate slow scrolling too; a reversal needs 3px to reject jitter.
    if (!delta) return;
    const direction = Math.sign(delta);
    if (!this.direction || direction === this.direction) {
      this.distance += Math.abs(delta);
      this.direction = direction;
      this.reverseDistance = 0;
    } else {
      this.reverseDistance += Math.abs(delta);
      if (this.reverseDistance < 3) return;
      this.distance = this.reverseDistance;
      this.direction = direction;
      this.reverseDistance = 0;
    }
    if (this.direction > 0 && this.distance >= 16) this.setHidden(true);
    if (this.direction < 0 && this.distance >= 12) this.setHidden(false);
  }

  showHeader() {
    this.distance = 0;
    this.reverseDistance = 0;
    this.direction = 0;
    this.setHidden(false);
  }

  toggleAccount() {
    this.accountOpen.update((open) => !open);
    this.notificationsOpen.set(false);
    this.showHeader();
  }

  closeAccount() {
    if (!this.accountOpen()) return;
    this.accountOpen.set(false);
    this.accountToggle?.nativeElement.focus();
  }

  closeNotifications() {
    this.notificationsOpen.set(false);
    this.notificationToggle?.nativeElement.focus();
  }

  @HostListener('document:click', ['$event'])
  closeOutside(event: MouseEvent) {
    if (!(event.target instanceof Node)) return;
    const account = this.accountToggle?.nativeElement.parentElement;
    if (this.accountOpen() && !account?.contains(event.target)) this.closeAccount();
  }

  @HostListener('document:keydown.escape')
  closePanels() {
    this.closeAccount();
    if (this.notificationsOpen()) this.closeNotifications();
  }
  // Đăng nhập từ header xong sẽ quay lại đúng trang đang xem.
  get currentUrl() {
    return this.router.url;
  }
  toggleNotifications() {
    this.accountOpen.set(false);
    this.showHeader();
    this.notificationsOpen.update((open) => !open);
    if (this.notificationsOpen()) void this.notifications.refresh();
  }
  async logout() {
    if (!(await this.auth.logout())) return;
    this.router.navigate(['/']);
  }
}
