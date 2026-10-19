import { Injectable, computed, inject, signal } from '@angular/core';
import { DemoStore } from './demo-store.service';
import { Room } from '../models/domain';
import { LocationService } from './location.service';
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
  amenities?: string[];
  status?: string;
  schoolId?: string;
  propertyId?: string;
  radius?: number;
  bounds?: number[];
}
@Injectable({ providedIn: 'root' })
export class RoomService {
  protected store = inject(DemoStore);
  locations = inject(LocationService);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly rooms = computed(() =>
    this.store
      .state()
      .rooms
      .filter((r) => r.publicationStatus === 'PUBLISHED' && r.status === 'AVAILABLE')
      .map((room) =>
        room.images.length ? room : { ...room, images: ['/assets/room-placeholder.svg'] },
      ),
  );
  constructor() {
    void this.refresh();
  }
  async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    this.loading.set(false);
  }
  get(id: string): Room | undefined {
    return this.rooms().find((r) => r.id === id);
  }
  async getFromApi(id: string): Promise<Room> {
    const room = this.get(id);
    if (!room) throw new Error('Không tìm thấy phòng minh họa.');
    return room;
  }
  filter(filter: RoomFilter): Room[] {
    const normalize = (text: string) =>
      text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/đ/g, 'd');
    let rooms = this.rooms().filter(
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
