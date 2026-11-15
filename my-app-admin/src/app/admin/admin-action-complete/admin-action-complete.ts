import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Room } from '../../classes/Room';

@Component({
  selector: 'app-admin-action-complete-frame',
  standalone: false,
  templateUrl: './admin-action-complete.html',
  styleUrls: ['./admin-action-complete.css'],
  host: { class: 'room-admin' },
})
export class AdminActionCompleteComponent {
  @Input() room!: Room;
  @Output() closed = new EventEmitter<void>();
  preview = false;
}
