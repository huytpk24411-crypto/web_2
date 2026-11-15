import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { AuthService } from '../services/auth-service';
import { API_ACCOUNT } from '../testing/api-fixtures';
import { Role } from './Account';
import { AuthGuard } from './auth.guard';
import { RoleGuard } from './role.guard';
import { GuestGuard } from './guest.guard';
describe('Server session and roles', () => {
  let auth: AuthService, http: HttpTestingController;
  beforeEach(() => {
    sessionStorage.removeItem('ihouzz-session');
    sessionStorage.removeItem('ihouzz-session-source');
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('ignores forged browser privileges until profile completes', async () => {
    sessionStorage.setItem('ihouzz-session', JSON.stringify({ ...API_ACCOUNT, role: 'ADMIN' }));
    sessionStorage.setItem('ihouzz-session-source', 'server');
    const fresh = TestBed.runInInjectionContext(() => new AuthService());
    expect(fresh.account()).toBeNull();
    expect(fresh.hasRole(['ADMIN'])).toBe(false);
    const pending = fresh.restoreApiSession();
    http.expectOne('/auth/profile').flush(JSON.stringify(API_ACCOUNT));
    await pending;
    expect(fresh.account()?.role).toBe('CUSTOMER');
    expect(fresh.hasRole(['ADMIN'])).toBe(false);
  });
  it.each([401, 503])(
    'clears cached and active authority when profile returns %s',
    async (status) => {
      auth.account.set({ ...API_ACCOUNT, role: 'ADMIN' });
      auth.serverAuthenticated.set(true);
      const pending = auth.restoreApiSession();
      for (let i = 0; i < 2; i++)
        http.expectOne('/auth/profile').flush('{}', { status, statusText: 'Rejected' });
      await pending;
      expect(auth.account()).toBeNull();
      expect(auth.serverAuthenticated()).toBe(false);
      expect(sessionStorage.getItem('ihouzz-session')).toBeNull();
      if (status === 503)
        expect(auth.error()).toBe('Không kết nối được máy chủ. Vui lòng thử lại.');
    },
  );
  for (const role of ['ADMIN', 'EMPLOYEE', 'CUSTOMER'] as Role[])
    for (const required of ['ADMIN', 'EMPLOYEE', 'CUSTOMER'] as Role[]) {
      it(role + ' can access only ' + required, async () => {
        const pending = auth.restoreApiSession();
        http.expectOne('/auth/profile').flush(JSON.stringify({ ...API_ACCOUNT, role }));
        await pending;
        const route = new ActivatedRouteSnapshot();
        route.data = { roles: [required] };
        Object.defineProperty(route, 'pathFromRoot', { value: [route] });
        const result = TestBed.runInInjectionContext(() =>
          RoleGuard(route, { url: '/protected' } as RouterStateSnapshot),
        );
        if (role === required) expect(result).toBe(true);
        else expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/access-denied');
      });
    }
  it('keeps returnUrl for guests and does not redirect a guest from login', () => {
    const result = TestBed.runInInjectionContext(() =>
      AuthGuard(
        {} as ActivatedRouteSnapshot,
        { url: '/rooms/phong-48?x=1' } as RouterStateSnapshot,
      ),
    );
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe(
      '/login?returnUrl=%2Frooms%2Fphong-48%3Fx%3D1',
    );
    expect(
      TestBed.runInInjectionContext(() =>
        GuestGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
      ),
    ).toBe(true);
  });
  it('does not restore authority after logout during a pending profile read', async () => {
    const profile = auth.restoreApiSession();
    const req = http.expectOne('/auth/profile');
    const logout = auth.logout();
    http.expectOne('/auth/logout').flush('{}');
    await logout;
    req.flush(JSON.stringify(API_ACCOUNT));
    await profile;
    expect(auth.account()).toBeNull();
  });
  it('blocks unsafe and cross-role return URLs', async () => {
    const pending = auth.restoreApiSession();
    http.expectOne('/auth/profile').flush(JSON.stringify({ ...API_ACCOUNT, role: 'ADMIN' }));
    await pending;
    for (const url of ['//evil.test', '/rooms', '/employee/shifts', 'https://evil.test'])
      expect(auth.destination(url)).toBe('/admin');
    expect(auth.destination('/admin/staff')).toBe('/admin/staff');
  });
});
