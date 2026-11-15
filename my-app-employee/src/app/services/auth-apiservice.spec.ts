import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CookieService } from 'ngx-cookie-service';
import { AuthService } from './auth-service';
import { API_ACCOUNT } from '../testing/api-fixtures';
import { apiMessage, CONNECTION_ERROR } from './api-message';
describe('API authentication', () => {
  let auth: AuthService, http: HttpTestingController;
  const cookies = { get: vi.fn(() => ''), set: vi.fn(), delete: vi.fn() };
  beforeEach(() => {
    sessionStorage.removeItem('ihouzz-session');
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CookieService, useValue: cookies },
      ],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('posts credentials with cookies and remembers the typed phone', async () => {
    const pending = auth.login(API_ACCOUNT.phone!, 'secret', true);
    const req = http.expectOne('/user-login');
    expect(req.request.body).toEqual({
      phone: API_ACCOUNT.phone,
      password: 'secret',
      rememberMe: true,
    });
    expect(req.request.withCredentials).toBe(true);
    req.flush(JSON.stringify({ user: API_ACCOUNT }));
    expect(await pending).toBe(true);
    expect(auth.account()).toEqual(API_ACCOUNT);
    expect(cookies.set).toHaveBeenCalledWith('remember_user_employee', API_ACCOUNT.phone, 30, '/');
    expect(sessionStorage.getItem('ihouzz-session')).not.toContain('secret');
  });
  it.each([0, 400, 401, 403, 409, 502, 503, 504])(
    'login rejection %s never creates a session',
    async (status) => {
      const pending = auth.login(API_ACCOUNT.phone!, 'secret');
      const rejected = expect(pending).rejects.toMatchObject({ status });
      const req = http.expectOne('/user-login');
      if (!status) req.error(new ProgressEvent('error'));
      else req.flush('{}', { status, statusText: 'Rejected' });
      await rejected;
      expect(auth.account()).toBeNull();
      expect(auth.serverAuthenticated()).toBe(false);
      http.expectNone('/user-login');
    },
  );
  it('rejects an HTML response instead of authorizing an account', async () => {
    const pending = auth.login(API_ACCOUNT.phone!, 'secret');
    const rejected = expect(pending).rejects.toThrow();
    http.expectOne('/user-login').flush('<html>Unavailable</html>');
    await rejected;
    expect(auth.account()).toBeNull();
  });
  it('registers only by API, starts a server session and never caches the password', async () => {
    const pending = auth.registerApi('khachthu', API_ACCOUNT.name, API_ACCOUNT.phone!, 'secret123');
    const req = http.expectOne('/user-register');
    expect(req.request.body).toEqual({
      phone: API_ACCOUNT.phone,
      name: API_ACCOUNT.name,
      password: 'secret123',
      username: 'khachthu',
    });
    req.flush(JSON.stringify({ user: API_ACCOUNT }));
    expect(await pending).toBe(true);
    expect(auth.serverAuthenticated()).toBe(true);
    expect(sessionStorage.getItem('ihouzz-session')).not.toContain('secret123');
  });
  it('logs in by username and remembers the username that was typed', async () => {
    const pending = auth.login('  Khach_Thu  ', 'secret123', true);
    const req = http.expectOne('/user-login');
    expect(req.request.body).toEqual({
      phone: 'Khach_Thu',
      password: 'secret123',
      rememberMe: true,
    });
    req.flush(JSON.stringify({ user: { ...API_ACCOUNT, username: 'khach_thu' } }));
    expect(await pending).toBe(true);
    expect(auth.account()?.username).toBe('khach_thu');
    expect(cookies.set).toHaveBeenCalledWith('remember_user_employee', 'Khach_Thu', 30, '/');
  });
  it('normalizes registration username and preserves USERNAME_TAKEN from HTTP', async () => {
    const pending = auth.registerApi(
      '  Khach_Thu  ',
      API_ACCOUNT.name,
      API_ACCOUNT.phone!,
      'secret123',
    );
    const rejected = expect(pending).rejects.toMatchObject({ status: 409 });
    const req = http.expectOne('/user-register');
    expect(req.request.body.username).toBe('khach_thu');
    expect(req.request.withCredentials).toBe(true);
    req.flush(JSON.stringify({ code: 'USERNAME_TAKEN' }), { status: 409, statusText: 'Conflict' });
    await rejected;
    expect(auth.account()).toBeNull();
    expect(auth.serverAuthenticated()).toBe(false);
  });
  it.each([0, 409, 503])('registration rejection %s never creates an account', async (status) => {
    const pending = auth.registerApi('khachthu', API_ACCOUNT.name, API_ACCOUNT.phone!, 'secret123');
    const rejected = expect(pending).rejects.toMatchObject({ status });
    const req = http.expectOne('/user-register');
    if (!status) req.error(new ProgressEvent('error'));
    else req.flush('{}', { status, statusText: 'Rejected' });
    await rejected;
    expect(auth.account()).toBeNull();
    http.expectNone('/user-register');
  });
  it('uses one shared connection message for 0 and 5xx failures', () => {
    for (const status of [0, 500, 502, 503, 504])
      expect(apiMessage({ status }, 'other')).toBe(CONNECTION_ERROR);
  });
});
