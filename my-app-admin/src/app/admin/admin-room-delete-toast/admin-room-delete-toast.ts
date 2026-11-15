import { Component, EventEmitter, Input, Output } from '@angular/core';
@Component({
  selector: 'app-admin-room-delete-toast-frame',
  standalone: false,
  templateUrl: './admin-room-delete-toast.html',
  styleUrls: ['./admin-room-delete-toast.css'],
})
export class AdminRoomDeleteToastComponent {
  @Input() message = 'Đã cập nhật trạng thái phòng.';
  @Output() closed = new EventEmitter<void>();
}
