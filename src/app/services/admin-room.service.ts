import { Injectable, inject, signal } from '@angular/core';
import { Room, Property } from '../models/domain';
import { AuthService } from './auth.service';
import { RoomService } from './room.service';
import { LocationService } from './location.service';
import { DemoStore, uid } from './demo-store.service';

export interface RoomQuery {
  q?: string;
  type?: string;
  propertyId?: string;
  businessStatus?: string;
  publicationStatus?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: string;
  page?: number;
  limit?: number;
  ids?: string[];
}
export interface RoomStats {
  total: number;
  available: number;
  held: number;
  rented: number;
  maintenance: number;
  published: number;
  hidden: number;
  draft: number;
}
export interface PropertyOption {
  id: string;
  name: string;
  address: string;
  district: string;
  lat?: number | null;
  lng?: number | null;
}
export interface RoomPhoto {
  id: string;
  url: string;
  order: number;
  cover: boolean;
  size: number;
  mimeType: string;
}
export function apiError(error: unknown): string {
  return error instanceof Error ? error.message : 'Đã xảy ra lỗi không xác định.';
}

@Injectable({ providedIn: 'root' })
export class AdminRoomService {
  private auth = inject(AuthService);
  private publicRooms = inject(RoomService);
  private locations = inject(LocationService);
  private store = inject(DemoStore);
  readonly draft = signal<Partial<Room> | null>(null);
  readonly draftFiles = signal<File[]>([]);
  readonly list = signal<Room[]>([]);
  readonly properties = signal<PropertyOption[]>([]);
  readonly stats = signal<RoomStats>({
    total: 0,
    available: 0,
    held: 0,
    rented: 0,
    maintenance: 0,
    published: 0,
    hidden: 0,
    draft: 0,
  });
  readonly loading = signal(false);
  readonly error = signal('');
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pages = signal(1);
  readonly pageSize = signal(10);
  private lastQuery: RoomQuery = {};

  all(): Room[] {
    return this.store.state().rooms.map((room) => this.mapRoom(room));
  }
  get(id: string): Room | undefined {
    return this.all().find((room) => room.id === id);
  }
  async getFromApi(id: string): Promise<Room> {
    const room = this.get(id);
    if (!room) throw new Error('Không tìm thấy phòng minh họa.');
    return room;
  }
  async loadProperties(): Promise<void> {
    this.properties.set(
      this.locations.properties().map((property) => ({
        id: property.id,
        name: property.name,
        address: property.address,
        district: property.address.split(',').at(-1)?.trim() || '',
        lat: property.lat,
        lng: property.lng,
      })),
    );
  }
  async createProperty(
    value: Pick<PropertyOption, 'name' | 'address' | 'district'> & {
      lat?: number | null;
      lng?: number | null;
    },
  ): Promise<PropertyOption> {
    this.authorize();
    const id = uid('property');
    const property: PropertyOption = {
      id,
      ...value,
      lat: value.lat ?? null,
      lng: value.lng ?? null,
    };
    const demoProperty: Property = {
      ...property,
      lat: property.lat ?? null,
      lng: property.lng ?? null,
      images: [],
      locationStatus: property.lat === null || property.lng === null ? 'pending' : 'demo',
      demo: true,
      locationSource: 'Vị trí minh họa do người dùng nhập',
    };
    this.locations.addDemoProperty(demoProperty);
    this.properties.update((items) => [...items, property]);
    return property;
  }
  async refresh(query: RoomQuery = {}): Promise<void> {
    this.lastQuery = { ...query };
    this.loading.set(true);
    this.error.set('');
    const all = this.all();
    this.setStats(all);
    let filtered = all.filter(
      (room) =>
        (!query.q ||
          `${room.code} ${room.name} ${room.propertyName} ${room.address}`
            .toLocaleLowerCase()
            .includes(query.q.toLocaleLowerCase())) &&
        (!query.type || room.type === query.type) &&
        (!query.propertyId || room.propertyId === query.propertyId) &&
        (!query.businessStatus || room.status === query.businessStatus) &&
        (!query.publicationStatus || room.publicationStatus === query.publicationStatus) &&
        (query.minPrice === undefined || room.price >= query.minPrice) &&
        (query.maxPrice === undefined || room.price <= query.maxPrice),
    );
    if (query.sort === 'price-asc') filtered = filtered.sort((a, b) => a.price - b.price);
    else if (query.sort === 'price-desc') filtered = filtered.sort((a, b) => b.price - a.price);
    else if (query.sort === 'code')
      filtered = filtered.sort((a, b) => a.code.localeCompare(b.code, 'vi'));
    else if (query.sort === 'area-desc') filtered = filtered.sort((a, b) => b.area - a.area);
    else filtered = filtered.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    const limit = Math.max(1, query.limit || this.pageSize());
    const page = Math.min(
      Math.max(1, query.page || 1),
      Math.max(1, Math.ceil(filtered.length / limit)),
    );
    this.total.set(filtered.length);
    this.page.set(page);
    this.pageSize.set(limit);
    this.pages.set(Math.max(1, Math.ceil(filtered.length / limit)));
    this.list.set(filtered.slice((page - 1) * limit, page * limit));
    this.loading.set(false);
  }
  async save(room: Partial<Room>, id?: string): Promise<Room> {
    this.authorize();
    const code = room.code?.trim().toUpperCase() || '';
    if (await this.duplicate(code, room.propertyId || '', room.number || '', id))
      throw new Error('Mã phòng hoặc số căn trong tòa nhà đã tồn tại.');
    const property =
      this.properties().find((item) => item.id === room.propertyId) ||
      this.locations.properties().find((item) => item.id === room.propertyId);
    if (!property) throw new Error('Vui lòng chọn tòa nhà minh họa hợp lệ.');
    const previous = id ? this.get(id) : undefined;
    const saved = this.mapRoom({
      ...previous,
      ...room,
      id: id || uid('room'),
      code,
      propertyId: property.id,
      propertyName: property.name,
      status: room.status || previous?.status || 'AVAILABLE',
      publicationStatus: room.publicationStatus || previous?.publicationStatus || 'DRAFT',
      images: room.images || previous?.images || [],
      amenities: room.amenities || previous?.amenities || [],
      featured: room.featured || false,
      hasHistory: previous?.hasHistory || false,
      updatedAt: new Date().toISOString(),
    } as Room);
    this.upsert(saved);
    this.publicRooms.refresh();
    this.draft.set(null);
    this.draftFiles.set([]);
    return saved;
  }
  async publish(id: string): Promise<Room> {
    this.authorize();
    const room = this.requireRoom(id);
    this.validatePublish(room);
    return this.upsert({
      ...room,
      publicationStatus: 'PUBLISHED',
      updatedAt: new Date().toISOString(),
    });
  }
  async hide(id: string): Promise<void> {
    this.authorize();
    const room = this.requireRoom(id);
    this.upsert({ ...room, publicationStatus: 'HIDDEN', updatedAt: new Date().toISOString() });
    this.publicRooms.refresh();
  }
  async republish(id: string): Promise<void> {
    await this.publish(id);
    this.publicRooms.refresh();
  }
  async remove(id: string): Promise<void> {
    this.authorize();
    const room = this.requireRoom(id);
    if (room.hasHistory)
      throw new Error('Phòng có lịch sử minh họa; hãy ẩn tin để bảo toàn dữ liệu.');
    this.store.update((state) => {
      state.rooms = state.rooms.filter((item) => item.id !== id);
    });
    this.syncList();
    this.publicRooms.refresh();
  }
  async uploadImages(id: string, files: File[]): Promise<RoomPhoto[]> {
    this.authorize();
    const room = this.requireRoom(id);
    if (room.images.length + files.length > 15)
      throw new Error('Mỗi phòng được lưu tối đa 15 ảnh.');
    if (
      files.some(
        (file) =>
          !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
          file.size > 10 * 1024 * 1024,
      )
    )
      throw new Error('Chỉ nhận JPG, PNG hoặc WebP, tối đa 10 MB mỗi ảnh.');
    const urls = await Promise.all(files.map((file) => readRoomImage(file)));
    this.upsert({
      ...room,
      images: [...room.images, ...urls],
      updatedAt: new Date().toISOString(),
    });
    this.publicRooms.refresh();
    return this.photos(this.requireRoom(id));
  }
  async getImages(id: string): Promise<RoomPhoto[]> {
    return this.photos(this.requireRoom(id));
  }
  async saveImageOrder(id: string, imageIds: string[]): Promise<RoomPhoto[]> {
    this.authorize();
    const room = this.requireRoom(id);
    const current = this.photos(room);
    if (imageIds.length !== current.length || new Set(imageIds).size !== current.length)
      throw new Error('Thứ tự ảnh không khớp thư viện minh họa.');
    const byId = new Map(current.map((photo) => [photo.id, photo.url]));
    if (imageIds.some((imageId) => !byId.has(imageId)))
      throw new Error('Thứ tự ảnh chứa ảnh không thuộc phòng.');
    this.upsert({ ...room, images: imageIds.map((imageId) => byId.get(imageId)!) });
    this.publicRooms.refresh();
    return this.photos(this.requireRoom(id));
  }
  async deleteImage(id: string, imageId: string): Promise<RoomPhoto[]> {
    this.authorize();
    const room = this.requireRoom(id);
    const photo = this.photos(room).find((item) => item.id === imageId);
    if (!photo) throw new Error('Không tìm thấy ảnh trong thư viện minh họa.');
    if (photo.url.startsWith('blob:')) URL.revokeObjectURL(photo.url);
    this.upsert({ ...room, images: room.images.filter((url) => url !== photo.url) });
    this.publicRooms.refresh();
    return this.photos(this.requireRoom(id));
  }
  async export(query: RoomQuery): Promise<void> {
    const all = this.all().filter(
      (room) =>
        (!query.ids || query.ids.includes(room.id)) &&
        (!query.propertyId || room.propertyId === query.propertyId) &&
        (!query.q ||
          `${room.code} ${room.name} ${room.propertyName} ${room.address}`
            .toLocaleLowerCase()
            .includes(query.q.toLocaleLowerCase())) &&
        (!query.type || room.type === query.type) &&
        (!query.businessStatus || room.status === query.businessStatus) &&
        (!query.publicationStatus || room.publicationStatus === query.publicationStatus) &&
        (query.minPrice === undefined || room.price >= query.minPrice) &&
        (query.maxPrice === undefined || room.price <= query.maxPrice),
    );
    const rows = [
      [
        'Mã phòng',
        'Tên phòng',
        'Tòa nhà',
        'Địa chỉ',
        'Loại phòng',
        'Giá thuê/tháng (VND)',
        'Diện tích (m²)',
        'Trạng thái phòng',
        'Trạng thái tin',
      ],
      ...all.map((room) => [
        room.code,
        room.name,
        room.propertyName || '',
        room.address,
        room.type,
        String(room.price),
        String(room.area),
        room.status,
        room.publicationStatus,
      ]),
    ];
    const csv =
      '\ufeff' +
      rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'ihouzz-rooms-demo.csv';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async saveImages(id: string, urls: string[]): Promise<void> {
    this.authorize();
    if (urls.length > 15 || new Set(urls).size !== urls.length)
      throw new Error('Thư viện chỉ nhận tối đa 15 ảnh không trùng nhau.');
    const room = this.requireRoom(id);
    this.upsert({ ...room, images: [...urls], updatedAt: new Date().toISOString() });
    this.publicRooms.refresh();
  }
  async duplicate(
    code: string,
    propertyId: string,
    number: string,
    except?: string,
  ): Promise<boolean> {
    const normalizedCode = code.trim().toUpperCase();
    const normalizedNumber = number.trim().toUpperCase();
    return this.all().some(
      (room) =>
        room.id !== except &&
        (room.code.trim().toUpperCase() === normalizedCode ||
          (!!normalizedNumber &&
            room.propertyId === propertyId &&
            room.number.trim().toUpperCase() === normalizedNumber)),
    );
  }
  private setStats(rooms: Room[]): void {
    this.stats.set({
      total: rooms.length,
      available: rooms.filter((room) => room.status === 'AVAILABLE').length,
      held: rooms.filter((room) => room.status === 'HELD').length,
      rented: rooms.filter((room) => room.status === 'RENTED').length,
      maintenance: rooms.filter((room) => room.status === 'MAINTENANCE').length,
      published: rooms.filter((room) => room.publicationStatus === 'PUBLISHED').length,
      hidden: rooms.filter((room) => room.publicationStatus === 'HIDDEN').length,
      draft: rooms.filter((room) => room.publicationStatus === 'DRAFT').length,
    });
  }
  private validatePublish(room: Room): void {
    if (
      !room.name.trim() ||
      !room.code.trim() ||
      !room.propertyId ||
      !room.number.trim() ||
      !room.type.trim() ||
      !room.address.trim() ||
      !room.description.trim() ||
      room.price <= 0 ||
      (room.deposit || 0) <= 0 ||
      room.area <= 0 ||
      room.capacity <= 0
    )
      throw new Error('Phòng cần đủ thông tin bắt buộc trước khi đăng.');
    if (room.images.length < 3) throw new Error('Đăng phòng cần tối thiểu 3 ảnh.');
    if (room.status !== 'AVAILABLE') throw new Error('Chỉ phòng đang trống mới được đăng.');
  }
  private photos(room: Room): RoomPhoto[] {
    return room.images.map((url, order) => ({
      id: url,
      url,
      order,
      cover: order === 0,
      size: 0,
      mimeType: url.toLowerCase().endsWith('.png')
        ? 'image/png'
        : url.toLowerCase().endsWith('.webp')
          ? 'image/webp'
          : 'image/jpeg',
    }));
  }
  private requireRoom(id: string): Room {
    const room = this.get(id);
    if (!room) throw new Error('Không tìm thấy phòng minh họa.');
    return room;
  }
  private upsert(room: Room): Room {
    this.store.update((state) => {
      const index = state.rooms.findIndex((item) => item.id === room.id);
      if (index < 0) state.rooms.unshift(room);
      else state.rooms[index] = room;
    });
    this.syncList();
    return room;
  }
  private syncList(): void {
    void this.refresh(this.lastQuery);
  }
  private mapRoom(room: Room): Room {
    const property = this.locations.property(room.propertyId);
    return {
      ...room,
      status: room.status || room.businessStatus || 'AVAILABLE',
      businessStatus: room.status || room.businessStatus || 'AVAILABLE',
      publicationStatus: room.publicationStatus || 'DRAFT',
      images: room.images || [],
      amenities: room.amenities || [],
      hasHistory: room.hasHistory || false,
      price: room.price || 0,
      deposit: room.deposit ?? room.price ?? 0,
      area: room.area || 0,
      capacity: room.capacity || 0,
      propertyName: room.propertyName || property?.name || '',
    };
  }
  private authorize(): void {
    if (this.auth.account()?.role !== 'ADMIN')
      throw new Error('Chỉ quản trị viên được quản lý phòng.');
  }
}
export function readRoomImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Không thể đọc ảnh. Vui lòng chọn lại tệp.'));
    reader.readAsDataURL(file);
  });
}
