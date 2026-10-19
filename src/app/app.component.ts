import { Component, inject } from '@angular/core';
import { BookingService } from './services/booking.service';

@Component({
  selector: 'app-root',
  standalone: false,
  styleUrl: './app.component.css',
  templateUrl: './app.component.html',
})
export class App {
  constructor() {
    inject(BookingService).expire();
  }
}
