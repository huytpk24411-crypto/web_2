import { AbstractControl, ValidationErrors } from '@angular/forms';
export const PHONE_PATTERN = /^(0|\+84)[0-9]{9}$/;
export const USERNAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{2,29}$/;
export function futureDate(control: AbstractControl): ValidationErrors | null {
  return !control.value || new Date(control.value).getTime() <= Date.now()
    ? { future: true }
    : null;
}
