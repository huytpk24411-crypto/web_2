import { Component, ElementRef, HostListener, inject, ViewChild } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../services/auth.service';
import { DemoStore } from '../../services/demo-store.service';
import { AdminDashboardDemoService } from '../../services/admin-dashboard-demo.service';

@Component({
  selector: 'app-admin-layout',
  standalone: false,
  templateUrl: './admin-layout.component.html',
  styleUrls: ['./admin-layout.component.css'],
})
export class AdminLayoutComponent {
  auth = inject(AuthService);
  store = inject(DemoStore);
  dashboardDemo = inject(AdminDashboardDemoService);
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
  showDemo(section: string) {
    this.closeMenu();
    this.router.navigate([section === 'approvals' ? '/admin/approvals' : '/admin/payroll']);
  }
  closeMenu() {
    this.menuOpen = false;
    this.menuToggle?.nativeElement.focus();
  }
  @HostListener('document:keydown.escape') escape() {
    if (this.menuOpen) this.closeMenu();
    this.notificationsOpen = false;
  }
  logout() {
    this.auth.logout();
    this.router.navigate(['/']);
  }
}
