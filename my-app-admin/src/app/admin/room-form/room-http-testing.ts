import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../services/auth-service';
import { RoomService } from '../../services/room-service';
import { Room } from '../../classes/Room';
import { AdminModule } from '../admin-module';

export const TEST_ROOM: Room = {
  id: 'room-test',
  code: 'ROOM_101',
  name: 'Phòng kiểm thử',
  propertyId: 'property-test',
  number: '101',
  address: 'Địa chỉ kiểm thử',
  district: 'Thủ Đức',
  price: 4000000,
  deposit: 4000000,
  area: 24,
  capacity: 2,
  type: 'STUDIO',
  status: 'AVAILABLE',
  publicationStatus: 'DRAFT',
  images: ['/uploads/rooms/one.png', '/uploads/rooms/two.png', '/uploads/rooms/three.png'],
  amenities: ['Wifi'],
  featured: false,
  hasHistory: false,
  description: 'Phòng có cửa sổ',
};
export const TEST_PROPERTY = {
  id: 'property-test',
  name: 'Tòa kiểm thử',
  address: 'Địa chỉ kiểm thử',
  district: 'Thủ Đức',
  lat: null,
  lng: null,
};
export const TEST_EMPLOYEE = {
  id: 'employee-test',
  employeeCode: 'NV101',
  fullName: 'Nhân viên kiểm thử',
  phone: '0901234567',
  email: 'staff@example.test',
  status: 'ACTIVE',
  birthDate: '2000-01-01',
  gender: 'OTHER',
  startDate: '2025-01-01',
  position: 'Tư vấn',
  contractType: 'FULL_TIME',
  workLocationId: '',
  avatar: '/uploads/employees/avatar.png',
};
export const EMPTY_SHIFT_STATE = {
  Shift: [],
  ShiftAssignment: [],
  Attendance: [],
  WorkLocation: [],
  Employee: [],
  Task: [],
  Policy: [],
  PolicyLevel: [],
};
export async function setupAdminHttp(params: Record<string, string> = { id: TEST_ROOM.id }) {
  await TestBed.configureTestingModule({
    imports: [AdminModule],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: AuthService,
        useValue: {
          account: signal({ id: 'admin-test', role: 'ADMIN' }),
          serverAuthenticated: signal(true),
        },
      },
      { provide: RoomService, useValue: { refresh: async () => {} } },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap(params),
            queryParamMap: convertToParamMap({}),
            data: {},
          },
          paramMap: of(convertToParamMap(params)),
          queryParamMap: of(convertToParamMap({})),
          queryParams: of({}),
          params: of(params),
        },
      },
    ],
  }).compileComponents();
  return TestBed.inject(HttpTestingController);
}
export async function settleAdminHttp(
  fixture: ComponentFixture<unknown>,
  http: HttpTestingController,
) {
  const responses: Record<string, object> = {
    '/data/rooms': [TEST_ROOM],
    '/data/rooms/room-test': TEST_ROOM,
    '/data/rooms/room-test/price-history': [],
    '/data/admin/properties': [TEST_PROPERTY],
    '/data/admin/owners': [],
    '/data/admin/employees': [TEST_EMPLOYEE],
    '/data/admin/employees/employee-test': TEST_EMPLOYEE,
    '/data/admin/work-locations': [],
    '/data/admin/registration-periods': [],
    '/data/admin/shift-state': EMPTY_SHIFT_STATE,
    '/api/amenities': [{ id: 'wifi', name: 'Wifi' }],
  };
  for (let i = 0; i < 12; i++) {
    fixture.detectChanges();
    for (const request of http.match(() => true)) {
      if (request.request.method !== 'GET' || !(request.request.url in responses))
        throw new Error(`Unexpected request ${request.request.method} ${request.request.url}`);
      request.flush(responses[request.request.url]);
    }
    await Promise.resolve();
  }
  await fixture.whenStable();
}
