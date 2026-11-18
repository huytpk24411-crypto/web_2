import { signal, Type } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { EmployeeModule } from './employee-module';
import { AuthService } from '../services/auth-service';
import { RoomService } from '../services/room-service';

export async function employeeHttpTest<T>(
  component: Type<T>,
  values: Record<string, unknown> = {},
) {
  await TestBed.configureTestingModule({
    imports: [EmployeeModule],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: AuthService,
        useValue: {
          account: signal({ id: 'account-a', name: 'Nhân viên A', role: 'EMPLOYEE' }),
          serverAuthenticated: signal(true),
          isEmployee: () => true,
          logout: async () => {},
        },
      },
      {
        provide: RoomService,
        useValue: {
          rooms: signal([]),
          publishedRooms: signal([]),
          get: () => undefined,
          forRecord: RoomService.prototype.forRecord,
          refresh: async () => {},
        },
      },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap({ id: 'record-a' }),
            queryParamMap: convertToParamMap({}),
          },
          params: of({ id: 'record-a' }),
          queryParams: of({}),
        },
      },
    ],
  }).compileComponents();
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  await flushEmployeeReads(http, values);
  fixture.detectChanges();
  return { fixture, http };
}
export async function flushEmployeeReads(
  http: HttpTestingController,
  values: Record<string, unknown> = {},
) {
  const defaults: Record<string, unknown> = {
    '/data/registration-periods': [],
    '/data/me/shift-assignments': [],
    '/data/me/payroll-periods': [],
    '/data/holds/creditable': [],
    '/data/payments': { items: [] },
    '/data/deposits': { items: [] },
    '/data/contracts': { items: [] },
    '/data/brokerage-transactions': [],
    '/data/me/shift-assignments/record-a/tasks': [],
    '/notifications': [],
    '/data/company': {
      name: 'Công ty CP Bất Động Sản Houzz Uni',
      taxCode: '3703361326',
      address: '669 Do Muoi, Quarter 3, Linh Xuan Ward, Ho Chi Minh City, Vietnam.',
      hotline: '19001080',
    },
    '/data/me/employee': {
      id: 'employee-a',
      position: 'Tư vấn',
      avatar: '',
      fullName: 'Nhân viên A',
    },
  };
  for (let i = 0; i < 12; i++) {
    await Promise.resolve();
    for (const req of http.match((r) => r.method === 'GET')) {
      const value = values[req.request.urlWithParams] ?? defaults[req.request.urlWithParams];
      if (value === undefined) throw new Error('Unexpected GET ' + req.request.urlWithParams);
      req.flush(req.request.responseType === 'text' ? JSON.stringify(value) : value);
    }
  }
}
