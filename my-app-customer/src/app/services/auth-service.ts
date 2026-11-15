import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CookieService } from 'ngx-cookie-service';
import { Account, Role } from '../classes/Account';
import { PHONE_PATTERN } from '../shared/validators';
import { AuthAPIService } from './auth-apiservice';
import { apiMessage } from './api-message';
import { REMEMBER_COOKIE } from '../portal';
@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(AuthAPIService);
  private cookieService = inject(CookieService);
  readonly account = signal<Account | null>(null);
  readonly serverAuthenticated = signal(false);
  readonly error = signal('');
  readonly isEmployee = computed(
    () => this.serverAuthenticated() && this.account()?.role === 'EMPLOYEE',
  );
  private sessionRestore?: Promise<void>;
  private version = 0;
  private authPhoneDraft: string | undefined;
  getAuthPhoneDraft(): string | undefined {
    return this.authPhoneDraft;
  }
  rememberAuthPhone(value: string): void {
    const phone = value.trim();
    this.authPhoneDraft = PHONE_PATTERN.test(phone) ? phone : '';
  }
  private serverAccount(value: unknown): Account | null {
    if (!value || typeof value !== 'object') return null;
    const user = value as Record<string, unknown>;
    if (
      typeof user['id'] !== 'string' ||
      !user['id'] ||
      typeof user['phone'] !== 'string' ||
      !PHONE_PATTERN.test(user['phone']) ||
      typeof user['name'] !== 'string' ||
      !user['name'].trim() ||
      !['ADMIN', 'EMPLOYEE', 'CUSTOMER'].includes(String(user['role']))
    )
      return null;
    return {
      id: user['id'],
      phone: user['phone'],
      name: user['name'],
      role: user['role'] as Role,
      username:
        typeof user['username'] === 'string' && user['username'] ? user['username'] : user['phone'],
    };
  }
  getRememberedPhone(): string {
    return this.cookieService.get(REMEMBER_COOKIE);
  }
  async login(identifier: string, password: string, rememberMe = false): Promise<boolean> {
    if (this.serverAuthenticated()) return false;
    const version = ++this.version;
    this.error.set('');
    const result = await firstValueFrom(this.api.login(identifier.trim(), password, rememberMe));
    const account = this.serverAccount(result.user);
    if (!account) throw new Error('Phản hồi đăng nhập không hợp lệ. Vui lòng thử lại.');
    if (version !== this.version) return false;
    this.setSession(account);
    if (rememberMe && account.phone)
      this.cookieService.set(REMEMBER_COOKIE, account.phone, 30, '/');
    else this.cookieService.delete(REMEMBER_COOKIE, '/');
    return true;
  }
  async registerApi(name: string, phone: string, password: string): Promise<boolean> {
    if (this.serverAuthenticated()) return false;
    const version = ++this.version;
    this.error.set('');
    const result = await firstValueFrom(
      this.api.register(phone.trim().replace(/^\+84/, '0'), password, name.trim()),
    );
    const account = this.serverAccount(result.user);
    if (!account) throw new Error('Phản hồi đăng ký không hợp lệ. Vui lòng đăng nhập lại.');
    if (version !== this.version) return false;
    this.setSession(account);
    return true;
  }
  restoreApiSession(): Promise<void> {
    if (!this.sessionRestore) {
      const version = this.version;
      this.sessionRestore = firstValueFrom(this.api.profile())
        .then((user) => {
          if (version !== this.version) return;
          const account = this.serverAccount(user);
          if (!account) throw new Error('Phản hồi phiên đăng nhập không hợp lệ.');
          this.setSession(account);
        })
        .catch((error: unknown) => {
          if (version !== this.version) return;
          this.clearSession();
          if (!(error && typeof error === 'object' && 'status' in error && error.status === 401))
            this.error.set(apiMessage(error, 'Không tải được phiên đăng nhập. Vui lòng thử lại.'));
        });
    }
    return this.sessionRestore;
  }
  private setSession(account: Account): void {
    this.account.set(account);
    this.serverAuthenticated.set(true);
    // Cached display information is never read to authorize a session.
    try {
      sessionStorage.setItem('ihouzz-session', JSON.stringify(account));
    } catch {}
  }
  invalidateSession(): void {
    const wasAuthenticated = this.serverAuthenticated();
    ++this.version;
    this.clearSession();
    this.sessionRestore = undefined;
    if (wasAuthenticated) this.error.set('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
  }
  private clearSession(): void {
    this.account.set(null);
    this.serverAuthenticated.set(false);
    try {
      sessionStorage.removeItem('ihouzz-session');
      sessionStorage.removeItem('ihouzz-session-source');
    } catch {}
  }
  async logout(): Promise<boolean> {
    const version = ++this.version;
    try {
      await firstValueFrom(this.api.logout());
      if (version === this.version) {
        this.clearSession();
        this.sessionRestore = undefined;
        this.error.set('');
      }
      return true;
    } catch (error) {
      this.error.set(apiMessage(error, 'Không đăng xuất được. Vui lòng thử lại.'));
      return false;
    }
  }
  hasRole(roles: Role[]): boolean {
    return this.serverAuthenticated() && !!this.account() && roles.includes(this.account()!.role);
  }
  destination(returnUrl?: string | null): string {
    const role = this.account()?.role;
    const fallback =
      role === 'ADMIN' ? '/admin' : role === 'EMPLOYEE' ? '/employee/shifts/register' : '/';
    if (
      !returnUrl ||
      !returnUrl.startsWith('/') ||
      returnUrl.startsWith('//') ||
      /[\\\r\n]/.test(returnUrl)
    )
      return fallback;
    const path = returnUrl.split('?')[0];
    const publicPath = /^\/$|^\/rooms(?:\/[^/]+)?$/.test(path);
    const customerPath =
      /^\/favorites$|^\/bookings\/new$|^\/bookings\/[^/]+\/receipt$|^\/viewings\/new$/.test(path);
    const employeePath =
      /^\/employee\/(?:shifts(?:\/register|\/[^/]+\/(?:check-in|tasks|check-out))?|payroll|deposits\/(?:new|[^/]+\/(?:qr-receipt|cash-receipt))|deals\/[^/]+(?:\/forfeiture)?)$/.test(
        path,
      );
    const adminPath =
      /^\/admin(?:\/(?:rooms(?:\/new(?:\/duplicate)?|\/[^/]+\/(?:edit|images))?|staff(?:\/new|\/schedule|\/performance|\/[^/]+(?:\/edit|\/success)?)?|reports|approvals|payroll))?$/.test(
        path,
      );
    return ((publicPath || /^\/(?:about|contact)$/.test(path)) && role === 'CUSTOMER') ||
      (customerPath && role === 'CUSTOMER') ||
      (employeePath && this.isEmployee()) ||
      (adminPath && role === 'ADMIN')
      ? returnUrl
      : fallback;
  }
}

export const sessionInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  return next(request).pipe(
    catchError((error) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        request.url !== '/user-login' &&
        request.url !== '/user-register'
      )
        auth.invalidateSession();
      return throwError(() => error);
    }),
  );
};
