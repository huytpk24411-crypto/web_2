import { Component, EventEmitter, Input, Output } from '@angular/core';
@Component({
  selector: 'app-admin-shift-monitor',
  standalone: false,
  templateUrl: './admin-shift-monitor.component.html',
  styleUrls: ['./admin-shift-monitor.component.css'],
})
export class AdminShiftMonitorComponent {
  @Input() shifts: {
    initials: string;
    name: string;
    detail: string;
    status: string;
    tone: string;
    location: string;
    time: string;
  }[] = [];
  @Output() inspect = new EventEmitter<void>();
}
