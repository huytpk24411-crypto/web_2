import { Component, Input, signal, OnChanges } from '@angular/core';
import { Room } from '../../models/domain';
@Component({
  selector: 'app-room-gallery',
  standalone: false,
  templateUrl: './room-gallery.component.html',
  styleUrls: ['./room-gallery.component.css'],
})
export class RoomGalleryComponent implements OnChanges {
  @Input({ required: true }) room!: Room;
  active = signal(0);
  open = signal(false);
  ngOnChanges() {
    this.active.set(0);
    this.open.set(false);
  }
  get images() {
    return this.room.images.length ? this.room.images : ['/assets/room-placeholder.svg'];
  }
  show(i: number) {
    this.active.set(i);
    this.open.set(true);
  }
  next(step: number) {
    this.active.update((i) => (i + step + this.images.length) % this.images.length);
  }
  key(event: KeyboardEvent) {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.next(1);
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.next(-1);
    }
    if (event.key === 'Escape') this.open.set(false);
  }
}
