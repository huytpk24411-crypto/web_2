import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthService } from './auth-service';
import { MoneyService } from './money-service';
import { Account } from '../classes/Account';

describe('P3 money transport and isolation', () => {
  const account = signal<Account | null>({
    id: 'actor-a',
    username: 'a',
    name: 'A',
    role: 'CUSTOMER',
  });
  const serverAuthenticated = signal(true);
  let money: MoneyService, http: HttpTestingController;
  beforeEach(() => {
    account.set({ id: 'actor-a', username: 'a', name: 'A', role: 'CUSTOMER' });
    serverAuthenticated.set(true);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { account, serverAuthenticated } },
      ],
    });
    money = TestBed.inject(MoneyService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('keeps one key after a lost response and retries explicitly with the same body', async () => {
    const first = money.write('me/holds/h/payments', { method: 'QR' });
    const failed = expect(first).rejects.toThrow('Không kết nối được máy chủ');
    const a = http.expectOne('/data/me/holds/h/payments');
    const key = a.request.headers.get('Idempotency-Key');
    expect(key).toBeTruthy();
    expect(a.request.withCredentials).toBe(true);
    a.error(new ProgressEvent('error'));
    await failed;
    const retry = money.write('me/holds/h/payments', { method: 'QR' });
    const b = http.expectOne('/data/me/holds/h/payments');
    expect(b.request.headers.get('Idempotency-Key')).toBe(key);
    b.flush('{"id":"payment"}');
    expect(await retry).toEqual({ id: 'payment' });
  });
  it('maps a ROOM_LOCKED 409 to the booking message', async () => {
    const request = money.write('me/holds', { roomId: 'phong-48' });
    const rejected = expect(request).rejects.toThrow('Phòng vừa được giữ');
    http.expectOne('/data/me/holds').flush('{"code":"ROOM_LOCKED"}', {
      status: 409,
      statusText: 'Conflict',
    });
    await rejected;
  });
  it('hides records immediately when the account changes and ignores an in-flight old response', async () => {
    const pending = money.refresh();
    const a = http.expectOne('/data/me/holds');
    account.set({ id: 'actor-b', username: 'b', name: 'B', role: 'CUSTOMER' });
    a.flush('{"items":[{"id":"private-a"}]}');
    await pending;
    expect(money.holds()).toEqual([]);
  });
  it('does not call money endpoints without a server session', async () => {
    serverAuthenticated.set(false);
    await money.refresh();
    http.expectNone('/data/me/holds');
  });
});
