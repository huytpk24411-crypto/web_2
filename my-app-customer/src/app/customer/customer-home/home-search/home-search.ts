import { Component, EventEmitter, Output, computed, inject, signal } from '@angular/core';
import { LocationService } from '../../../services/location-service';
import { RoomSearchService } from '../../../services/room-search-service';

interface LocationOption {
  group: string;
  id: string;
  label: string;
  detail: string;
}
@Component({
  selector: 'app-home-search',
  standalone: false,
  templateUrl: './home-search.html',
  styleUrls: ['./home-search.css'],
})
export class HomeSearchComponent {
  search = inject(RoomSearchService);
  locations = inject(LocationService);
  @Output() interacting = new EventEmitter<boolean>();
  readonly open = signal(false);
  readonly active = signal(-1);
  readonly term = signal('');
  readonly groups = ['Trường', 'Khu vực', 'Tòa nhà'];
  readonly options = computed<LocationOption[]>(() => {
    const normalize = (text: string) =>
      text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .toLowerCase();
    const query = normalize(this.term());
    return [
      ...this.locations.schools.map((s) => ({
        group: 'Trường',
        id: s.id,
        label: s.name,
        detail: s.campus,
      })),
      ...Array.from(
        new Set(
          this.search.rooms
            .rooms()
            .map((room) => room.district)
            .filter(Boolean),
        ),
      ).map((district) => ({ group: 'Khu vực', id: district, label: district, detail: '' })),
      ...this.locations
        .properties()
        .map((p) => ({ group: 'Tòa nhà', id: p.id, label: p.name, detail: p.address })),
    ].filter((option) => normalize(option.label + ' ' + option.detail).includes(query));
  });
  readonly types = computed(() => [...new Set(this.search.rooms.rooms().map((room) => room.type))]);
  readonly budgets = computed(() =>
    [
      ...new Set(
        [3000000, 4000000, 6000000, 8000000, this.search.filter().maxPrice].filter(
          (value): value is number => !!value,
        ),
      ),
    ].sort((a, b) => a - b),
  );
  get value() {
    const f = this.search.filter();
    return (
      f.query ||
      this.locations.school(f.schoolId || '')?.name ||
      this.locations.property(f.propertyId || '')?.name ||
      f.district ||
      ''
    );
  }
  groupOptions(group: string) {
    return this.options().filter((option) => option.group === group);
  }
  optionIndex(option: LocationOption) {
    return this.options().indexOf(option);
  }
  begin() {
    this.term.set('');
    this.open.set(true);
    this.active.set(-1);
  }
  input(value: string) {
    this.term.set(value);
    this.active.set(-1);
    this.open.set(true);
    this.search.set({
      query: value,
      schoolId: undefined,
      propertyId: undefined,
      district: undefined,
      bounds: undefined,
      radius: undefined,
    });
  }
  select(option: LocationOption) {
    if (option.group === 'Trường') {
      this.search.filter.update((filter) => ({ ...filter, query: undefined, district: undefined }));
      this.search.school(option.id);
    } else {
      this.search.set({
        query: undefined,
        schoolId: undefined,
        radius: undefined,
        bounds: undefined,
        propertyId: option.group === 'Tòa nhà' ? option.id : undefined,
        district: option.group === 'Khu vực' ? option.id : undefined,
      });
    }
    this.open.set(false);
    this.active.set(-1);
  }
  keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.open.set(false);
      this.active.set(-1);
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.open()) this.begin();
      const count = this.options().length;
      this.active.set(
        count
          ? this.active() < 0
            ? event.key === 'ArrowDown'
              ? 0
              : count - 1
            : (this.active() + (event.key === 'ArrowDown' ? 1 : count - 1)) % count
          : -1,
      );
      document
        .getElementById('home-location-option-' + this.active())
        ?.scrollIntoView?.({ block: 'nearest' });
    }
    if (event.key === 'Enter' && this.open() && this.active() >= 0) {
      event.preventDefault();
      this.select(this.options()[this.active()]);
    }
  }
  blur(event: FocusEvent) {
    if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) {
      this.open.set(false);
      this.interacting.emit(false);
    }
  }
}
