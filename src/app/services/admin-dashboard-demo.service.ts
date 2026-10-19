import { Injectable, signal } from '@angular/core';

/** Display state only; never writes to room, deposit or payroll services. */
@Injectable({ providedIn: 'root' })
export class AdminDashboardDemoService {
  readonly pendingCount = signal(4);
}
