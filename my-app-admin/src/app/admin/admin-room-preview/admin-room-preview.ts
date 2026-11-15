import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Room } from '../../classes/Room';

@Component({
  selector: 'app-admin-room-preview',
  standalone: false,
  templateUrl: './admin-room-preview.html',
  styleUrls: ['./admin-room-preview.css'],
  host: { class: 'room-admin' },
})
export class AdminRoomPreviewComponent {
  @Input() room!: Room;
  @Input() initial = 0;
  @Output() closed = new EventEmitter<void>();
  get images() {
    return this.room.images.length
      ? this.room.images
      : ['/assets/placeholders/room-placeholder.svg'];
  }
  next(step: number) {
    this.initial = (this.initial + step + this.images.length) % this.images.length;
  }
}
