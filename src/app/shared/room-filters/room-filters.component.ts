import { Component, inject, Input } from '@angular/core';
import { RoomSearchService } from '../../services/room-search.service';
import { LocationService } from '../../services/location.service';
@Component({
  selector: 'app-room-filters',
  standalone: false,
  templateUrl: './room-filters.component.html',
  styleUrls: ['./room-filters.component.css'],
})
export class RoomFiltersComponent {
  @Input() heroSearch = false;
  search = inject(RoomSearchService);
  locations = inject(LocationService);
  expanded = false;
  get schoolOptions() {
    return this.locations.schools.map((s) => ({ value: s.id, label: s.name + ' · ' + s.campus }));
  }
  get propertyOptions() {
    return this.locations.properties().map((p) => ({ value: p.id, label: p.name }));
  }
  get districts() {
    return [...new Set(this.search.rooms.rooms().map((r) => r.district))];
  }
  get types() {
    return [...new Set(this.search.rooms.rooms().map((r) => r.type))];
  }
  get amenities() {
    return [...new Set(this.search.rooms.rooms().flatMap((r) => r.amenities))];
  }
  get capacities() {
    return [...new Set(this.search.rooms.rooms().map((r) => r.capacity))];
  }
  get distanceAvailable() {
    return (
      !!this.search.filter().schoolId &&
      this.search.rooms
        .rooms()
        .some(
          (r) =>
            this.locations.distance(r.propertyId, this.search.filter().schoolId!) !== undefined,
        )
    );
  }
  amenity(value: string, checked: boolean) {
    const current = this.search.filter().amenities || [];
    this.search.set({
      amenities: checked ? [...current, value] : current.filter((a) => a !== value),
    });
  }
}
