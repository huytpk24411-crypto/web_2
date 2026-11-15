import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
@Component({
  selector: 'app-admin-staff-edit',
  standalone: false,
  templateUrl: './admin-staff-edit.html',
  styleUrl: './admin-staff-edit.css',
})
export class AdminStaffEditComponent {
  readonly route = inject(ActivatedRoute);
}
