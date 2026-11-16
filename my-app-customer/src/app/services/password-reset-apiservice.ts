import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { PasswordResetCompletion, PasswordResetRequest, PasswordResetVerification } from '../classes/PasswordReset';
@Injectable({ providedIn: 'root' })
export class PasswordResetAPIService {
  constructor(private readonly http: HttpClient) {}
  requestPin(phone: string): Observable<PasswordResetRequest> {
    return this.http.post<PasswordResetRequest>('/auth/password-reset/request', { phone }, { withCredentials: true, timeout: 15000 });
  }
  verifyPin(requestId: string, pin: string): Observable<PasswordResetVerification> {
    return this.http.post<PasswordResetVerification>('/auth/password-reset/verify', { requestId, pin }, { withCredentials: true, timeout: 15000 });
  }
  completeReset(body: PasswordResetCompletion): Observable<{message: string}> {
    return this.http.post<{message: string}>('/auth/password-reset/complete', body, { withCredentials: true, timeout: 15000 });
  }
}
