import {
  afterNextRender,
  Component,
  ElementRef,
  inject,
  Injector,
  OnDestroy,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, FormBuilder, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../services/auth-service';
import { FavoriteService } from '../services/favorite-service';
import { PHONE_PATTERN } from '../shared/validators';
import { apiMessage } from '../services/api-message';
import { togglePasswordVisibility } from '../auth-layout/password-visibility';
@Component({
  selector: 'app-register',
  standalone: false,
  templateUrl: './register.html',
  styleUrl: './register.css',
  host: { 'animate.enter': 'auth-form-enter', 'animate.leave': 'auth-form-leave' },
})
export class RegisterComponent implements OnDestroy {
  auth = inject(AuthService);
  route = inject(ActivatedRoute);
  router = inject(Router);
  private fb = inject(FormBuilder);
  private favorites = inject(FavoriteService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  readonly error = signal('');
  readonly submitting = signal(false);
  readonly completed = signal(false);
  readonly favoriteSaved = signal(false);
  readonly submitted = signal(false);
  showPassword = false;
  showConfirmPassword = false;
  form = this.fb.nonNullable.group(
    {
      name: ['', [Validators.required, Validators.minLength(2)]],
      phone: [
        this.auth.getAuthPhoneDraft() ?? '',
        [Validators.required, Validators.pattern(PHONE_PATTERN)],
      ],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirm: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  togglePassword(input: HTMLInputElement, confirmation = false): void {
    if (confirmation)
      this.showConfirmPassword = togglePasswordVisibility(input, this.showConfirmPassword);
    else this.showPassword = togglePasswordVisibility(input, this.showPassword);
  }
  focusFirstInput(): void {
    this.element.nativeElement.querySelector<HTMLInputElement>('#register-name')?.focus();
  }
  ngOnDestroy(): void {
    this.auth.rememberAuthPhone(this.form.controls.phone.value);
  }

  async submit() {
    if (this.submitting() || this.completed()) return;
    this.submitted.set(true);
    this.form.markAllAsTouched();
    this.error.set('');
    if (this.form.invalid) return;
    this.submitting.set(true);
    const v = this.form.getRawValue();
    try {
      if (!(await this.auth.registerApi(v.name, v.phone, v.password))) {
        this.error.set('Số điện thoại đã được sử dụng.');
        return;
      }
      await this.finish();
    } catch (error) {
      let code: unknown;
      if (error instanceof HttpErrorResponse && error.status === 409) {
        let body = error.error;
        if (typeof body === 'string') {
          try {
            body = JSON.parse(body);
          } catch {
            body = null;
          }
        }
        code = body?.code;
      }
      this.error.set(
        code === 'PHONE_TAKEN'
          ? 'Số điện thoại đã được sử dụng. Vui lòng đăng nhập hoặc chọn số khác.'
          : apiMessage(error, 'Không tạo được tài khoản. Vui lòng thử lại.'),
      );
      if (code === 'PHONE_TAKEN') this.form.controls.phone.setErrors({ phoneTaken: true });
    } finally {
      this.submitting.set(false);
    }
  }
  get passwordStrength(): number {
    const password = this.form.controls.password.value;
    if (!password) return 0;
    if (password.length < 8) return 1;
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 1;
    return /[^A-Za-z0-9]/.test(password) || password.length >= 12 ? 3 : 2;
  }
  get passwordStrengthLabel(): string {
    return ['Chưa nhập mật khẩu', 'Yếu', 'Vừa', 'Mạnh'][this.passwordStrength];
  }
  readonly passwordRules = [
    'Ít nhất 8 ký tự',
    'Có cả chữ và số',
    'Có ký tự đặc biệt hoặc từ 12 ký tự',
  ];
  get passwordConditions(): boolean[] {
    const password = this.form.controls.password.value;
    return [
      password.length >= 8,
      /[A-Za-z]/.test(password) && /[0-9]/.test(password),
      /[^A-Za-z0-9]/.test(password) || password.length >= 12,
    ];
  }
  get continuationUrl(): string {
    return this.auth.destination(this.route.snapshot.queryParamMap.get('returnUrl'));
  }
  continue(): Promise<boolean> {
    return this.router.navigateByUrl(this.continuationUrl);
  }
  async finish(): Promise<void> {
    const p = this.route.snapshot.queryParamMap;
    const roomId = p.get('roomId');
    if (p.get('action') === 'favorite' && roomId && this.auth.account()?.role === 'CUSTOMER') {
      try {
        await this.favorites.save(roomId, true);
        this.favoriteSaved.set(true);
      } catch {
        // A failed favorite must not prevent completing registration.
      }
    }
    this.completed.set(true);
    afterNextRender(
      () =>
        this.element.nativeElement.querySelector<HTMLElement>('#register-complete-title')?.focus(),
      { injector: this.injector },
    );
  }
  get params() {
    return {
      returnUrl: this.route.snapshot.queryParamMap.get('returnUrl'),
      roomId: this.route.snapshot.queryParamMap.get('roomId'),
      action: this.route.snapshot.queryParamMap.get('action'),
    };
  }
}

function passwordsMatch(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value;
  const confirmation = control.get('confirm')?.value;
  return !confirmation || password === confirmation ? null : { passwordMismatch: true };
}
