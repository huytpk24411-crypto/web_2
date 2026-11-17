import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';
import { Room } from '../classes/Room';
import { RoomTour } from '../classes/RoomTour';
export type CatalogRoom = Room & { tour?: RoomTour };

@Injectable({ providedIn: 'root' })
export class RoomAPIService {
  headers = new HttpHeaders().set('Content-Type', 'text/plain;charset=utf-8');
  requestOptions = {
    headers: this.headers,
    responseType: 'text' as const,
    withCredentials: true,
    timeout: 2000,
  };
  constructor(private _http: HttpClient) {}

  getRooms(): Observable<CatalogRoom[]> {
    return this._http.get('/data/rooms', this.requestOptions).pipe(
      map((res) => JSON.parse(res) as CatalogRoom[]),
      catchError(this.handleError),
    );
  }
  getRoom(id: string): Observable<CatalogRoom> {
    return this._http.get('/data/rooms/' + encodeURIComponent(id), this.requestOptions).pipe(
      map((res) => JSON.parse(res) as CatalogRoom),
      catchError(this.handleError),
    );
  }
  postRoom(room: Room): Observable<Room> {
    const jsonString = JSON.stringify(room);
    const postOptions = {
      ...this.requestOptions,
      headers: this.headers.set('Content-Type', 'application/json'),
    };
    return this._http.post('/data/rooms', jsonString, postOptions).pipe(
      map((res) => JSON.parse(res) as CatalogRoom),
      catchError(this.handleError),
    );
  }
  putRoom(room: Room): Observable<Room> {
    const jsonString = JSON.stringify(room);
    const putOptions = {
      ...this.requestOptions,
      headers: this.headers.set('Content-Type', 'application/json'),
    };
    return this._http.put('/data/rooms', jsonString, putOptions).pipe(
      map((res) => JSON.parse(res) as CatalogRoom),
      catchError(this.handleError),
    );
  }
  deleteRoom(id: string): Observable<Room> {
    return this._http.delete('/data/rooms/' + encodeURIComponent(id), this.requestOptions).pipe(
      map((res) => JSON.parse(res) as CatalogRoom),
      catchError(this.handleError),
    );
  }
  handleError(error: HttpErrorResponse) {
    return throwError(() => error);
  }
}
