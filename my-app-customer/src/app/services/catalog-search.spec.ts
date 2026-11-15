import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { hasCoordinates, LocationService, straightLineKm } from './location-service';
import { parseRoomFilter, roomFilterParams, RoomSearchService } from './room-search-service';
import { RoomService } from './room-service';
import { API_ROOMS, API_PROPERTIES, API_SCHOOLS, API_RELATIONS } from '../testing/api-fixtures';
describe('API catalog, map and URL contracts', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    try {
      http?.verify();
    } finally {
      try {
        TestBed.resetTestingModule();
      } finally {
        if (vi.isFakeTimers()) vi.clearAllTimers();
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
      }
    }
  });
  it('roundtrips filters and ignores malformed bounds and numeric values', () => {
    const params = {
      q: 'Studio',
      school: 'school-test',
      property: 'property-test',
      maxPrice: 9000000,
      minArea: 30,
      amenities: 'Wifi|Máy lạnh',
      bounds: '10,106,11,107',
      sort: 'price-asc',
    };
    expect(roomFilterParams(parseRoomFilter(params))).toEqual(params);
    expect(
      parseRoomFilter({ bounds: 'a,b,c,d', maxPrice: 'Infinity', status: 'HIDDEN' }).bounds,
    ).toBeUndefined();
    expect(parseRoomFilter({ maxPrice: 'Infinity' }).maxPrice).toBeUndefined();
  });
  it('filters only the published API catalog for cards and map', async () => {
    const rooms = TestBed.inject(RoomService),
      http = TestBed.inject(HttpTestingController),
      pending = rooms.refresh();
    http.expectOne('/data/rooms').flush(JSON.stringify(API_ROOMS));
    http.expectOne('/data/properties').flush(JSON.stringify(API_PROPERTIES));
    http.expectOne('/data/schools').flush(JSON.stringify(API_SCHOOLS));
    http.expectOne('/data/property-schools').flush(JSON.stringify(API_RELATIONS));
    await pending;
    const result = rooms.filter({
      propertyId: 'property-test',
      minPrice: 4800000,
      minArea: 30,
      amenities: ['Wifi'],
      status: 'AVAILABLE',
    });
    expect(result.map((room) => room.id)).toEqual(['phong-48', 'phong-49', 'phong-50']);
    expect(rooms.filter({ bounds: [0, 0, 1, 1] })).toEqual([]);
  });
  it('shows straight-line distances only with sourced coordinates', () => {
    const locations = TestBed.inject(LocationService);
    locations.setCatalog(API_PROPERTIES, API_SCHOOLS, API_RELATIONS);
    expect(locations.distance('property-test', 'school-test')).toBeGreaterThan(0);
    locations.setCatalog(
      [{ ...API_PROPERTIES[0], locationStatus: 'pending' }],
      API_SCHOOLS,
      API_RELATIONS,
    );
    expect(locations.distance('property-test', 'school-test')).toBeUndefined();
    expect(hasCoordinates({ lat: null, lng: null })).toBe(false);
    expect(straightLineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111.195, 2);
  });
  it('parses and serializes only the enabled hasTour flag', () => {
    expect(parseRoomFilter({ hasTour: '1' }).hasTour).toBe(true);
    expect(parseRoomFilter({ hasTour: '0' }).hasTour).toBeUndefined();
    expect(parseRoomFilter({ hasTour: 'true' }).hasTour).toBeUndefined();
    expect(roomFilterParams({ hasTour: true })).toEqual({ hasTour: 1 });
    expect(roomFilterParams({ hasTour: false })).toEqual({});
    expect(roomFilterParams({})).toEqual({});
  });
  it('filters tour rooms within the available published catalog', async () => {
    const rooms = TestBed.inject(RoomService);
    const pending = rooms.refresh();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/data/rooms').flush(JSON.stringify(API_ROOMS));
    http.expectOne('/data/properties').flush(JSON.stringify(API_PROPERTIES));
    http.expectOne('/data/schools').flush(JSON.stringify(API_SCHOOLS));
    http.expectOne('/data/property-schools').flush(JSON.stringify(API_RELATIONS));
    await pending;
    expect(rooms.filter({ hasTour: true }).map((room) => room.id)).toEqual([
      'phong-48',
      'phong-49',
      'phong-50',
    ]);
    expect(rooms.filter({ hasTour: true, maxPrice: 4900000 }).map((room) => room.id)).toEqual([
      'phong-48',
      'phong-49',
    ]);
    expect(rooms.filter({ hasTour: false })).toHaveLength(5);
  });
  it('labels and removes the tour chip without losing other filters', () => {
    const search = TestBed.inject(RoomSearchService);
    search.filter.set({ hasTour: true, capacity: 2 });
    expect(search.chips()).toContainEqual({ key: 'hasTour', label: 'Có tour 360°' });
    search.remove('hasTour');
    expect(search.params()).toEqual({ capacity: 2 });
    expect(search.chips().some((chip) => chip.key === 'hasTour')).toBe(false);
  });
});
