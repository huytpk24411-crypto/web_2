import { Component, computed, inject, signal } from '@angular/core';
import { LocationService } from '../../services/location-service';
import { RoomSearchService } from '../../services/room-search-service';
import { RoomService } from '../../services/room-service';

@Component({
  selector: 'app-customer-home-frame',
  standalone: false,
  templateUrl: './customer-home.html',
  styleUrls: ['./customer-home.css'],
})
export class CustomerHomeComponent {
  rooms = inject(RoomService);
  search = inject(RoomSearchService);
  locations = inject(LocationService);
  readonly formActive = signal(false);
  readonly allSchools = signal(false);
  readonly schoolQuery = signal('');
  readonly hot = computed(() => this.rooms.rooms().filter((room) => room.featured));
  readonly discovered = computed(() => {
    const hotIds = new Set(this.hot().map((room) => room.id));
    const candidates = [...new Map(this.search.results().map((room) => [room.id, room])).values()];
    const selected: typeof candidates = [];
    const types = new Set<string>();
    const budgets = new Set<number>();
    const budget = (price: number) => (price <= 4000000 ? 0 : price <= 8000000 ? 1 : 2);
    while (selected.length < 6 && candidates.length) {
      const score = (room: (typeof candidates)[number]) =>
        (hotIds.has(room.id) ? 0 : 10) +
        (types.has(room.type) ? 0 : 3) +
        (budgets.has(budget(room.price)) ? 0 : 2);
      candidates.sort((a, b) => score(b) - score(a) || a.price - b.price);
      const room = candidates.shift()!;
      selected.push(room);
      types.add(room.type);
      budgets.add(budget(room.price));
    }
    return selected;
  });
  readonly schools = computed(() => {
    const query = this.schoolQuery().toLocaleLowerCase('vi');
    const schools = this.locations.schools.filter((school) =>
      (school.name + ' ' + school.campus).toLocaleLowerCase('vi').includes(query),
    );
    return this.allSchools() ? schools : schools.slice(0, 6);
  });
  schoolCount(id: string) {
    return this.rooms.filter({ schoolId: id }).length;
  }
}
