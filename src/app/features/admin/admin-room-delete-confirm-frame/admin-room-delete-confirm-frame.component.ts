import { Component, Input, Output, EventEmitter } from '@angular/core';
import { Room } from '../../../models/domain';
@Component({
  selector: 'app-admin-room-delete-confirm-frame',
  standalone: false,
  templateUrl: './admin-room-delete-confirm-frame.component.html',
  styleUrls: ['./admin-room-delete-confirm-frame.component.css'],
  host: { class: 'room-admin' },
})
export class AdminRoomDeleteConfirmFrameComponent {
  @Input() room!: Room;
  @Input() error = '';
  @Output() closed = new EventEmitter<void>();
  @Output() confirmed = new EventEmitter<{ action: 'hide' | 'delete' | 'republish'; room: Room }>();
  choice: 'hide' | 'delete' = 'hide';
  busy = false;
  confirm(action: 'hide' | 'delete' | 'republish') {
    if (this.busy) return;
    this.busy = true;
    this.confirmed.emit({ action, room: this.room });
    // The parent handles the local demo operation; allow retries when validation rejects it.
    queueMicrotask(() => (this.busy = false));
  }
}
