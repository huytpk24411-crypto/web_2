import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { StaffProfile } from '../../classes/StaffProfile';
import { StaffPage } from '../staff-page';

@Component({
  selector: 'app-admin-staff-success',
  standalone: false,
  templateUrl: './admin-staff-success.html',
  styleUrl: './admin-staff-success.css',
})
export class AdminStaffSuccessComponent extends StaffPage implements OnInit {
  private destroyRef = inject(DestroyRef);

  private route = inject(ActivatedRoute);

  employeeId = '';

  private employeeState = signal<StaffProfile | undefined>(undefined);
  get employee() {
    return this.employeeState();
  }
  set employee(value: StaffProfile | undefined) {
    this.employeeState.set(value);
  }

  get selectedEmployee() {
    return this.repository.employee(this.employeeId);
  }

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.employeeId = params.get('id') || '';
      void this.repository
        .loadEmployee(this.employeeId)
        .then((employee) => {
          this.employee = employee;
        })
        .catch((error) => {
          this.error = this.repository.catalogApi.message(error);
        });
    });
  }
}
