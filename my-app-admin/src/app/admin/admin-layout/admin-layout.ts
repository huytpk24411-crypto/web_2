import { Component, ElementRef, HostListener, inject, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { AdminDashboardAPI } from '../../services/admin-dashboard-apiservice';
import { NotificationService } from '../../services/notification-service';
import { AuthService } from '../../services/auth-service';

@Component({
  selector: 'app-admin-layout',
  standalone: false,
  templateUrl: './admin-layout.html',
  styleUrls: ['./admin-layout.css'],
})
export class AdminLayoutComponent {
  auth = inject(AuthService);
  summaryApi = inject(AdminDashboardAPI);
  notifications = inject(NotificationService);
  private router = inject(Router);
  @ViewChild('menuToggle') menuToggle?: ElementRef<HTMLButtonElement>;
  menuOpen = false;
  notificationsOpen = false;
  toast = '';
  constructor() {
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.menuOpen = false;
        this.notificationsOpen = false;
        void this.summaryApi.refresh();
      }
    });
  }
  get initials(): string {
    return (this.auth.account()?.name || 'Admin')
      .split(' ')
      .slice(-2)
      .map((part) => part[0])
      .join('');
  }
  find(q: string) {
    if (!q.trim()) {
      this.toast = 'Nhập mã hoặc tên phòng để tìm trong danh sách phòng.';
      return;
    }
    this.router.navigate(['/admin/rooms'], { queryParams: { q: q.trim() } });
  }
  openSection(section: string) {
    this.closeMenu();
    this.router.navigate([section === 'approvals' ? '/admin/approvals' : '/admin/payroll']);
  }
  openNotifications() {
    this.notificationsOpen = true;
    void this.notifications.refresh();
  }
  closeMenu() {
    this.menuOpen = false;
    this.menuToggle?.nativeElement.focus();
  }
  @HostListener('document:keydown.escape') escape() {
    if (this.menuOpen) this.closeMenu();
    this.notificationsOpen = false;
  }
  // Chờ server hủy phiên rồi mới mở trang đăng nhập (nếu không GuestGuard sẽ đưa ngược về khu vực cũ).
  async logout() {
    if (await this.auth.logout()) await this.router.navigate(['/login']);
  }
}
