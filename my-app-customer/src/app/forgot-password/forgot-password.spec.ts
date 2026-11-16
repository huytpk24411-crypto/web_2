import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SharedModule } from '../shared/shared-module';
import { ForgotPasswordComponent } from './forgot-password';

describe('ForgotPasswordComponent', () => {
  let http: HttpTestingController;
  let component: ForgotPasswordComponent;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SharedModule],
      declarations: [ForgotPasswordComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    component = TestBed.createComponent(ForgotPasswordComponent).componentInstance;
  });
  afterEach(() => http.verify());
  it('keeps the phone step and shows the server message when SMS is not configured', async () => {
    component.phone.setValue('0901234567');
    const pending = component.requestPin();
    http
      .expectOne('/auth/password-reset/request')
      .flush({ message: 'Chưa kích hoạt SMS.' }, { status: 503, statusText: 'Unavailable' });
    await pending;
    expect(component.step()).toBe('phone');
    expect(component.error()).toBe('Chưa kích hoạt SMS.');
  });
  it('does not send invalid phone input', async () => {
    component.phone.setValue('123');
    await component.requestPin();
    http.expectNone('/auth/password-reset/request');
  });
  it('requires successful PIN verification and matching passwords before saving', async () => {
    component.phone.setValue('0901234567');
    let pending = component.requestPin();
    http
      .expectOne('/auth/password-reset/request')
      .flush({ requestId: 'request-a', expiresIn: 300, resendAfter: 60, message: 'Đã gửi' });
    await pending;
    expect(component.step()).toBe('pin');
    await component.requestPin();
    http.expectNone('/auth/password-reset/request');
    component.pin.setValue('123456');
    pending = component.verify();
    http.expectOne('/auth/password-reset/verify').flush({ token: 'secret-grant', expiresIn: 300 });
    await pending;
    expect(component.step()).toBe('password');
    component.password.setValue({ password: 'password-new', confirm: 'different' });
    await component.complete();
    http.expectNone('/auth/password-reset/complete');
    component.password.setValue({ password: 'password-new', confirm: 'password-new' });
    pending = component.complete();
    const request = http.expectOne('/auth/password-reset/complete');
    expect(request.request.body).toEqual({
      requestId: 'request-a',
      token: 'secret-grant',
      password: 'password-new',
    });
    request.flush({ message: 'OK' });
    await pending;
    expect(component.step()).toBe('done');
    expect(component.password.controls.password.value).toBe('');
  });
  it('stays on the PIN step after a wrong PIN', async () => {
    component.phone.setValue('0901234567');
    let pending = component.requestPin();
    http
      .expectOne('/auth/password-reset/request')
      .flush({ requestId: 'a', expiresIn: 300, resendAfter: 60 });
    await pending;
    component.pin.setValue('123456');
    pending = component.verify();
    http
      .expectOne('/auth/password-reset/verify')
      .flush({ message: 'Mã không đúng.' }, { status: 400, statusText: 'Invalid' });
    await pending;
    expect(component.step()).toBe('pin');
    expect(component.error()).toBe('Mã không đúng.');
  });
});
