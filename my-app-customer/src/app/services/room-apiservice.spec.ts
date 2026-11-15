import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { RoomAPIService } from './room-apiservice';
import { RoomService } from './room-service';
import { PropertyAPIService } from './property-apiservice';
import { SchoolAPIService } from './school-apiservice';
import { LocationService } from './location-service';
import { API_ROOMS, API_PROPERTIES, API_SCHOOLS, API_RELATIONS } from '../testing/api-fixtures';
describe('Catalog API transport and initialization', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('preserves API room tours and encodes IDs', () => {
    const loaded = vi.fn();
    TestBed.inject(RoomAPIService).getRoom('a/b ?').subscribe(loaded);
    const req = http.expectOne('/data/rooms/a%2Fb%20%3F');
    expect(req.request.withCredentials).toBe(true);
    req.flush(JSON.stringify(API_ROOMS[0]));
    expect(loaded).toHaveBeenCalledWith(API_ROOMS[0]);
  });
  it.each(['POST', 'PUT', 'DELETE'])('sends %s with JSON and preserves rejection', (method) => {
    const api = TestBed.inject(RoomAPIService),
      rejected = vi.fn();
    (method === 'POST'
      ? api.postRoom(API_ROOMS[0])
      : method === 'PUT'
        ? api.putRoom(API_ROOMS[0])
        : api.deleteRoom(API_ROOMS[0].id)
    ).subscribe({ error: rejected });
    const req = http.expectOne('/data/rooms' + (method === 'DELETE' ? '/' + API_ROOMS[0].id : ''));
    expect(req.request.method).toBe(method);
    if (method !== 'DELETE') expect(JSON.parse(req.request.body)).toEqual(API_ROOMS[0]);
    req.flush('{}', { status: 403, statusText: 'Forbidden' });
    expect(rejected.mock.calls[0][0].status).toBe(403);
  });
  function initialize() {
    return TestBed.inject(RoomService).initializeCatalog(
      TestBed.inject(RoomAPIService),
      TestBed.inject(PropertyAPIService),
      TestBed.inject(SchoolAPIService),
    );
  }
  function flushCatalog() {
    http.expectOne('/data/rooms').flush(JSON.stringify(API_ROOMS));
    http.expectOne('/data/properties').flush(JSON.stringify(API_PROPERTIES));
    http.expectOne('/data/schools').flush(JSON.stringify(API_SCHOOLS));
    http.expectOne('/data/property-schools').flush(JSON.stringify(API_RELATIONS));
  }
  it('reads one authoritative catalog and initializes only once', async () => {
    const first = initialize(),
      second = initialize();
    expect(first).toBe(second);
    flushCatalog();
    await first;
    const rooms = TestBed.inject(RoomService);
    expect(rooms.apiAvailable()).toBe(true);
    expect(rooms.loading()).toBe(false);
    expect(rooms.publishedRooms()).toEqual(
      API_ROOMS.filter(
        (room) => room.status === 'AVAILABLE' && room.publicationStatus === 'PUBLISHED',
      ),
    );
    expect(rooms.get('phong-48')).toEqual(API_ROOMS[2]);
    expect(TestBed.inject(LocationService).schools).toEqual(API_SCHOOLS);
    expect(rooms.rooms().every((room) => room.status === 'AVAILABLE')).toBe(true);
    const detail = rooms.getFromApi('phong-46');
    const rejected = expect(detail).rejects.toThrow('Phòng hiện không còn trống');
    http.expectOne('/data/rooms/phong-46').flush(JSON.stringify(API_ROOMS[0]));
    await rejected;
  });
  it.each([0, 503])(
    'catalog failure %s shows an error and stays empty until an explicit retry',
    async (status) => {
      const pending = initialize();
      for (let attempt = 0; attempt < 2; attempt++) {
        const req = http.expectOne('/data/rooms');
        if (!status) req.error(new ProgressEvent('error'));
        else req.flush('offline', { status, statusText: 'Unavailable' });
      }
      // forkJoin cancels its other pending reads when a source fails.
      http
        .match(() => true)
        .forEach((req) => {
          if (!req.cancelled) req.flush('[]');
        });
      await pending;
      const rooms = TestBed.inject(RoomService);
      expect(rooms.publishedRooms()).toEqual([]);
      expect(TestBed.inject(LocationService).properties()).toEqual([]);
      expect(rooms.error()).toBe('Không kết nối được máy chủ. Vui lòng thử lại.');
      const detail = rooms.getFromApi('phong-48');
      const rejected = expect(detail).rejects.toMatchObject({ status: 503 });
      for (let attempt = 0; attempt < 2; attempt++)
        http
          .expectOne('/data/rooms/phong-48')
          .flush('{}', { status: 503, statusText: 'Unavailable' });
      await rejected;
      const retry = rooms.refresh();
      flushCatalog();
      await retry;
      expect(rooms.error()).toBe('');
      expect(rooms.get('phong-48')).toBeDefined();
    },
  );
  it('uses a historical snapshot without adding it to search results or creating a room link', () => {
    const rooms = TestBed.inject(RoomService);
    const roomSnapshot = {
      id: 'deleted',
      code: 'P101',
      name: 'Phòng lưu trữ',
      type: 'STUDIO',
      address: 'Địa chỉ lưu trữ',
      propertyId: 'property',
      propertyName: 'Tòa A',
      ownerId: 'owner',
      monthlyRent: 4000000,
      area: 25,
      capacity: 2,
    };
    expect(rooms.forRecord({ roomId: 'deleted', roomSnapshot })).toMatchObject(roomSnapshot);
    expect(rooms.get('deleted')).toBeUndefined();
    expect(rooms.rooms()).toEqual([]);
    expect(rooms.forRecord({ roomId: 'old-without-snapshot' })).toBeUndefined();
  });
});
