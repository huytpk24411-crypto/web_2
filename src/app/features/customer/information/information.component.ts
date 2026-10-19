import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, Validators } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { ContactService } from '../../../services/contact.service';
import { PHONE_PATTERN } from '../../../shared/validators';

@Component({
  selector: 'app-information',
  standalone: false,
  templateUrl: './information.component.html',
  styleUrls: ['./information.component.css'],
})
export class InformationComponent {
  route = inject(ActivatedRoute);
  auth = inject(AuthService);
  private fb = inject(FormBuilder);
  private contactService = inject(ContactService);

  submitting = false;
  error = '';
  success = '';

  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    phone: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
    email: ['', [Validators.required, Validators.email]],
    message: ['', [Validators.required, Validators.minLength(10)]],
  });

  get isContactPage() {
    return this.route.snapshot.data['contact'] === true;
  }

  constructor() {
    const account = this.auth.account();
    if (account) {
      this.form.patchValue({
        name: account.name || '',
        phone: account.phone || '',
      });
    }
  }

  submit() {
    this.form.markAllAsTouched();
    this.error = '';
    this.success = '';

    if (this.form.invalid || this.submitting) return;

    this.submitting = true;

    try {
      const request = this.contactService.create(this.form.getRawValue());
      this.success = `Yêu cầu của bạn đã được ghi nhận. Mã tin nhắn: ${request.id.slice(-8).toUpperCase()}.`;
      this.form.reset({
        name: this.auth.account()?.name || '',
        phone: this.auth.account()?.phone || '',
        email: '',
        message: '',
      });
    } catch (error) {
      this.error = (error as Error).message;
    } finally {
      this.submitting = false;
    }
  }
}
