import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, retry, throwError } from 'rxjs';
import { ContactRequest } from '../classes/ContactRequest';
import { FavoriteRecord, ViewingRecord } from '../classes/CustomerApi';
import { Notification } from '../classes/Notification';

@Injectable({ providedIn: 'root' })
export class CustomerAPIService {
  private options = { responseType: 'text' as const, withCredentials: true, timeout: 2000 };
  constructor(private http: HttpClient) {}

  favorites() {
    return this.http.get('/favorites/', this.options).pipe(
      map((res) => JSON.parse(res) as FavoriteRecord[]),
      retry(1),
      catchError(this.handleError),
    );
  }
  addFavorite(roomId: string) {
    return this.http.post('/favorites/', { roomId }, this.options).pipe(
      map((res) => JSON.parse(res) as FavoriteRecord),
      catchError(this.handleError),
    );
  }
  removeFavorite(roomId: string) {
    return this.http.delete('/favorites/' + encodeURIComponent(roomId), this.options).pipe(
      map((res) => JSON.parse(res) as { roomId: string; removed: boolean }),
      catchError(this.handleError),
    );
  }
  contact(data: Omit<ContactRequest, 'id' | 'status' | 'createdAt'>) {
    return this.http.post('/contact-requests', data, this.options).pipe(
      map((res) => JSON.parse(res) as ContactRequest),
      catchError(this.handleError),
    );
  }
  viewings() {
    return this.http.get('/viewings/mine', this.options).pipe(
      map((res) => JSON.parse(res) as ViewingRecord[]),
      retry(1),
      catchError(this.handleError),
    );
  }
  cancelViewing(id: string) {
    return this.http.put('/viewings/' + encodeURIComponent(id) + '/cancel', {}, this.options).pipe(
      map((res) => JSON.parse(res) as ViewingRecord),
      catchError(this.handleError),
    );
  }
  notifications() {
    return this.http.get('/notifications', this.options).pipe(
      map((res) => JSON.parse(res) as Notification[]),
      retry(1),
      catchError(this.handleError),
    );
  }
  readNotification(id: string) {
    return this.http
      .put('/notifications/' + encodeURIComponent(id) + '/read', {}, this.options)
      .pipe(
        map((res) => JSON.parse(res) as Notification),
        catchError(this.handleError),
      );
  }
  readAllNotifications() {
    return this.http.put('/notifications/read-all', {}, this.options).pipe(
      map((res) => JSON.parse(res) as { updated: number }),
      catchError(this.handleError),
    );
  }
  handleError(error: unknown) {
    return throwError(() => error);
  }
}
