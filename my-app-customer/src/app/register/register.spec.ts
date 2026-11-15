import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthModule } from '../auth-module';
import { RegisterComponent } from './register';
import { HttpErrorResponse } from '@angular/common/http';
import { FavoriteService } from '../services/favorite-service';
import { API_ACCOUNT } from '../testing/api-fixtures';
describe('RegisterComponent', () => {
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
  it.each([['PHONE_TAKEN', 'Số điện thoại đã được sử dụng']])(
    'shows the registration HTTP error %s',
    async (code, message) => {
      const component = TestBed.createComponent(RegisterComponent).componentInstance;
      component.form.setValue({
        name: 'Khách thử',
        phone: '0901234567',
        password: 'secret123',
        confirm: 'secret123',
      });
      const submitted = component.submit();
      const req = TestBed.inject(HttpTestingController).expectOne('/user-register');
      expect(req.request.body.username).toBeUndefined();
      req.flush(JSON.stringify({ code }), { status: 409, statusText: 'Conflict' });
      await submitted;
      expect(component.error()).toContain(message);
      expect(component.auth.account()).toBeNull();
      expect(component.submitting()).toBe(false);
    },
  );
  it.each([false, true])(
    'completes after HTTP registration and favorite saving, save fails=%s',
    async (failed) => {
      const component = TestBed.createComponent(RegisterComponent).componentInstance;
      Object.assign(component.route.snapshot, {
        queryParamMap: convertToParamMap({
          action: 'favorite',
          roomId: 'phong-12',
          returnUrl: '/rooms?district=Thu%20Duc',
        }),
      });
      const navigate = vi.spyOn(component.router, 'navigateByUrl').mockResolvedValue(true);
      favorites.save.mockImplementation(async () => {
        expect(navigate).not.toHaveBeenCalled();
        expect(component.auth.account()?.phone).toBe(API_ACCOUNT.phone);
        if (failed) throw new Error('Unavailable');
      });
      component.form.setValue({
        name: 'Khách thử',
        phone: '0901234567',
        password: 'secret123',
        confirm: 'secret123',
      });
      const submitted = component.submit();
      TestBed.inject(HttpTestingController)
        .expectOne('/user-register')
        .flush(JSON.stringify({ user: { ...API_ACCOUNT, username: 'khach_thu' } }));
      await submitted;
      expect(favorites.save).toHaveBeenCalledWith('phong-12', true);
      expect(navigate).not.toHaveBeenCalled();
      expect(component.completed()).toBe(true);
      expect(component.favoriteSaved()).toBe(!failed);
      await component.continue();
      expect(navigate).toHaveBeenCalledWith('/rooms?district=Thu%20Duc');
      expect(component.error()).toBe('');
    },
  );
  it.each([
    ['', 0],
    ['abc', 1],
    ['abcdefgh', 1],
    ['abcd1234', 2],
    ['abcd123!', 3],
    ['abcdefgh1234', 3],
  ])('measures password strength for %s', (password, strength) => {
    const component = TestBed.createComponent(RegisterComponent).componentInstance;
    component.form.controls.password.setValue(password);
    expect(component.passwordStrength).toBe(strength);
  });
  it('khởi tạo và render frame bằng HTML', async () => {
    const fixture = TestBed.createComponent(RegisterComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.children.length).toBeGreaterThan(0);
  });
  it('kiểm tra số điện thoại và xác nhận mật khẩu khớp; không còn ô tên đăng nhập', () => {
    const fixture = TestBed.createComponent(RegisterComponent);
    const component = fixture.componentInstance;
    component.form.setValue({
      name: 'Khách thử',
      phone: 'not-a-phone',
      password: 'abc12345',
      confirm: 'xyz',
    });

    expect(component.form.controls.phone.hasError('pattern')).toBe(true);
    expect(component.form.hasError('passwordMismatch')).toBe(true);

    component.form.controls.phone.setValue('0907654321');
    component.form.controls.confirm.setValue('abc12345');
    expect(component.form.valid).toBe(true);

    expect('username' in component.form.controls).toBe(false);
  });
  it.each([false, true])('render đăng ký sau await bằng signal, lỗi=%s', async (failed) => {
    const fixture = TestBed.createComponent(RegisterComponent);
    const component = fixture.componentInstance;
    let resolve: (value: boolean) => void;
    let reject: (reason: unknown) => void;
    const result = new Promise<boolean>((done, fail) => {
      resolve = done;
      reject = fail;
    });
    vi.spyOn(component.auth, 'registerApi').mockReturnValue(result);
    const finish = vi.spyOn(component, 'finish').mockResolvedValue(undefined);
    fixture.detectChanges();
    component.form.setValue({
      name: 'Khách mới',
      phone: '0909999999',
      password: 'secret123',
      confirm: 'secret123',
    });
    const submitted = component.submit();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[type="submit"]').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('[type="submit"]').getAttribute('aria-busy')).toBe(
      'true',
    );
    expect(fixture.nativeElement.textContent).toContain('Đang tạo tài khoản…');
    expect(fixture.nativeElement.querySelector('.auth-spinner')).toBeTruthy();
    await component.submit();
    expect(component.auth.registerApi).toHaveBeenCalledOnce();
    if (failed) reject!(new HttpErrorResponse({ status: 409, error: { code: 'PHONE_TAKEN' } }));
    else resolve!(true);
    await submitted;
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[type="submit"]').disabled).toBe(false);
    if (failed)
      expect(
        fixture.nativeElement.querySelector('label[for="register-phone"]').textContent,
      ).toContain('Số điện thoại đã được sử dụng');
    else expect(finish).toHaveBeenCalledOnce();
  });
  it('validates name and confirmation after blur/submit and clears corrected errors immediately', async () => {
    const fixture = TestBed.createComponent(RegisterComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#register-username')).toBeNull();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('#register-name');
    input.value = 'a';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(input.getAttribute('aria-invalid')).toBe('false');
    expect(fixture.nativeElement.querySelector('.auth-error-inline')).toBeNull();
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    input.value = 'Khách mới';
    input.dispatchEvent(new Event('input'));
    fixture.componentInstance.form.controls.password.setValue('abcdefgh');
    const confirm: HTMLInputElement = fixture.nativeElement.querySelector('#register-confirm');
    confirm.value = 'khac';
    confirm.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(confirm.getAttribute('aria-invalid')).toBe('false');
    confirm.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Mật khẩu chưa khớp');
    confirm.value = 'abcdefgh';
    confirm.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Mật khẩu chưa khớp');
    expect(input.getAttribute('aria-invalid')).toBe('false');
    fixture.componentInstance.form.controls.confirm.reset();
    await fixture.componentInstance.submit();
    fixture.detectChanges();
    expect(confirm.getAttribute('aria-invalid')).toBe('true');
  });
  it.each(['register-password', 'register-confirm'])(
    'preserves caret and focus when toggling %s',
    (id) => {
      const fixture = TestBed.createComponent(RegisterComponent);
      fixture.detectChanges();
      const input: HTMLInputElement = fixture.nativeElement.querySelector(`#${id}`);
      input.value = 'secret123';
      input.dispatchEvent(new Event('input'));
      input.focus();
      input.setSelectionRange(1, 4);
      const button: HTMLButtonElement = input.parentElement!.querySelector('button')!;
      for (const type of ['text', 'password']) {
        button.click();
        fixture.detectChanges();
        expect(input.type).toBe(type);
        expect(input.value).toBe('secret123');
        expect(document.activeElement).toBe(input);
        expect([input.selectionStart, input.selectionEnd]).toEqual([1, 4]);
      }
    },
  );
  it.each([false, true])(
    'renders and focuses completion before continuing, returnUrl=%s',
    async (hasReturnUrl) => {
      const fixture = TestBed.createComponent(RegisterComponent);
      const component = fixture.componentInstance;
      Object.assign(component.route.snapshot, {
        queryParamMap: convertToParamMap({
          ...(hasReturnUrl ? { returnUrl: '/rooms/phong-12' } : {}),
          roomId: 'phong-12',
          action: 'favorite',
        }),
      });
      const navigate = vi.spyOn(component.router, 'navigateByUrl').mockResolvedValue(true);
      fixture.detectChanges();
      component.form.setValue({
        name: 'Khách mới',
        phone: '0901234567',
        password: 'abcdefgh',
        confirm: 'abcdefgh',
      });
      const pending = component.submit();
      TestBed.inject(HttpTestingController)
        .expectOne('/user-register')
        .flush(JSON.stringify({ user: API_ACCOUNT }));
      await pending;
      await fixture.whenStable();
      expect(fixture.nativeElement.querySelector('form')).toBeNull();
      const heading = fixture.nativeElement.querySelector('#register-complete-title');
      expect(heading.textContent).toBe('Tạo tài khoản thành công');
      expect(document.activeElement).toBe(heading);
      expect(fixture.nativeElement.textContent).toContain(API_ACCOUNT.name);
      expect(fixture.nativeElement.textContent).toContain('bạn đã đăng nhập');
      expect(fixture.nativeElement.textContent).toContain('Đã lưu phòng vào yêu thích');
      expect(fixture.nativeElement.querySelector('.auth-next-link').getAttribute('href')).toBe(
        '/rooms',
      );
      expect(navigate).not.toHaveBeenCalled();
      const button: HTMLButtonElement = fixture.nativeElement.querySelector('.auth-submit');
      expect(button.textContent).toContain(hasReturnUrl ? 'Tiếp tục' : 'Khám phá phòng');
      button.click();
      expect(navigate).toHaveBeenCalledWith(hasReturnUrl ? '/rooms/phong-12' : '/');
    },
  );
  it('keeps only the eight-character minimum mandatory and updates the strength conditions', () => {
    const component = TestBed.createComponent(RegisterComponent).componentInstance;
    component.form.controls.password.setValue('abcdefgh');
    expect(component.form.controls.password.valid).toBe(true);
    expect(component.passwordConditions).toEqual([true, false, false]);
    component.form.controls.password.setValue('abc12345!');
    expect(component.passwordConditions).toEqual([true, true, true]);
  });
});
