import { Component, effect, inject } from '@angular/core';
import { RoomSearchService } from '../../../services/room-search.service';
@Component({
  selector: 'app-customer-room-list-frame',
  standalone: false,
  templateUrl: './customer-room-list-frame.component.html',
  styleUrls: ['./customer-room-list-frame.component.css'],
})
export class CustomerRoomListFrameComponent {
  search = inject(RoomSearchService);
  page = 1;
  constructor() {
    effect(() => {
      this.search.filter();
      this.page = 1;
    });
  }
  get results() {
    return this.search.results();
  }
  get pages() {
    return Array.from({ length: Math.ceil(this.results.length / 8) }, (_, i) => i + 1);
  }
  reset() {
    this.search.clear();
    this.page = 1;
  }
}
