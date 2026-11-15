import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { Room } from '../../classes/Room';
@Component({
  selector: 'app-admin-room-delete-confirm-frame',
  standalone: false,
  templateUrl: './admin-room-delete-confirm.html',
  styleUrls: ['./admin-room-delete-confirm.css'],
  host: { class: 'room-admin' },
})
export class AdminRoomDeleteConfirmComponent implements OnChanges {
  @Input() room!: Room;
  @Input() error = '';
  @Output() closed = new EventEmitter<void>();
  @Output() confirmed = new EventEmitter<{ action: 'hide' | 'delete' | 'republish'; room: Room }>();
  choice: 'hide' | 'delete' = 'hide';
  @Input() busy = false;
  ngOnChanges() {
    if (this.room?.hasActiveFlow) this.choice = 'hide';
  }
  confirm(action: 'hide' | 'delete' | 'republish') {
    if (this.busy || (action === 'delete' && this.room.hasActiveFlow)) return;
    this.confirmed.emit({ action, room: this.room });
  }
}
