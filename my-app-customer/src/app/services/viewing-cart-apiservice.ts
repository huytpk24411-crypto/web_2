import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, retry, throwError } from 'rxjs';
import { ViewingItem, ViewingOut } from '../classes/Viewing';

export interface ViewingCheckout {
  items: ViewingItem[];
  viewerName: string;
  viewerPhone: string;
  peopleCount: number;
  note: string;
}

@Injectable({ providedIn: 'root' })
export class ViewingCartAPIService {
  private options = { responseType: 'text' as const, withCredentials: true, timeout: 2000 };
  constructor(private http: HttpClient) {}

  add(roomId: string) {
    return this.http.post('/viewing-cart/add', { roomId }, this.options).pipe(
      map((res) => JSON.parse(res) as string[]),
      catchError(this.handleError),
    );
  }
  get() {
    return this.http.get('/viewing-cart', this.options).pipe(
      map((res) => JSON.parse(res) as string[]),
      retry(1),
      catchError(this.handleError),
    );
  }
  remove(roomId: string) {
    return this.http.delete('/viewing-cart/' + encodeURIComponent(roomId), this.options).pipe(
      map((res) => JSON.parse(res) as string[]),
      catchError(this.handleError),
    );
  }
  checkout(details: ViewingCheckout) {
    return this.http.post('/viewing-cart/checkout', details, this.options).pipe(
      map((res) => JSON.parse(res) as { bookingId: string; viewings: ViewingOut[] }),
      // A checkout must never be retried automatically: it may already have been saved.
      catchError(this.handleError),
    );
  }
  handleError(error: unknown) {
    return throwError(() => error);
  }
}
