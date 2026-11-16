import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  ViewChild,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { EmployeeProfileAPIService } from '../../services/employee-profile-apiservice';
import { EmployeeProfile } from '../../classes/EmployeeProfile';
import { firstValueFrom } from 'rxjs';
import { apiMessage } from '../../services/api-message';
import { NotificationService } from '../../services/notification-service';
import { AuthService } from '../../services/auth-service';
@Component({
  selector: 'app-employee-layout',
  standalone: false,
  templateUrl: './employee-layout.html',
  styleUrls: ['./employee-layout.css'],
})
export class EmployeeLayoutComponent {
  auth = inject(AuthService);
  private router = inject(Router);
  notifications = inject(NotificationService);
  private profileApi = inject(EmployeeProfileAPIService);
  private profile = signal<{
    owner: string;
    value: EmployeeProfile;
  } | null>(null);
  readonly profileError = signal('');
  readonly profileLoading = signal(false);
  readonly notificationOpen = signal(false);
  @ViewChild('notificationToggle') private notificationToggle?: ElementRef<HTMLButtonElement>;
  private element = inject(ElementRef<HTMLElement>);
  private destroyRef = inject(DestroyRef);
  toggleNotifications() {
    this.notificationOpen.update((open) => !open);
    if (this.notificationOpen()) void this.notifications.refresh();
  }
  closeNotifications() {
    this.notificationOpen.set(false);
    this.notificationToggle?.nativeElement.focus();
  }
  @HostListener('document:keydown.escape') onEscape() {
    if (this.notificationOpen()) this.closeNotifications();
  }
  @HostListener('document:click', ['$event']) onOutsideClick(event: MouseEvent) {
    const panel = this.element.nativeElement.querySelector('.employee-notifications');
    if (this.notificationOpen() && event.target instanceof Node && !panel?.contains(event.target))
      this.notificationOpen.set(false);
  }
  private version = 0;
  constructor() {
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (event instanceof NavigationEnd) this.notificationOpen.set(false);
    });
    effect(() => {
      const account = this.auth.account();
      const authenticated = this.auth.serverAuthenticated();
      const version = ++this.version;
      this.profile.set(null);
      this.profileError.set('');
      this.profileLoading.set(!!account && authenticated);
      if (account && authenticated) void this.loadProfile(account.id, version);
    });
  }
  private async loadProfile(owner: string, version: number) {
    try {
      const value = await firstValueFrom(
        this.profileApi.getProfile(),
      );
      if (owner === this.auth.account()?.id && version === this.version)
        this.profile.set({ owner, value });
    } catch (error) {
      if (owner === this.auth.account()?.id && version === this.version)
        this.profileError.set(apiMessage(error, 'Không tải được hồ sơ nhân viên.'));
    } finally {
      if (version === this.version) this.profileLoading.set(false);
    }
  }
  get employee() {
    return this.auth.serverAuthenticated() && this.profile()?.owner === this.auth.account()?.id
      ? this.profile()?.value
      : null;
  }
  get attendanceActive() {
    return /^\/employee\/shifts(?:\/[^/]+\/(?:check-in|tasks|check-out))?\/?$/.test(
      this.router.url.split(/[?#]/)[0],
    );
  }
  get depositActive() {
    return this.router.isActive('/employee/deposits', false);
  }
  get dealActive() {
    return this.router.isActive('/employee/deals', false);
  }
  // Chờ server hủy phiên rồi mới mở trang đăng nhập (nếu không GuestGuard sẽ đưa ngược về khu vực cũ).
  async logout() {
    if (await this.auth.logout()) await this.router.navigate(['/login']);
  }
}
