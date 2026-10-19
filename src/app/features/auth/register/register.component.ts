import { Component, inject } from '@angular/core';
import { AbstractControl, FormBuilder, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { PHONE_PATTERN, USERNAME_PATTERN } from '../../../shared/validators';
@Component({
  selector: 'app-register',
  standalone: false,
  templateUrl: './register.component.html',
})
export class RegisterComponent {
  auth = inject(AuthService);
  route = inject(ActivatedRoute);
  router = inject(Router);
  private fb = inject(FormBuilder);
  error = '';
  submitting = false;
  showPassword = false;
  showConfirmPassword = false;
  form = this.fb.nonNullable.group(
    {
      username: ['', [Validators.required, Validators.pattern(USERNAME_PATTERN)]],
      name: ['', [Validators.required, Validators.minLength(2)]],
      phone: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirm: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  async submit() {
    this.form.markAllAsTouched();
    this.error = '';
    if (this.form.invalid || this.submitting) return;
    this.submitting = true;
    const v = this.form.getRawValue();
    try {
      if (!this.auth.register(v.username, v.name, v.phone, v.password)) {
        this.error = 'Tên đăng nhập hoặc số điện thoại đã được sử dụng.';
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

function passwordsMatch(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value;
  const confirmation = control.get('confirm')?.value;
  return !confirmation || password === confirmation ? null : { passwordMismatch: true };
}
