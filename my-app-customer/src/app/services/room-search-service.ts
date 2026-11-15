import { roomTypeLabel } from '../classes/display-labels';
import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Params, Router } from '@angular/router';
import { filter } from 'rxjs';
import { RoomFilter, RoomService } from './room-service';

export function parseRoomFilter(p: Params): RoomFilter {
  const num = (key: string) => {
    const n = Number(p[key]);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const bounds = String(p['bounds'] || '')
    .split(',')
    .map(Number);
  return {
    query: p['q'] || '',
    district: p['district'] || '',
    type: p['type'] || '',
    schoolId: p['school'] || '',
    propertyId: p['property'] || '',
    sort: p['sort'] || '',
    status: ['AVAILABLE', 'HELD', 'RENTED'].includes(p['status']) ? p['status'] : '',
    minPrice: num('minPrice'),
    maxPrice: num('maxPrice'),
    minArea: num('minArea'),
    maxArea: num('maxArea'),
    capacity: num('capacity'),
    hasTour: String(p['hasTour']) === '1' ? true : undefined,
    radius: num('radius'),
    amenities: String(p['amenities'] || '')
      .split('|')
      .filter(Boolean),
    bounds:
      bounds.length === 4 &&
      bounds.every(Number.isFinite) &&
      bounds[0] <= bounds[2] &&
      bounds[1] <= bounds[3] &&
      Math.abs(bounds[0]) <= 90 &&
      Math.abs(bounds[2]) <= 90 &&
      Math.abs(bounds[1]) <= 180 &&
      Math.abs(bounds[3]) <= 180
        ? bounds
        : undefined,
  };
}
export function roomFilterParams(f: RoomFilter): Params {
  const p: Params = {
    ...f,
    q: f.query,
    school: f.schoolId,
    property: f.propertyId,
    amenities: f.amenities?.join('|'),
    bounds: f.bounds?.join(','),
    hasTour: f.hasTour ? 1 : undefined,
  };
  delete p['query'];
  delete p['schoolId'];
  delete p['propertyId'];
  return Object.fromEntries(
    Object.entries(p).filter(([, v]) => v !== undefined && v !== '' && v !== null && v !== 0),
  );
}
@Injectable({ providedIn: 'root' })
export class RoomSearchService {
  private router = inject(Router);
  readonly rooms = inject(RoomService);
  readonly filter = signal<RoomFilter>({});
  readonly selectedProperty = signal<string | null>(null);
  readonly results = computed(() => (this.error() ? [] : this.rooms.filter(this.filter())));
  readonly error = computed(() => {
    const f = this.filter();
    if (f.minPrice && f.maxPrice && f.minPrice > f.maxPrice)
      return 'Giá tối thiểu phải nhỏ hơn hoặc bằng giá tối đa.';
    if (f.minArea && f.maxArea && f.minArea > f.maxArea)
      return 'Diện tích tối thiểu phải nhỏ hơn hoặc bằng tối đa.';
    return '';
  });
  readonly params = computed(() => roomFilterParams(this.filter()));
  readonly count = computed(() => Object.keys(this.params()).filter((k) => k !== 'sort').length);
  readonly chips = computed(() =>
    Object.entries(this.params())
      .filter(([key]) => key !== 'sort')
      .map(([key, value]) => {
        if (key === 'hasTour') return { key, label: 'Có tour 360°' };
        const names: Record<string, string> = {
          q: 'Từ khóa',
          district: 'Khu vực',
          school: 'Trường',
          property: 'Tòa',
          minPrice: 'Giá từ',
          maxPrice: 'Giá đến',
          minArea: 'Diện tích từ',
          maxArea: 'Diện tích đến',
          capacity: 'Số người',
          amenities: 'Tiện nghi',
          status: 'Trạng thái',
          bounds: 'Trong vùng bản đồ',
          radius: 'Bán kính',
          type: 'Loại phòng',
        };
        const label =
          key === 'type'
            ? roomTypeLabel(String(value))
            : key === 'school'
              ? this.rooms.locations.school(value)?.name
              : key === 'property'
                ? this.rooms.locations.property(value)?.name
                : key === 'status'
                  ? (
                      { AVAILABLE: 'Đang trống', HELD: 'Đã giữ chỗ', RENTED: 'Đã thuê' } as Record<
                        string,
                        string
                      >
                    )[value]
                  : key === 'bounds'
                    ? 'đã chọn'
                    : key.includes('Price')
                      ? Number(value).toLocaleString('vi-VN') + ' đ'
                      : key.includes('Area')
                        ? value + ' m²'
                        : key === 'amenities'
                          ? String(value).split('|').join(', ')
                          : value;
        return { key, label: (names[key] || key) + ': ' + label };
      }),
  );
  remove(key: string) {
    const mapped: Record<string, string> = {
      q: 'query',
      school: 'schoolId',
      property: 'propertyId',
    };
    this.set({
      [mapped[key] || key]: undefined,
      ...(key === 'school' ? { radius: undefined } : {}),
    });
  }
  constructor() {
    this.filter.set(parseRoomFilter(this.router.parseUrl(this.router.url).queryParams));
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() =>
        this.filter.set(parseRoomFilter(this.router.parseUrl(this.router.url).queryParams)),
      );
  }
  set(change: Partial<RoomFilter>) {
    const next = { ...this.filter(), ...change };
    this.filter.set(next);
    const path = this.router.url.split('?')[0];
    this.router.navigate([path], { queryParams: roomFilterParams(next), replaceUrl: true });
  }
  clear() {
    this.filter.set({});
    this.selectedProperty.set(null);
    this.router.navigate([this.router.url.split('?')[0]], { replaceUrl: true });
  }
  search() {
    if (!this.error()) this.router.navigate(['/rooms'], { queryParams: this.params() });
  }
  school(id: string) {
    this.set({ schoolId: id, propertyId: undefined, bounds: undefined, radius: undefined });
  }
}
