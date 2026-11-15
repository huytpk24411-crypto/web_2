import { Component, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth-service';
import { ContactService } from '../../services/contact-service';
import { PHONE_PATTERN } from '../../shared/validators';
import { apiMessage } from '../../services/api-message';

@Component({
  selector: 'app-customer-contact',
  standalone: false,
  templateUrl: './customer-contact.html',
  styleUrls: ['./customer-contact.css'],
})
export class CustomerContactComponent {
  route = inject(ActivatedRoute);
  auth = inject(AuthService);
  private fb = inject(FormBuilder);
  private contactService = inject(ContactService);

  readonly submitting = signal(false);
  readonly error = signal('');
  readonly success = signal('');

  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    phone: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
    email: ['', [Validators.required, Validators.email]],
    message: ['', [Validators.required, Validators.minLength(10)]],
  });

  constructor() {
    const account = this.auth.account();
    if (account) {
      this.form.patchValue({
        name: account.name || '',
        phone: account.phone || '',
      });
    }
  }

  async submit() {
    this.form.markAllAsTouched();
    if (this.submitting()) return;
    this.error.set('');
    this.success.set('');

    if (this.form.invalid) return;

    this.submitting.set(true);

    try {
      const request = await this.contactService.send(this.form.getRawValue());
      this.success.set(
        `Yêu cầu của bạn đã được ghi nhận. Mã tin nhắn: ${request.id.slice(-8).toUpperCase()}.`,
      );
      this.form.reset({
        name: this.auth.account()?.name || '',
        phone: this.auth.account()?.phone || '',
        email: '',
        message: '',
      });
    } catch (error) {
      this.error.set(apiMessage(error, 'Không gửi được yêu cầu tư vấn. Vui lòng thử lại.'));
    } finally {
      this.submitting.set(false);
    }
  }
}
