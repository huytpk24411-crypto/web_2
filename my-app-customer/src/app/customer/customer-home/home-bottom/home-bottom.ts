import { Component, computed, inject } from '@angular/core';
import { RoomSearchService } from '../../../services/room-search-service';
import { RoomFilter, RoomService } from '../../../services/room-service';

@Component({
  selector: 'app-home-bottom',
  standalone: false,
  templateUrl: './home-bottom.html',
  styleUrls: ['./home-bottom.css'],
})
export class HomeBottomComponent {
  rooms = inject(RoomService);
  search = inject(RoomSearchService);
  readonly collections = computed(() =>
    [
      {
        title: 'Đến 4 triệu/tháng',
        filter: { maxPrice: 4000000 } as RoomFilter,
        params: { maxPrice: 4000000 },
      },
      {
        title: 'Có chỗ cho hai người',
        filter: { capacity: 2 } as RoomFilter,
        params: { capacity: 2 },
      },
      { title: 'Có tour 360°', filter: { hasTour: true } as RoomFilter, params: { hasTour: 1 } },
    ]
      .map((collection) => ({ ...collection, rooms: this.rooms.filter(collection.filter) }))
      .filter((collection) => collection.rooms.length),
  );
}
