import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Room } from '../../classes/Room';
import { AdminRoomService } from '../../services/admin-room-service';
import { PriceHistory } from '../../classes/AdminCatalog';
@Component({
  selector: 'app-admin-edit-room-frame',
  standalone: false,
  templateUrl: './admin-room-edit.html',
  styleUrls: ['./admin-room-edit.css'],
})
export class AdminRoomEditComponent {
  route = inject(ActivatedRoute);
  admin = inject(AdminRoomService);
  id = this.route.snapshot.paramMap.get('id') || '';
  private roomState = signal<Room | undefined>(undefined);
  get room() {
    return this.roomState();
  }
  set room(value: Room | undefined) {
    this.roomState.set(value);
  }
  private errorState = signal<string>('');
  get error() {
    return this.errorState();
  }
  set error(value: string) {
    this.errorState.set(value);
  }
  private historyState = signal<PriceHistory[]>([]);
  get history() {
    return this.historyState();
  }
  set history(value: PriceHistory[]) {
    this.historyState.set(value);
  }
  constructor() {
    void this.admin
      .getFromApi(this.id)
      .then((room) => {
        this.room = room;
        void this.admin
          .priceHistory(this.id)
          .then((history) => (this.history = history))
          .catch((error) => {
            this.error = error instanceof Error ? error.message : 'Không tải được lịch sử giá.';
          });
        this.admin.list.update((items) => [room, ...items.filter((item) => item.id !== room.id)]);
      })
      .catch((error) => {
        this.error = error instanceof Error ? error.message : 'Không thể tải phòng.';
      });
  }
}
