import { Injectable, signal } from '@angular/core';
import { Property, PropertySchool } from '../classes/Property';
import { School } from '../classes/School';

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
  readonly properties = signal<Property[]>([]);
  private readonly schoolCatalog = signal<School[]>([]);
  private readonly relationCatalog = signal<PropertySchool[]>([]);
  get schools(): School[] {
    return this.schoolCatalog();
  }
  get relations(): PropertySchool[] {
    return this.relationCatalog();
  }
  setCatalog(properties: Property[], schools: School[], relations: PropertySchool[]): void {
    this.properties.set(properties);
    this.schoolCatalog.set(schools);
    this.relationCatalog.set(relations);
  }
  readonly loadingProperties = signal(false);
  constructor() {}
  async refresh(): Promise<void> {
    this.propertyError.set('');
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
