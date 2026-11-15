import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable, retry, throwError } from 'rxjs';
import { Property, PropertySchool } from '../classes/Property';

@Injectable({ providedIn: 'root' })
export class PropertyAPIService {
  headers = new HttpHeaders().set('Content-Type', 'text/plain;charset=utf-8');
  requestOptions = {
    headers: this.headers,
    responseType: 'text' as const,
    timeout: 2000,
  };
  constructor(private _http: HttpClient) {}

  getProperties(): Observable<Property[]> {
    return this._http.get('/data/properties', this.requestOptions).pipe(
      map((res) => JSON.parse(res) as Property[]),
      retry(1),
      catchError(this.handleError),
    );
  }
  getPropertySchools(): Observable<PropertySchool[]> {
    return this._http.get('/data/property-schools', this.requestOptions).pipe(
      map((res) => JSON.parse(res) as PropertySchool[]),
      retry(1),
      catchError(this.handleError),
    );
  }
  handleError(error: HttpErrorResponse) {
    return throwError(() => error);
  }
}
