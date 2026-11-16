import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BackNavigationService } from './back-navigation-service';
@Component({
  selector: 'app-back-navigation',
  standalone: false,
  templateUrl: './back-navigation.html',
  styleUrls: ['./back-navigation.css'],
})
export class BackNavigationComponent {
  private router = inject(Router);
  private navigation = inject(BackNavigationService);
  get url() {
    return this.router.url.split(/[?#]/)[0].replace(/\/$/, '') || '/';
  }
  get visible() {
    return !['/', '/admin', '/employee', '/employee/shifts/register'].includes(this.url);
  }
  get fallback() {
    const url = this.url;
    if (url.startsWith('/admin/staff/')) return '/admin/staff';
    if (url.startsWith('/admin/rooms/')) return '/admin/rooms';
    if (url.startsWith('/admin/catalog/')) return '/admin/catalog';
    if (url.startsWith('/admin')) return '/admin';
    if (url.startsWith('/employee/shifts/')) return '/employee/shifts';
    if (url.startsWith('/employee/deals/') || /\/deposits\/.+\/receipt$/.test(url))
      return '/employee/deals';
    if (url.startsWith('/employee')) return '/employee/shifts/register';
    if (url === '/forgot-password') return '/login';
    if (url.startsWith('/rooms/')) {
      const from = this.router.parseUrl(this.router.url).queryParams['from'];
      if (
        typeof from === 'string' &&
        from.startsWith('/') &&
        !from.startsWith('//') &&
        !from.includes('\\')
      ) {
        try {
          const parent = new URL(from, 'http://ihouzz.local');
          if (parent.origin === 'http://ihouzz.local' && ['/', '/rooms'].includes(parent.pathname))
            return parent.pathname + parent.search;
        } catch {}
      }
      return '/rooms';
    }
    if (url.startsWith('/bookings/')) return '/bookings';
    if (url === '/viewings/new') return '/rooms';
    return '/';
  }
  back() {
    this.navigation.back(this.fallback);
  }
}
