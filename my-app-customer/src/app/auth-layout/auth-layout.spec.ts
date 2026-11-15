import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AuthModule } from '../auth-module';
import { LoginComponent } from '../login/login';
import { RegisterComponent } from '../register/register';
import { AuthService } from '../services/auth-service';
import { AuthLayoutComponent } from './auth-layout';

describe('Shared auth layout', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuthModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          {
            path: '',
            component: AuthLayoutComponent,
            children: [
              { path: 'login', component: LoginComponent, title: 'Đăng nhập | iHOUZZ Uni' },
              { path: 'register', component: RegisterComponent, title: 'Đăng ký | iHOUZZ Uni' },
            ],
          },
        ]),
      ],
    }).compileComponents();
    vi.spyOn(TestBed.inject(AuthService), 'getRememberedPhone').mockReturnValue('');
  });

  it('reuses the image, preserves query params and only transfers a phone between forms', async () => {
    const query = '?returnUrl=%2Frooms%2Fphong-12&action=favorite&roomId=phong-12';
    const harness = await RouterTestingHarness.create('/login' + query);
    const layout = harness.routeNativeElement!;
    const image = layout.querySelector('.auth-room-image');
    expect(document.activeElement?.id).not.toBe('login-identifier');
    function type(id: string, value: string): void {
      const input = layout.querySelector<HTMLInputElement>(`#${id}`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    type('login-identifier', '+84901234567');
    type('login-password', 'secret123');
    const registerLink = layout.querySelector<HTMLAnchorElement>('a[href^="/register"]')!;
    expect(registerLink.getAttribute('href')).toContain('roomId=phong-12');
    registerLink.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement).toBe(layout);
    expect(layout.querySelector('.auth-room-image')).toBe(image);
    expect(document.activeElement?.id).toBe('register-name');
    expect(layout.querySelector<HTMLInputElement>('#register-phone')!.value).toBe('+84901234567');
    expect(layout.querySelector<HTMLInputElement>('#register-password')!.value).toBe('');
    expect(layout.querySelector<HTMLInputElement>('#register-confirm')!.value).toBe('');
    type('register-phone', '0907654321');
    type('register-password', 'another123');
    layout.querySelector<HTMLAnchorElement>('a[href^="/login"]')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(layout.querySelector('.auth-room-image')).toBe(image);
    expect(document.activeElement?.id).toBe('login-identifier');
    expect(layout.querySelector<HTMLInputElement>('#login-identifier')!.value).toBe('0907654321');
    expect(layout.querySelector<HTMLInputElement>('#login-password')!.value).toBe('');
    expect(
      layout.querySelector<HTMLAnchorElement>('a[href^="/register"]')!.getAttribute('href'),
    ).toContain('returnUrl=%2Frooms%2Fphong-12');
  });
});
