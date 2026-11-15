import { Component, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
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
  private http = inject(HttpClient);
  private profile = signal<{
    owner: string;
    value: { avatar: string; position: string; fullName: string };
  } | null>(null);
  readonly profileError = signal('');
  readonly profileLoading = signal(false);
  readonly notificationOpen = signal(false);
  private version = 0;
  constructor() {
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
        this.http.get<{ avatar: string; position: string; fullName: string }>('/data/me/employee', {
          withCredentials: true,
          timeout: 10000,
        }),
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
