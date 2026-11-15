import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, throwError } from 'rxjs';
import { ApiViewingRoom } from '../classes/ShiftApi';
import { PORTAL } from '../portal';
import { shiftApiMessage } from './shift-apiservice';

@Injectable({ providedIn: 'root' })
export class ViewingAPIService {
  private options = {
    headers: new HttpHeaders({ 'Content-Type': 'application/json', 'X-iHouzz-Portal': PORTAL }),
    responseType: 'text' as const,
    withCredentials: true,
    timeout: 10000,
  };
  constructor(private http: HttpClient) {}

  updateStatus(id: string, status: 'DA_XAC_NHAN' | 'DA_XEM') {
    return this.http
      .put('/viewings/' + encodeURIComponent(id) + '/status', { status }, this.options)
      .pipe(
        map((response) => JSON.parse(response) as unknown),
        catchError((error: unknown) => throwError(() => new Error(this.message(error)))),
      );
  }

  updateDetail(detailId: string, viewStatus: ApiViewingRoom['viewStatus'], note: string) {
    return this.http
      .put('/viewing-details/' + encodeURIComponent(detailId), { viewStatus, note }, this.options)
      .pipe(
        map((response) => JSON.parse(response) as unknown),
        catchError((error: unknown) => throwError(() => new Error(this.message(error)))),
      );
  }

  message(error: unknown) {
    return shiftApiMessage(error);
  }
}
