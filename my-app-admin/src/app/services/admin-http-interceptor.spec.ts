import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { adminHttpInterceptor } from './admin-http-interceptor';

describe('admin hosting recovery', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([adminHttpInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it.each([0, 502, 503, 504])('recovers a transient GET failure %s once', async (status) => {
    const result = firstValueFrom(
      client.get('/data/rooms', { timeout: 2000, withCredentials: true }),
    );
    const first = http.expectOne('/data/rooms');
    expect(first.request.withCredentials).toBe(true);
    if (status === 0) first.error(new ProgressEvent('error'));
    else first.flush({}, { status, statusText: 'Temporarily unavailable' });
    http.expectNone('/data/rooms');
    await vi.advanceTimersByTimeAsync(750);
    http.expectOne('/data/rooms').flush([{ id: 'room-test' }]);
    expect(await result).toEqual([{ id: 'room-test' }]);
  });

  it.each([400, 401, 403, 404, 409])('does not replay a rejected GET %s', async (status) => {
    const pending = firstValueFrom(client.get('/data/admin/employees'));
    const rejected = expect(pending).rejects.toMatchObject({ status });
    http.expectOne('/data/admin/employees').flush({}, { status, statusText: 'Rejected' });
    await rejected;
    await vi.advanceTimersByTimeAsync(1000);
    http.expectNone('/data/admin/employees');
  });

  it.each(['POST', 'PUT', 'DELETE'])(
    'never automatically repeats a %s mutation',
    async (method) => {
      const pending = firstValueFrom(
        client.request(method, '/data/admin/employees', {
          body: { name: 'Test' },
          headers: { 'Idempotency-Key': 'owned-test-key' },
        }),
      );
      const rejected = expect(pending).rejects.toMatchObject({ status: 503 });
      const request = http.expectOne('/data/admin/employees');
      expect(request.request.headers.get('Idempotency-Key')).toBe('owned-test-key');
      request.flush({}, { status: 503, statusText: 'Unavailable' });
      await rejected;
      await vi.advanceTimersByTimeAsync(1000);
      http.expectNone('/data/admin/employees');
    },
  );

  it('stops after the second failed GET instead of retrying indefinitely', async () => {
    const pending = firstValueFrom(client.get('/notifications/mine'));
    const rejected = expect(pending).rejects.toMatchObject({ status: 502 });
    http.expectOne('/notifications/mine').flush({}, { status: 502, statusText: 'Unavailable' });
    await vi.advanceTimersByTimeAsync(750);
    http.expectOne('/notifications/mine').flush({}, { status: 502, statusText: 'Unavailable' });
    await rejected;
    await vi.advanceTimersByTimeAsync(1000);
    http.expectNone('/notifications/mine');
  });

  it('leaves external services and static files outside the admin recovery policy', async () => {
    for (const url of ['https://example.test/data', '//example.test/data', '/assets/config.json']) {
      const result = firstValueFrom(client.get(url, { timeout: 1000 }));
      const request = http.expectOne(url);
      expect(request.request.timeout).toBe(1000);
      request.flush({});
      await result;
    }
  });
});
