import { provideHttpClient, withFetch } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AdminCatalogAPIService } from './admin-catalog-apiservice';
import { AuthAPIService } from './auth-apiservice';
import { AuthService } from './auth-service';
import { ShiftAPIService } from './shift-apiservice';

// Exercise the actual fetch transport, including its AbortController deadline.
describe('admin data over a delayed hosting connection', () => {
  let requests: { path: string; signal: AbortSignal; respond: (body: unknown) => void }[];
  beforeEach(() => {
    vi.useFakeTimers();
    requests = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (path: string, init: RequestInit) =>
          new Promise<Response>((resolve, reject) => {
            const signal = init.signal as AbortSignal;
            signal.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
            requests.push({
              path,
              signal,
              respond: (body) =>
                resolve(
                  new Response(JSON.stringify(body), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                  }),
                ),
            });
          }),
      ),
    );
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withFetch()),
        {
          provide: AuthService,
          useValue: {
            account: signal({ id: 'admin-test', role: 'ADMIN' }),
            serverAuthenticated: signal(true),
          },
        },
      ],
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('accepts staff data arriving after the old five-second cutoff', async () => {
    const api = TestBed.inject(AdminCatalogAPIService);
    const result = api.list<{ id: string }>('employees').then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await vi.advanceTimersByTimeAsync(6000);
    expect(requests[0].signal.aborted).toBe(false);
    requests[0].respond([{ id: 'employee-test' }]);
    expect(await result).toEqual({ value: [{ id: 'employee-test' }] });
    expect(api.error()).toBe('');
  });

  it('restores an admin session when the profile takes more than two seconds', async () => {
    const result = firstValueFrom(TestBed.inject(AuthAPIService).profile()).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await vi.advanceTimersByTimeAsync(3000);
    expect(requests[0].signal.aborted).toBe(false);
    requests[0].respond({ id: 'admin-test', role: 'ADMIN' });
    expect(await result).toEqual({ value: { id: 'admin-test', role: 'ADMIN' } });
  });

  it('loads shift statistics even when the response takes longer than ten seconds', async () => {
    const api = TestBed.inject(ShiftAPIService);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(11000);
    expect(requests).toHaveLength(2);
    expect(requests.every((request) => !request.signal.aborted)).toBe(true);
    for (const request of requests)
      request.respond(
        request.path.endsWith('/shift-state')
          ? {
              Shift: [],
              ShiftAssignment: [],
              Attendance: [],
              WorkLocation: [],
              Employee: [],
              PeriodRegistration: [],
              Policy: [],
              PolicyLevel: [],
              Task: [],
            }
          : [],
      );
    await vi.advanceTimersByTimeAsync(0);
    expect(api.loading()).toBe(false);
    expect(api.error()).toBe('');
    expect(api.state().admin).not.toBeNull();
  });
});
