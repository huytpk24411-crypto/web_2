import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable, retry, throwError } from 'rxjs';
import { School } from '../classes/School';

@Injectable({ providedIn: 'root' })
export class SchoolAPIService {
  headers = new HttpHeaders().set('Content-Type', 'text/plain;charset=utf-8');
  requestOptions = {
    headers: this.headers,
    responseType: 'text' as const,
    timeout: 2000,
  };
  constructor(private _http: HttpClient) {}

  getSchools(): Observable<School[]> {
    return this._http.get('/data/schools', this.requestOptions).pipe(
      map((res) => JSON.parse(res) as School[]),
      retry(1),
      catchError(this.handleError),
    );
  }
  handleError(error: HttpErrorResponse) {
    return throwError(() => error);
  }
}
