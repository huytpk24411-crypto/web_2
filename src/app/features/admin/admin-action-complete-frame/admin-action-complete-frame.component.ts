import { Component, Input, Output, EventEmitter } from '@angular/core';
import { Room } from '../../../models/domain';
@Component({
  selector: 'app-admin-action-complete-frame',
  standalone: false,
  templateUrl: './admin-action-complete-frame.component.html',
  styleUrls: ['./admin-action-complete-frame.component.css'],
  host: { class: 'room-admin' },
})
export class AdminActionCompleteFrameComponent {
  @Input() room!: Room;
  @Output() closed = new EventEmitter<void>();
  preview = false;
}
