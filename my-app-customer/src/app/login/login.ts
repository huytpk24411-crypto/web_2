import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, inject, OnDestroy, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../services/auth-service';
import { FavoriteService } from '../services/favorite-service';
import { apiMessage } from '../services/api-message';
import { PHONE_PATTERN } from '../shared/validators';
import { togglePasswordVisibility } from '../auth-layout/password-visibility';
@Component({
  selector: 'app-login',
  standalone: false,
  templateUrl: './login.html',
  styleUrl: './login.css',
  host: { 'animate.enter': 'auth-form-enter', 'animate.leave': 'auth-form-leave' },
})
export class LoginComponent implements OnDestroy {
  auth = inject(AuthService);
  route = inject(ActivatedRoute);
  router = inject(Router);
  private fb = inject(FormBuilder);
  private favorites = inject(FavoriteService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly error = signal('');
  readonly submitting = signal(false);
  showPassword = false;
  private readonly rememberedPhone = signal(this.auth.getRememberedPhone());
  form = this.fb.nonNullable.group({
    username: [
      this.auth.getAuthPhoneDraft() ?? this.rememberedPhone(),
      // Customers sign in with their phone number only (registration no longer creates usernames).
      [Validators.required, Validators.pattern(PHONE_PATTERN)],
    ],
    password: ['', Validators.required],
    rememberMe: [!!this.rememberedPhone()],
  });
  togglePassword(input: HTMLInputElement): void {
    this.showPassword = togglePasswordVisibility(input, this.showPassword);
  }
  focusFirstInput(): void {
    this.element.nativeElement.querySelector<HTMLInputElement>('#login-identifier')?.focus();
  }
  ngOnDestroy(): void {
    this.auth.rememberAuthPhone(this.form.controls.username.value);
  }
  async submit() {
    this.form.markAllAsTouched();
    this.error.set('');
    if (this.form.invalid || this.submitting()) return;
    this.submitting.set(true);
    const v = this.form.getRawValue();
    try {
      if (!(await this.auth.login(v.username, v.password, v.rememberMe))) {
        this.error.set('Số điện thoại hoặc mật khẩu không đúng.');
        return;
      }
      await this.finish();
    } catch (error) {
      this.error.set(
        error instanceof HttpErrorResponse && error.status === 401
          ? 'Số điện thoại hoặc mật khẩu không đúng.'
          : apiMessage(error, 'Không đăng nhập được. Vui lòng thử lại.'),
      );
    } finally {
      this.submitting.set(false);
    }
  }
  async finish(): Promise<void> {
    const p = this.route.snapshot.queryParamMap;
    const roomId = p.get('roomId');
    if (p.get('action') === 'favorite' && roomId && this.auth.account()?.role === 'CUSTOMER') {
      try {
        await this.favorites.save(roomId, true);
      } catch {
        // A failed favorite must not prevent returning to the page the customer was viewing.
      }
    }
    await this.router.navigateByUrl(this.auth.destination(p.get('returnUrl')));
  }
  get params() {
    return {
      returnUrl: this.route.snapshot.queryParamMap.get('returnUrl'),
      roomId: this.route.snapshot.queryParamMap.get('roomId'),
      action: this.route.snapshot.queryParamMap.get('action'),
    };
  }
}
