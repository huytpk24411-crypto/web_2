import { Component, inject } from '@angular/core';
import { AdminRoomService } from '../../services/admin-room-service';
@Component({
  selector: 'app-admin-add-room-duplicate-frame',
  standalone: false,
  templateUrl: './admin-room-duplicate.html',
  styleUrls: ['./admin-room-duplicate.css'],
})
export class AdminRoomDuplicateComponent {
  admin = inject(AdminRoomService);
}
