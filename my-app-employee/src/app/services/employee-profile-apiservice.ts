import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { EmployeeProfile } from '../classes/EmployeeProfile';
@Injectable({ providedIn: 'root' })
export class EmployeeProfileAPIService {
 constructor(private readonly http: HttpClient) {}
 getProfile(): Observable<EmployeeProfile> { return this.http.get<EmployeeProfile>('/data/me/employee', {withCredentials: true, timeout:10000}); }
}
