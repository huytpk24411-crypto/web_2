import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, retry, throwError } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthAPIService {
  private options = { responseType: 'text' as const, withCredentials: true, timeout: 2000 };
  constructor(private http: HttpClient) {}

  register(phone: string, password: string, name: string, username: string, email?: string) {
    return this.http
      .post(
        '/user-register',
        { phone, password, name, username, ...(email ? { email } : {}) },
        this.options,
      )
      .pipe(
        map((res) => JSON.parse(res) as { user: unknown }),
        catchError(this.handleError),
      );
  }

  login(phone: string, password: string, rememberMe: boolean) {
    return this.http.post('/user-login', { phone, password, rememberMe }, this.options).pipe(
      map((res) => JSON.parse(res) as { user: unknown }),
      catchError(this.handleError),
    );
  }
  profile() {
    return this.http.get('/auth/profile', this.options).pipe(
      map((res) => JSON.parse(res) as unknown),
      retry(1),
      catchError(this.handleError),
    );
  }
  logout() {
    return this.http.post('/auth/logout', {}, this.options).pipe(
      map((res) => JSON.parse(res) as unknown),
      catchError(this.handleError),
    );
  }
  handleError(error: unknown) {
    // Preserve status and parse errors so callers can distinguish offline from a rejected login.
    return throwError(() => error);
  }
}
