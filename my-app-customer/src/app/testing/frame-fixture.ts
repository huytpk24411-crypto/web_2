import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  HttpInterceptorFn,
  HttpResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { AuthService } from '../services/auth-service';
import { RoomService } from '../services/room-service';
import { LocationService } from '../services/location-service';
import {
  API_ACCOUNT,
  API_ROOMS,
  API_PROPERTIES,
  API_SCHOOLS,
  API_RELATIONS,
  API_HOLD,
  API_PAYMENT,
} from './api-fixtures';

/** Component fixtures use independent HTTP responses and a catalog service mock. */
class FrameRoomService extends RoomService {
  override readonly loading = signal(false);
  override readonly apiAvailable = signal(true);
  override readonly publishedRooms = computed(() =>
    structuredClone(
      API_ROOMS.filter(
        (room) => room.status === 'AVAILABLE' && room.publicationStatus === 'PUBLISHED',
      ),
    ),
  );
  override get(id: string) {
    return structuredClone(API_ROOMS.find((room) => room.id === id));
  }
  override readonly rooms = computed(() =>
    this.publishedRooms().filter((room) => room.status === 'AVAILABLE'),
  );
  override async refresh(): Promise<void> {}
}
const frameApi: HttpInterceptorFn = (request) => {
  const responses: Record<string, unknown> = {
    '/auth/profile': API_ACCOUNT,
    '/auth/logout': {},
    '/favorites/': [],
    '/notifications': [],
    '/viewing-cart': ['phong-48'],
    '/viewings/mine': [],
    '/data/me/holds': { items: [API_HOLD] },
    '/data/payments/payment-test': API_PAYMENT,
  };
  if (!(request.url in responses) && request.method === 'GET' && request.url.startsWith('/data/')) {
    responses[request.url] =
      request.url === '/data/rooms'
        ? API_ROOMS
        : request.url === '/data/rooms/phong-48'
          ? API_ROOMS[2]
          : [];
  }
  if (!(request.url in responses))
    return throwError(
      () => new Error('Unexpected fixture request: ' + request.method + ' ' + request.url),
    );
  const value = responses[request.url];
  return of(
    new HttpResponse({
      status: 200,
      body: request.responseType === 'text' ? JSON.stringify(value) : structuredClone(value),
    }),
  );
};
export function seedFrameFixture(feature: string, _frame: string): void {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([frameApi])),
      { provide: RoomService, useClass: FrameRoomService },
    ],
  });
  const auth = TestBed.inject(AuthService);
  auth.account.set({
    ...API_ACCOUNT,
    role: feature === 'admin' ? 'ADMIN' : feature === 'employee' ? 'EMPLOYEE' : 'CUSTOMER',
  });
  auth.serverAuthenticated.set(true);
  TestBed.inject(LocationService).setCatalog(
    structuredClone(API_PROPERTIES),
    structuredClone(API_SCHOOLS),
    structuredClone(API_RELATIONS),
  );
}
