import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DemoStore, initialState } from './demo-store.service';
import { LocationService, straightLineKm, hasCoordinates } from './location.service';
import { RoomService } from './room.service';
import { parseRoomFilter, roomFilterParams } from './room-search.service';
import { SEED_ROOMS } from '../data/rooms';

describe('Catalog, map and URL data contracts', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });
  });
  it('migrates old catalog without losing holds, favorites, hidden rooms or custom rooms', () => {
    const old = initialState();
    delete old.catalogVersion;
    old.rooms[0] = { ...old.rooms[0], propertyId: 'wrong', images: ['old.jpg'], status: 'HELD' };
    old.rooms[1].publicationStatus = 'HIDDEN';
    old.rooms.push({ ...old.rooms[0], id: 'custom', images: ['custom.jpg'] });
    old.favorites.push({ customerId: 'customer1', roomId: 'r1' });
    old.bookings.push({
      id: 'hold1',
      roomId: 'r1',
      customerId: 'customer1',
      status: 'CONFIRMED',
      name: 'Demo',
      phone: '0901234567',
      amount: 100000,
      createdAt: '2026-10-09',
    });
    localStorage.setItem('ihouzz-demo-v1', JSON.stringify(old));
    const state = TestBed.inject(DemoStore).state();
    expect(state.catalogVersion).toBe(5);
    expect(state.rooms[0].images).toEqual(SEED_ROOMS[0].images);
    expect(state.rooms[0].status).toBe('HELD');
    expect(state.rooms[1].publicationStatus).toBe('HIDDEN');
    expect(state.rooms.at(-1)?.images).toEqual(['custom.jpg']);
    expect(state.bookings).toEqual(old.bookings);
    expect(state.favorites).toEqual(old.favorites);
    expect(
      JSON.parse(localStorage.getItem('ihouzz-demo-before-catalog-v4')!).rooms[0].images,
    ).toEqual(['old.jpg']);
  });
  it('retains migrated business data when browser storage is full', () => {
    const old = initialState();
    delete old.catalogVersion;
    old.favorites.push({ customerId: 'c', roomId: 'r1' });
    localStorage.setItem('ihouzz-demo-v1', JSON.stringify(old));
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(TestBed.inject(DemoStore).state().favorites).toEqual(old.favorites);
    spy.mockRestore();
  });
  it('restores customer listings from v4 snapshots missing publication fields without losing edits', () => {
    const old = initialState();
    old.catalogVersion = 4;
    old.rooms = old.rooms.map((room) => {
      const legacy = { ...room };
      delete (legacy as Partial<typeof room>).publicationStatus;
      delete legacy.businessStatus;
      return legacy;
    });
    old.rooms[0].price = 8100000;
    old.rooms[0].images = ['/assets/rooms/r1-03.webp'];
    old.rooms[1].publicationStatus = 'HIDDEN';
    old.favorites.push({ customerId: 'customer1', roomId: 'r1' });
    localStorage.setItem('ihouzz-demo-v1', JSON.stringify(old));
    const rooms = TestBed.inject(RoomService);
    const state = TestBed.inject(DemoStore).state();
    expect(rooms.rooms().map((r) => r.id)).toEqual(['r1', 'r6', 'r9', 'r10', 'r11', 'r12']);
    expect(rooms.get('r1')?.price).toBe(8100000);
    expect(rooms.get('r1')?.images).toEqual(['/assets/rooms/r1-03.webp']);
    expect(state.rooms[1].publicationStatus).toBe('HIDDEN');
    expect(state.rooms[2].status).toBe('HELD');
    expect(state.favorites).toEqual(old.favorites);
    expect(JSON.parse(localStorage.getItem('ihouzz-demo-before-catalog-v5')!).catalogVersion).toBe(
      4,
    );
  });
  it('roundtrips filters and ignores malformed bounds and numeric values', () => {
    const params = {
      q: 'Nestro',
      school: 'hcmus',
      property: 'p1',
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
  it('filters the sample catalog consistently for room cards and map', () => {
    const rooms = TestBed.inject(RoomService);
    const result = rooms.filter({
      propertyId: SEED_ROOMS[0].propertyId,
      minPrice: 8000000,
      minArea: 30,
      amenities: ['Wifi'],
      status: 'AVAILABLE',
    });
    expect(result.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(rooms.filter({ propertyId: SEED_ROOMS[0].propertyId }).length).toBeGreaterThanOrEqual(2);
    expect(rooms.filter({ bounds: [0, 0, 1, 1] })).toEqual([]);
  });
  it('does not present demo offsets as reliable distances', () => {
    const locations = TestBed.inject(LocationService);
    expect(locations.distance('p1', locations.schools[0].id)).toBeUndefined();
    expect(hasCoordinates({ lat: null, lng: null })).toBe(false);
    expect(straightLineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111.195, 2);
  });
  it('keeps all seeded photos unique to a single gallery and preserves cover order', () => {
    const all = SEED_ROOMS.flatMap((r) => r.images);
    expect(new Set(all).size).toBe(all.length);
    expect(SEED_ROOMS[0].images[0]).toBe('/assets/rooms/r1-01.webp');
  });
});
