import { Component, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { USERNAME_PATTERN } from '../../../shared/validators';
@Component({
  selector: 'app-login',
  standalone: false,
  templateUrl: './login.component.html',
})
export class LoginComponent {
  auth = inject(AuthService);
  route = inject(ActivatedRoute);
  router = inject(Router);
  private fb = inject(FormBuilder);
  error = '';
  submitting = false;
  showPassword = false;
  form = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.pattern(USERNAME_PATTERN)]],
    password: ['', Validators.required],
  });
  async submit() {
    this.form.markAllAsTouched();
    this.error = '';
    if (this.form.invalid || this.submitting) return;
    this.submitting = true;
    const v = this.form.getRawValue();
    try {
      if (!this.auth.login(v.username, v.password)) {
        this.error = 'Tên đăng nhập hoặc mật khẩu không đúng. Tài khoản minh họa: admin123 / 123.';
        return;
      }
      this.finish();
    } finally {
      this.submitting = false;
    }
  }
  finish() {
    const p = this.route.snapshot.queryParamMap;
    let dest = this.auth.destination(p.get('returnUrl'));
    if (
      p.get('action') === 'favorite' &&
      this.auth.account()?.role === 'CUSTOMER' &&
      /^\/rooms\/[^/?]+$/.test(dest)
    ) {
      dest += '?action=favorite&roomId=' + encodeURIComponent(p.get('roomId') || '');
    }
    this.router.navigateByUrl(dest);
  }
  get params() {
    return {
      returnUrl: this.route.snapshot.queryParamMap.get('returnUrl'),
      roomId: this.route.snapshot.queryParamMap.get('roomId'),
      action: this.route.snapshot.queryParamMap.get('action'),
    };
  }
}
