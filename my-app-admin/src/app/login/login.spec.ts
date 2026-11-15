import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AuthModule } from '../auth-module';
import { AuthLayoutComponent } from '../auth-layout/auth-layout';
import { AuthService } from '../services/auth-service';
import { PORTAL } from '../portal';
import { LoginComponent } from './login';

@Component({ standalone: true, template: '' })
class AreaStub {}
const ROLE = PORTAL === 'admin' ? 'ADMIN' : 'EMPLOYEE';
const HOME = PORTAL === 'admin' ? '/admin' : '/employee/shifts/register';
const user = { id: 'staff-1', phone: '0909876543', name: 'Nhân viên kiểm thử', role: ROLE };

describe('Staff login page', () => {
  let http: HttpTestingController;
  async function open(url = '/login', remembered = '') {
    vi.spyOn(TestBed.inject(AuthService), 'getRememberedPhone').mockReturnValue(remembered);
    const harness = await RouterTestingHarness.create(url);
    return { harness, page: harness.routeNativeElement! };
  }
  function type(page: HTMLElement, id: string, value: string): void {
    const input = page.querySelector<HTMLInputElement>(`#${id}`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }
  async function submit(harness: RouterTestingHarness, page: HTMLElement) {
    page.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await new Promise((done) => setTimeout(done));
    return http.expectOne('/user-login');
  }
  beforeEach(async () => {
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AuthModule],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'login', component: AuthLayoutComponent, children: [{ path: '', component: LoginComponent }] },
          { path: '**', component: AreaStub },
        ]),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('matches the mockup: image, area label, shield heading and no customer links', async () => {
    const { page } = await open();
    expect(page.querySelector('.auth-room-image')!.getAttribute('src')).toContain(`${PORTAL}-login`);
    expect(page.querySelector('h1')!.textContent).toContain(PORTAL === 'admin' ? 'quản trị' : 'nhân viên');
    expect(page.querySelector('.staff-shield')).not.toBeNull();
    expect(page.textContent).toContain('Ghi nhớ tên đăng nhập');
    expect(page.querySelector('a[href^="/register"], a[href="/"]')).toBeNull();
  });

  it('logs in and opens the staff area or the requested page', async () => {
    const { harness, page } = await open('/login?returnUrl=' + encodeURIComponent(HOME));
    type(page, 'login-identifier', '0909876543');
    type(page, 'login-password', 'secret123');
    const request = await submit(harness, page);
    expect(request.request.body).toEqual({ phone: '0909876543', password: 'secret123', rememberMe: false });
    request.flush(JSON.stringify({ user }));
    await new Promise((done) => setTimeout(done));
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe(HOME);
  });

  it('shows the server message when the account belongs to another area', async () => {
    const { harness, page } = await open();
    type(page, 'login-identifier', 'khachhang');
    type(page, 'login-password', 'secret123');
    (await submit(harness, page)).flush(JSON.stringify({ code: 'WRONG_PORTAL' }), {
      status: 403,
      statusText: 'Forbidden',
    });
    await new Promise((done) => setTimeout(done));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(page.querySelector('[role=alert]')!.textContent).toContain('không được đăng nhập');
  });

  it('prefills a remembered username and keeps the box ticked', async () => {
    const { page } = await open('/login', 'nv.lan');
    expect(page.querySelector<HTMLInputElement>('#login-identifier')!.value).toBe('nv.lan');
    expect(page.querySelector<HTMLInputElement>('#login-remember')!.checked).toBe(true);
  });
});
