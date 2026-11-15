import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Account } from '../classes/Account';
import { AuthService } from './auth-service';
import { PayrollAPIService } from './payroll-apiservice';

describe('P5 payroll transport and isolation', () => {
  const account = signal<Account | null>({ id: 'a', username: 'a', name: 'A', role: 'EMPLOYEE' });
  const serverAuthenticated = signal(true);
  let api: PayrollAPIService, http: HttpTestingController;
  beforeEach(async () => {
    account.set({ id: 'a', username: 'a', name: 'A', role: 'EMPLOYEE' });
    serverAuthenticated.set(true);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { account, serverAuthenticated } },
      ],
    });
    api = TestBed.inject(PayrollAPIService);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
    http.expectOne('/data/me/payroll-periods').flush([]);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  afterEach(() => http.verify());
  it('reports connection errors and keeps rejected reads empty', async () => {
    const unavailable = api.refresh();
    http.expectOne('/data/me/payroll-periods').error(new ProgressEvent('error'));
    await unavailable;
    expect(api.online()).toBe(true);
    const forbidden = api.refresh();
    http.expectOne('/data/me/payroll-periods').flush({}, { status: 403, statusText: 'Forbidden' });
    await forbidden;
    expect(api.online()).toBe(true);
    expect(api.error()).toContain('không có quyền');
  });
  it('retains idempotency after an uncertain write and never reports a local success', async () => {
    const path = 'admin/payroll-periods/p/calculate';
    const first = api.write(path),
      failed = expect(first).rejects.toThrow();
    const original = http.expectOne('/data/' + path),
      key = original.request.headers.get('Idempotency-Key');
    expect(original.request.withCredentials).toBe(true);
    original.error(new ProgressEvent('error'));
    await failed;
    expect(api.online()).toBe(true);
    const retry = api.write(path),
      rejected = expect(retry).rejects.toThrow();
    const next = http.expectOne('/data/' + path);
    expect(next.request.headers.get('Idempotency-Key')).toBe(key);
    next.flush({ code: 'PAYROLL_CLOSED' }, { status: 409, statusText: 'Closed' });
    await rejected;
    expect(api.online()).toBe(true);
  });
  it('hides previous employee data immediately on account change and ignores late responses', async () => {
    const read = api.refresh('2026-11');
    account.set({ id: 'b', username: 'b', name: 'B', role: 'EMPLOYEE' });
    expect(api.state().slips).toEqual({});
    http.expectOne('/data/me/payroll-periods').flush([]);
    await read;
    expect(api.state().slips).toEqual({});
  });
});
