import { Injectable, inject, signal } from '@angular/core';
import { PROPERTIES, PROPERTY_SCHOOLS } from '../data/properties';
import { SCHOOLS } from '../data/schools';
import { Property } from '../models/domain';

const DEMO_PROPERTIES_KEY = 'ihouzz-demo-properties-v1';

export function hasCoordinates(p: {
  lat: number | null;
  lng: number | null;
}): p is { lat: number; lng: number } {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat!) <= 90 &&
    Math.abs(p.lng!) <= 180
  );
}
export function straightLineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const rad = Math.PI / 180,
    dLat = (b.lat - a.lat) * rad,
    dLng = (b.lng - a.lng) * rad;
  return (
    6371 *
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin(dLat / 2) ** 2 +
            Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2,
        ),
      ),
    )
  );
}
@Injectable({ providedIn: 'root' })
export class LocationService {
  readonly propertyError = signal('');
  readonly properties = signal<Property[]>(this.readDemoProperties());
  readonly schools = SCHOOLS;
  readonly relations = PROPERTY_SCHOOLS;
  readonly loadingProperties = signal(false);
  constructor() {}
  async refresh(): Promise<void> {
    this.propertyError.set('');
  }
  addDemoProperty(property: Property): void {
    const custom = this.properties().filter((item) => !PROPERTIES.some((sample) => sample.id === item.id));
    const next = [...custom, property];
    this.properties.set([...structuredClone(PROPERTIES), ...next]);
    try {
      localStorage.setItem(DEMO_PROPERTIES_KEY, JSON.stringify(next));
      this.propertyError.set('');
    } catch {
      this.propertyError.set('Không thể lưu tòa nhà minh họa vào bộ nhớ trình duyệt.');
    }
  }
  private readDemoProperties(): Property[] {
    try {
      const saved = JSON.parse(localStorage.getItem(DEMO_PROPERTIES_KEY) || '[]') as Property[];
      if (Array.isArray(saved)) return [...structuredClone(PROPERTIES), ...saved];
    } catch {
      this.propertyError.set('Không thể đọc các tòa nhà minh họa đã lưu.');
    }
    return structuredClone(PROPERTIES);
  }
  property(id: string) {
    return this.properties().find((p) => p.id === id);
  }
  school(id: string) {
    return this.schools.find((s) => s.id === id);
  }
  mapped(p: Property) {
    return p.locationStatus !== 'pending' && hasCoordinates(p);
  }
  near(propertyId: string, schoolId: string) {
    return this.relations.some((r) => r.propertyId === propertyId && r.schoolId === schoolId);
  }
  distance(propertyId: string, schoolId: string): number | undefined {
    const p = this.property(propertyId),
      s = this.school(schoolId);
    return p && s && p.locationStatus === 'sourced' && hasCoordinates(p)
      ? straightLineKm({ lat: p.lat, lng: p.lng }, s)
      : undefined;
  }
}
