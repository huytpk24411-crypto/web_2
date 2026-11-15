import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthModule } from '../auth-module';
import { LoginComponent } from './login';
import { AuthService } from '../services/auth-service';
import { provideZonelessChangeDetection } from '@angular/core';
import { FavoriteService } from '../services/favorite-service';
import { API_ACCOUNT } from '../testing/api-fixtures';
describe('LoginComponent', () => {
  const favorites = { save: vi.fn() };
  beforeEach(async () => {
    favorites.save.mockReset().mockResolvedValue(undefined);
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AuthModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: FavoriteService, useValue: favorites },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: {},
              paramMap: convertToParamMap({ id: 'phong-48' }),
              queryParamMap: convertToParamMap({ roomId: 'phong-48' }),
            },
            queryParams: of({}),
            params: of({ id: 'phong-48' }),
          },
        },
      ],
    }).compileComponents();
  });
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it.each(['/', '/rooms?district=Thu%20Duc', '/rooms/phong-12'])(
    'saves favorite after HTTP login before returning to %s',
    async (returnUrl) => {
      const component = TestBed.createComponent(LoginComponent).componentInstance;
      Object.assign(component.route.snapshot, {
        queryParamMap: convertToParamMap({
          returnUrl,
          roomId: 'phong-12',
          action: 'favorite',
        }),
      });
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      let saved!: () => void;
      favorites.save.mockReturnValue(
        new Promise<void>((resolve) => {
          saved = resolve;
        }),
      );
      component.form.patchValue({ username: '0901234567', password: 'secret123' });
      const submitted = component.submit();
      const req = TestBed.inject(HttpTestingController).expectOne('/user-login');
      expect(req.request.body.phone).toBe('0901234567');
      req.flush(JSON.stringify({ user: API_ACCOUNT }));
      await Promise.resolve();
      await Promise.resolve();
      expect(favorites.save).toHaveBeenCalledWith('phong-12', true);
      expect(navigate).not.toHaveBeenCalled();
      saved();
      await submitted;
      expect(navigate).toHaveBeenCalledWith(returnUrl);
      expect(component.submitting()).toBe(false);
    },
  );
  it('still returns to returnUrl when favorite saving fails', async () => {
    const component = TestBed.createComponent(LoginComponent).componentInstance;
    component.auth.account.set(API_ACCOUNT);
    Object.assign(component.route.snapshot, {
      queryParamMap: convertToParamMap({
        returnUrl: '/',
        roomId: 'phong-12',
        action: 'favorite',
      }),
    });
    favorites.save.mockRejectedValue(new Error('Unavailable'));
    const navigate = vi.spyOn(component.router, 'navigateByUrl').mockResolvedValue(true);
    await component.finish();
    expect(navigate).toHaveBeenCalledWith('/');
  });
  it.each([
    ['booking', '/bookings/new?roomId=phong-12'],
    ['viewing', '/viewings/new?roomId=phong-12'],
  ])('returns directly for %s', async (action, returnUrl) => {
    const component = TestBed.createComponent(LoginComponent).componentInstance;
    component.auth.account.set(API_ACCOUNT);
    Object.assign(component.route.snapshot, {
      queryParamMap: convertToParamMap({
        action,
        returnUrl,
        roomId: 'phong-12',
      }),
    });
    const navigate = vi.spyOn(component.router, 'navigateByUrl').mockResolvedValue(true);
    await component.finish();
    expect(favorites.save).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(returnUrl);
  });
  it.each([
    ['CUSTOMER', null, '/'],
    ['ADMIN', 'phong-12', '/admin'],
    ['EMPLOYEE', 'phong-12', '/employee/shifts/register'],
  ] as const)(
    'does not save favorite without a room or CUSTOMER role (%s)',
    async (role, roomId, expected) => {
      const component = TestBed.createComponent(LoginComponent).componentInstance;
      component.auth.account.set({ ...API_ACCOUNT, role });
      Object.assign(component.route.snapshot, {
        queryParamMap: convertToParamMap({
          action: 'favorite',
          returnUrl: '/',
          ...(roomId ? { roomId } : {}),
        }),
      });
      const navigate = vi.spyOn(component.router, 'navigateByUrl').mockResolvedValue(true);
      await component.finish();
      expect(favorites.save).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith(expected);
    },
  );
  it('khởi tạo và render frame bằng HTML', async () => {
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.children.length).toBeGreaterThan(0);
  });
  it('chỉ chấp nhận số điện thoại làm định danh đăng nhập', () => {
    const fixture = TestBed.createComponent(LoginComponent);
    const { username } = fixture.componentInstance.form.controls;

    username.setValue('khachthu');
    expect(username.hasError('pattern')).toBe(true);

    username.setValue('0901234567');
    expect(username.valid).toBe(true);

    username.setValue('90');
    expect(username.hasError('pattern')).toBe(true);

    username.setValue('0909876543');
    expect(username.valid).toBe(true);
  });
  it('điền lại số điện thoại đã ghi nhớ và tích sẵn checkbox', () => {
    vi.spyOn(TestBed.inject(AuthService), 'getRememberedPhone').mockReturnValue('0901234567');
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.form.getRawValue()).toMatchObject({
      username: '0901234567',
      rememberMe: true,
    });
    expect(fixture.nativeElement.querySelector('#login-remember').checked).toBe(true);
    expect(
      fixture.nativeElement.querySelector('label[for="login-identifier"]').textContent,
    ).not.toContain('tên đăng nhập');
  });
  it('chờ kết quả đăng nhập rồi báo lỗi 401 qua trạng thái submit', async () => {
    const auth = TestBed.inject(AuthService);
    let finish: (result: boolean) => void;
    vi.spyOn(auth, 'login').mockReturnValue(
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
    );
    const fixture = TestBed.createComponent(LoginComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    component.form.patchValue({ username: '0901234567', password: '123', rememberMe: true });
    const submit = component.submit();
    expect(component.submitting()).toBe(true);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[type="submit"]').disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Đang đăng nhập…');
    expect(fixture.nativeElement.querySelector('[type="submit"]').getAttribute('aria-busy')).toBe(
      'true',
    );
    expect(fixture.nativeElement.querySelector('.auth-spinner')).toBeTruthy();
    await component.submit();
    expect(auth.login).toHaveBeenCalledOnce();
    finish!(false);
    await submit;
    await fixture.whenStable();
    expect(component.error()).toContain('không đúng');
    expect(component.submitting()).toBe(false);
    expect(auth.login).toHaveBeenCalledWith('0901234567', '123', true);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'không đúng',
    );
    expect(fixture.nativeElement.querySelector('[type="submit"]').disabled).toBe(false);
  });
  it('shows errors only after blur or submit and clears them as soon as input is valid', async () => {
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    const identifier: HTMLInputElement = fixture.nativeElement.querySelector('#login-identifier');
    identifier.value = '90';
    identifier.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(identifier.getAttribute('aria-invalid')).toBe('false');
    expect(fixture.nativeElement.querySelector('.auth-error-inline')).toBeNull();
    identifier.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(identifier.getAttribute('aria-invalid')).toBe('true');
    expect(fixture.nativeElement.querySelector('.auth-error-inline')).toBeTruthy();
    identifier.value = '0901234567';
    identifier.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(identifier.getAttribute('aria-invalid')).toBe('false');
    expect(fixture.nativeElement.querySelector('.auth-error-inline')).toBeNull();
    await fixture.componentInstance.submit();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('#login-password').getAttribute('aria-invalid'),
    ).toBe('true');
  });
  it('toggles password visibility without changing value, focus or selection', () => {
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('#login-password');
    input.value = 'secret123';
    input.dispatchEvent(new Event('input'));
    input.focus();
    input.setSelectionRange(2, 5, 'backward');
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.auth-password-toggle');
    for (const type of ['text', 'password']) {
      button.click();
      fixture.detectChanges();
      expect(input.type).toBe(type);
      expect(input.value).toBe('secret123');
      expect(document.activeElement).toBe(input);
      expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([
        2,
        5,
        'backward',
      ]);
      expect(fixture.componentInstance.form.controls.password.touched).toBe(false);
    }
  });
  it.each([
    ['ADMIN', '/admin'],
    ['EMPLOYEE', '/employee/shifts/register'],
    ['CUSTOMER', '/rooms'],
  ] as const)('waits for a server %s role before navigating', async (role, destination) => {
    const component = TestBed.createComponent(LoginComponent).componentInstance;
    Object.assign(component.route.snapshot, {
      queryParamMap: convertToParamMap({ returnUrl: '/rooms' }),
    });
    const navigate = vi.spyOn(component.router, 'navigateByUrl').mockResolvedValue(true);
    component.form.patchValue({ username: '0901234567', password: 'secret123' });
    const pending = component.submit();
    expect(navigate).not.toHaveBeenCalled();
    TestBed.inject(HttpTestingController)
      .expectOne('/user-login')
      .flush(JSON.stringify({ user: { ...API_ACCOUNT, role } }));
    await pending;
    expect(navigate).toHaveBeenCalledWith(destination);
  });
  it('submits from the native form used by Enter in the password input', async () => {
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    const submit = vi.spyOn(fixture.componentInstance, 'submit').mockResolvedValue(undefined);
    fixture.nativeElement
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(submit).toHaveBeenCalledOnce();
  });
});
