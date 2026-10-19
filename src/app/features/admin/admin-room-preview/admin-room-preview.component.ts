import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Room } from '../../../models/domain';
@Component({
  selector: 'app-admin-room-preview',
  standalone: false,
  templateUrl: './admin-room-preview.component.html',
  styleUrls: ['./admin-room-preview.component.css'],
  host: { class: 'room-admin' },
})
export class AdminRoomPreviewComponent {
  @Input() room!: Room;
  @Input() initial = 0;
  @Output() closed = new EventEmitter<void>();
  get images() {
    return this.room.images.length ? this.room.images : ['/assets/room-placeholder.svg'];
  }
  next(step: number) {
    this.initial = (this.initial + step + this.images.length) % this.images.length;
  }
}
