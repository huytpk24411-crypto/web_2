import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Account, Role } from '../models/domain';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../data/mock-data';
import { uid } from './demo-store.service';
import { PHONE_PATTERN, USERNAME_PATTERN } from '../shared/validators';
@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  readonly account = signal<Account | null>(this.restore());
  readonly isEmployee = computed(() => ['EMPLOYEE', 'ADMIN'].includes(this.account()?.role || ''));
  private registrations: { account: Account; password: string }[] = [];
  private sessionRestore?: Promise<void>;
  private restore(): Account | null {
    try {
      const value = JSON.parse(sessionStorage.getItem('ihouzz-session') || 'null');
      return value &&
        ['CUSTOMER', 'EMPLOYEE', 'ADMIN'].includes(value.role) &&
        typeof value.id === 'string'
        ? value
        : null;
    } catch {
      return null;
    }
  }
  login(usernameValue: string, password: string): boolean {
    const username = usernameValue.trim().toLowerCase();
    const known = DEMO_ACCOUNTS.find((a) => a.username.toLowerCase() === username);
    const registered = this.registrations.find(
      (a) => a.account.username === username && a.password === password,
    );
    const account = known && password === DEMO_PASSWORD ? known : registered?.account;
    if (!account) return false;
    this.setSession(account);
    return true;
  }
  async loginApi(username: string, password: string): Promise<void> {
    const result = await firstValueFrom(
      this.http.post<{ user: Account }>(
        '/api/auth/login',
        { username, password },
        { withCredentials: true },
      ),
    );
    this.setSession(result.user);
  }
  register(username: string, name: string, phone: string, password: string): boolean {
    const normalizedUsername = username.trim().toLowerCase();
    const normalizedName = name.trim();
    const normalizedPhone = phone.trim();
    if (
      !USERNAME_PATTERN.test(normalizedUsername) ||
      normalizedName.length < 2 ||
      !PHONE_PATTERN.test(normalizedPhone) ||
      password.length < 3 ||
      DEMO_ACCOUNTS.some((account) => account.username.toLowerCase() === normalizedUsername) ||
      this.registrations.some((r) => r.account.username === normalizedUsername) ||
      DEMO_ACCOUNTS.some((account) => account.phone === normalizedPhone) ||
      this.registrations.some((r) => r.account.phone === normalizedPhone)
    )
      return false;
    const account: Account = {
      id: uid('customer'),
      username: normalizedUsername,
      name: normalizedName,
      phone: normalizedPhone,
      role: 'CUSTOMER',
    };
    this.setSession(account);
    this.registrations.push({ account, password });
    return true;
  }
  async registerApi(
    username: string,
    name: string,
    phone: string,
    password: string,
  ): Promise<void> {
    const result = await firstValueFrom(
      this.http.post<{ user: Account }>(
        '/api/auth/register',
        { username, name, phone, password },
        { withCredentials: true },
      ),
    );
    this.setSession(result.user);
  }
  restoreApiSession(): Promise<void> {
    if (!this.sessionRestore) {
      this.sessionRestore = firstValueFrom(
        this.http.get<{ user: Account }>('/api/auth/me', { withCredentials: true }),
      )
        .then(({ user }) => {
          this.setSession(user);
        })
        .catch(() => {
          this.account.set(null);
          sessionStorage.removeItem('ihouzz-session');
        });
    }
    return this.sessionRestore;
  }
  private setSession(account: Account): void {
    sessionStorage.setItem('ihouzz-session', JSON.stringify(account));
    this.account.set({ ...account });
  }
  logout(): void {
    this.account.set(null);
    sessionStorage.removeItem('ihouzz-session');
  }
  hasRole(roles: Role[]): boolean {
    return !!this.account() && roles.includes(this.account()!.role);
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
    return publicPath ||
      (customerPath && role === 'CUSTOMER') ||
      (employeePath && this.isEmployee()) ||
      (adminPath && role === 'ADMIN')
      ? returnUrl
      : fallback;
  }
}
