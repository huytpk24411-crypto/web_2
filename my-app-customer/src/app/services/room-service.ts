import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom, forkJoin } from 'rxjs';
import { isPublicRoom, Room, RoomSnapshot } from '../classes/Room';
import { apiMessage } from './api-message';
import { LocationService } from './location-service';
import { PropertyAPIService } from './property-apiservice';
import { CatalogRoom, RoomAPIService } from './room-apiservice';
import { SchoolAPIService } from './school-apiservice';
export interface RoomFilter {
  query?: string;
  district?: string;
  type?: string;
  maxPrice?: number;
  sort?: string;
  minPrice?: number;
  minArea?: number;
  maxArea?: number;
  capacity?: number;
  hasTour?: boolean;
  amenities?: string[];
  status?: string;
  schoolId?: string;
  propertyId?: string;
  radius?: number;
  bounds?: number[];
}
@Injectable({ providedIn: 'root' })
export class RoomService {
  private catalog = signal<Room[]>([]);
  private roomApi = inject(RoomAPIService);
  private propertyApi = inject(PropertyAPIService);
  private schoolApi = inject(SchoolAPIService);
  locations = inject(LocationService);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly apiAvailable = signal(false);
  private loadVersion = 0;
  private catalogReady?: Promise<void>;
  private availabilityRefresh?: Promise<void>;
  private lastRoomReadAt = 0;
  readonly publishedRooms = computed(() =>
    this.catalog()
      .filter(isPublicRoom)
      .map((room) =>
        room.images.length
          ? room
          : { ...room, images: ['/assets/placeholders/room-placeholder.svg'] },
      ),
  );
  readonly rooms = computed(() => this.publishedRooms());

  initializeCatalog(
    roomApi: RoomAPIService,
    propertyApi: PropertyAPIService,
    schoolApi: SchoolAPIService,
  ): Promise<void> {
    return (this.catalogReady ??= this.loadCatalog(roomApi, propertyApi, schoolApi));
  }
  private async loadCatalog(
    roomApi: RoomAPIService,
    propertyApi: PropertyAPIService,
    schoolApi: SchoolAPIService,
  ): Promise<void> {
    const version = ++this.loadVersion;
    this.loading.set(true);
    this.error.set('');
    try {
      const { rooms, properties, schools, relations } = await firstValueFrom(
        forkJoin({
          rooms: roomApi.getRooms(),
          properties: propertyApi.getProperties(),
          schools: schoolApi.getSchools(),
          relations: propertyApi.getPropertySchools(),
        }),
      );
      if (version !== this.loadVersion) return;
      if (![rooms, properties, schools, relations].every(Array.isArray))
        throw new Error('Phản hồi danh mục không hợp lệ.');
      this.locations.setCatalog(properties, schools, relations);
      this.catalog.set(
        rooms.map((room) => ({ ...room, status: room.status || room.businessStatus })),
      );
      this.apiAvailable.set(true);
      this.lastRoomReadAt = Date.now();
    } catch (error) {
      if (version !== this.loadVersion) return;
      this.apiAvailable.set(false);
      this.catalog.set([]);
      this.locations.setCatalog([], [], []);
      this.error.set(apiMessage(error, 'Không tải được danh mục phòng. Vui lòng thử lại.'));
    } finally {
      if (version === this.loadVersion) this.loading.set(false);
    }
  }
  async refresh(): Promise<void> {
    this.catalogReady = this.loadCatalog(this.roomApi, this.propertyApi, this.schoolApi);
    await this.catalogReady;
  }
  refreshAvailability(maxAgeMs = 30000): Promise<void> {
    if (this.availabilityRefresh) return this.availabilityRefresh;
    if (this.loading() || !this.apiAvailable() || Date.now() - this.lastRoomReadAt < maxAgeMs)
      return Promise.resolve();
    const version = this.loadVersion;
    this.availabilityRefresh = (async () => {
      try {
        const rooms = await firstValueFrom(this.roomApi.getRooms());
        if (version !== this.loadVersion) return;
        if (!Array.isArray(rooms)) throw new Error('Phản hồi danh mục không hợp lệ.');
        this.catalog.set(
          rooms.map((room) => ({ ...room, status: room.status || room.businessStatus })),
        );
        this.lastRoomReadAt = Date.now();
        this.error.set('');
      } catch (error) {
        if (version === this.loadVersion)
          this.error.set(apiMessage(error, 'Không cập nhật được trạng thái phòng.'));
      } finally {
        this.availabilityRefresh = undefined;
      }
    })();
    return this.availabilityRefresh;
  }
  get(id: string): Room | undefined {
    return this.catalog().find((r) => r.id === id);
  }
  forRecord(record?: {
    roomId: string;
    roomSnapshot?: RoomSnapshot;
  }):
    | Pick<
        Room,
        | 'id'
        | 'code'
        | 'name'
        | 'type'
        | 'address'
        | 'propertyId'
        | 'propertyName'
        | 'ownerId'
        | 'monthlyRent'
        | 'price'
        | 'area'
        | 'capacity'
        | 'images'
      >
    | undefined {
    if (!record) return undefined;
    const live = this.get(record.roomId);
    if (live) return live;
    const snapshot = record.roomSnapshot;
    return snapshot ? { ...snapshot, price: snapshot.monthlyRent, images: [] } : undefined;
  }
  async getFromApi(id: string): Promise<Room> {
    try {
      const room = await firstValueFrom(this.roomApi.getRoom(id));
      if (!isPublicRoom(room)) {
        this.catalog.update((rooms) => rooms.filter((r) => r.id !== id));
        throw new Error('Phòng hiện không còn trống hoặc tin đã ngừng đăng.');
      }
      this.catalog.update((rooms) =>
        rooms.some((item) => item.id === id)
          ? rooms.map((item) => (item.id === id ? room : item))
          : [...rooms, room],
      );
      return room;
    } catch (error) {
      if ((error as { status?: number }).status === 404)
        this.catalog.update((rooms) => rooms.filter((r) => r.id !== id));
      throw error;
    }
  }
  filter(filter: RoomFilter, includeUnavailable = false): Room[] {
    const normalize = (text: string) =>
      text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/đ/g, 'd');
    let rooms = (includeUnavailable ? this.publishedRooms() : this.rooms()).filter(
      (r) =>
        (!filter.query ||
          normalize(r.name + ' ' + r.address + ' ' + r.code).includes(normalize(filter.query))) &&
        (!filter.district || r.district === filter.district) &&
        (!filter.type || r.type === filter.type) &&
        (!filter.maxPrice || r.price <= filter.maxPrice) &&
        (!filter.minPrice || r.price >= filter.minPrice) &&
        (!filter.minArea || r.area >= filter.minArea) &&
        (!filter.maxArea || r.area <= filter.maxArea) &&
        (!filter.capacity || r.capacity >= filter.capacity) &&
        (!filter.hasTour || !!(r as CatalogRoom).tour) &&
        (!filter.status || r.status === filter.status) &&
        (!filter.propertyId || r.propertyId === filter.propertyId) &&
        (!filter.schoolId || this.locations.near(r.propertyId, filter.schoolId)) &&
        (!filter.amenities?.length || filter.amenities.every((a) => r.amenities.includes(a))) &&
        (!filter.radius ||
          (!!filter.schoolId &&
            (this.locations.distance(r.propertyId, filter.schoolId) ?? Infinity) <=
              filter.radius)) &&
        (!filter.bounds || this.inBounds(r, filter.bounds)),
    );
    if (filter.sort === 'price-asc') rooms = rooms.sort((a, b) => a.price - b.price);
    if (filter.sort === 'price-desc') rooms = rooms.sort((a, b) => b.price - a.price);
    if (filter.sort === 'distance' && filter.schoolId)
      rooms.sort(
        (a, b) =>
          (this.locations.distance(a.propertyId, filter.schoolId!) ?? Infinity) -
          (this.locations.distance(b.propertyId, filter.schoolId!) ?? Infinity),
      );
    return rooms;
  }
  private inBounds(room: Room, bounds: number[]) {
    const p = this.locations.property(room.propertyId);
    return (
      p &&
      this.locations.mapped(p) &&
      p.lat! >= bounds[0] &&
      p.lng! >= bounds[1] &&
      p.lat! <= bounds[2] &&
      p.lng! <= bounds[3]
    );
  }
}
