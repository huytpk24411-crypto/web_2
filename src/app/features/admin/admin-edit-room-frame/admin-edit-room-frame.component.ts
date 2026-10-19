import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AdminRoomService } from '../../../services/admin-room.service';
import { Room } from '../../../models/domain';
@Component({
  selector: 'app-admin-edit-room-frame',
  standalone: false,
  templateUrl: './admin-edit-room-frame.component.html',
  styleUrls: ['./admin-edit-room-frame.component.css'],
})
export class AdminEditRoomFrameComponent {
  route = inject(ActivatedRoute);
  admin = inject(AdminRoomService);
  id = this.route.snapshot.paramMap.get('id') || '';
  room?: Room;
  error = '';
  constructor() {
    void this.admin.getFromApi(this.id).then((room) => {
      this.room = room;
      this.admin.list.update((items) => [room, ...items.filter((item) => item.id !== room.id)]);
    }).catch((error) => {
      this.error = error instanceof Error ? error.message : 'Không thể tải phòng.';
    });
  }
}
