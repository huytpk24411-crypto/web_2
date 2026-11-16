import { Component, DestroyRef, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { PasswordResetAPIService } from '../services/password-reset-apiservice';
import { firstValueFrom } from 'rxjs';
@Component({
  selector: 'app-forgot-password',
  standalone: false,
  templateUrl: './forgot-password.html',
  styleUrls: ['./forgot-password.css'],
})
export class ForgotPasswordComponent {
  private api = inject(PasswordResetAPIService);
  private fb = inject(FormBuilder);
  private destroy = inject(DestroyRef);
  @ViewChild('firstInput') private firstInput?: ElementRef<HTMLInputElement>;
  readonly step = signal<'phone' | 'pin' | 'password' | 'done'>('phone');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly remaining = signal(0);
  readonly resendRemaining = signal(0);
  showPassword = false;
  readonly phone = this.fb.nonNullable.control('', [
    Validators.required,
    Validators.pattern(/^(?:0|\+84)[35789]\d{8}$/),
  ]);
  readonly pin = this.fb.nonNullable.control('', [
    Validators.required,
    Validators.pattern(/^\d{6}$/),
  ]);
  readonly password = this.fb.nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
    confirm: ['', Validators.required],
  });
  private requestId = '';
  private token = '';
  private expiresAt = 0;
  private resendAt = 0;
  constructor() {
    const timer = setInterval(() => {
      this.remaining.set(Math.max(0, Math.ceil((this.expiresAt - Date.now()) / 1000)));
      this.resendRemaining.set(Math.max(0, Math.ceil((this.resendAt - Date.now()) / 1000)));
    }, 1000);
    this.destroy.onDestroy(() => {
      clearInterval(timer);
      this.token = '';
    });
  }
  focusFirstInput() {
    this.firstInput?.nativeElement.focus();
  }
  private fail(error: any) {
    this.error.set(error?.error?.message || 'Không kết nối được máy chủ. Vui lòng thử lại.');
  }
  async requestPin() {
    if (this.busy() || this.resendRemaining() > 0) return;
    this.phone.markAsTouched();
    if (this.phone.invalid) return;
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    try {
      const value = await firstValueFrom(this.api.requestPin(this.phone.value));
      this.requestId = value.requestId;
      this.token = '';
      this.pin.reset();
      this.password.reset();
      this.expiresAt = Date.now() + value.expiresIn * 1000;
      this.remaining.set(value.expiresIn);
      this.resendAt = Date.now() + value.resendAfter * 1000;
      this.resendRemaining.set(value.resendAfter);
      this.message.set(value.message);
      this.step.set('pin');
    } catch (error) {
      this.fail(error);
    } finally {
      this.busy.set(false);
    }
  }
  async verify() {
    if (this.busy()) return;
    this.pin.markAsTouched();
    if (this.pin.invalid || !this.remaining()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const value = await firstValueFrom(this.api.verifyPin(this.requestId, this.pin.value));
      this.token = value.token;
      this.pin.reset();
      this.expiresAt = Date.now() + value.expiresIn * 1000;
      this.remaining.set(value.expiresIn);
      this.message.set('Mã PIN hợp lệ. Bạn có thể đặt mật khẩu mới.');
      this.step.set('password');
    } catch (error) {
      this.fail(error);
    } finally {
      this.busy.set(false);
    }
  }
  async complete() {
    if (this.busy()) return;
    this.password.markAllAsTouched();
    this.error.set('');
    if (this.password.invalid) return;
    const value = this.password.getRawValue();
    if (value.password !== value.confirm) {
      this.error.set('Hai mật khẩu chưa trùng khớp.');
      return;
    }
    if (!this.remaining()) {
      this.error.set('Phiên đặt lại mật khẩu đã hết hạn. Vui lòng yêu cầu mã mới.');
      return;
    }
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.completeReset({
        requestId: this.requestId,
        token: this.token,
        password: value.password,
      }));
      this.token = '';
      this.password.reset();
      this.message.set('Đã đặt lại mật khẩu. Vui lòng đăng nhập bằng mật khẩu mới.');
      this.step.set('done');
    } catch (error) {
      this.fail(error);
    } finally {
      this.busy.set(false);
    }
  }
  changePhone() {
    if (this.busy()) return;
    this.step.set('phone');
    this.token = '';
    this.requestId = '';
    this.error.set('');
    this.message.set('');
    this.pin.reset();
    this.password.reset();
  }
}
