import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../services/auth-service';
import { apiMessage } from '../services/api-message';
import { PHONE_PATTERN, USERNAME_PATTERN } from '../shared/validators';
import { togglePasswordVisibility } from '../auth-layout/password-visibility';
@Component({
  selector: 'app-login',
  standalone: false,
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class LoginComponent {
  auth = inject(AuthService);
  route = inject(ActivatedRoute);
  router = inject(Router);
  private fb = inject(FormBuilder);
  readonly error = signal('');
  readonly submitting = signal(false);
  showPassword = false;
  private readonly remembered = this.auth.getRememberedPhone();
  form = this.fb.nonNullable.group({
    username: [
      this.remembered,
      [
        Validators.required,
        Validators.pattern(
          new RegExp(`(?:${PHONE_PATTERN.source})|(?:${USERNAME_PATTERN.source})`),
        ),
      ],
    ],
    password: ['', Validators.required],
    rememberMe: [!!this.remembered],
  });
  togglePassword(input: HTMLInputElement): void {
    this.showPassword = togglePasswordVisibility(input, this.showPassword);
  }
  async submit() {
    this.form.markAllAsTouched();
    this.error.set('');
    if (this.form.invalid || this.submitting()) return;
    this.submitting.set(true);
    const v = this.form.getRawValue();
    try {
      if (!(await this.auth.login(v.username, v.password, v.rememberMe))) {
        this.error.set('Tên đăng nhập, số điện thoại hoặc mật khẩu không đúng.');
        return;
      }
      await this.router.navigateByUrl(
        this.auth.destination(this.route.snapshot.queryParamMap.get('returnUrl')),
      );
    } catch (error) {
      this.error.set(
        error instanceof HttpErrorResponse && error.status === 401
          ? 'Tên đăng nhập, số điện thoại hoặc mật khẩu không đúng.'
          : apiMessage(error, 'Không đăng nhập được. Vui lòng thử lại.'),
      );
    } finally {
      this.submitting.set(false);
    }
  }
}
