import { Component, inject, Input, Output, EventEmitter } from '@angular/core';
import { signal, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../services/auth.service';
import { ShiftService } from '../../../services/shift.service';
import { AttendanceService } from '../../../services/attendance.service';
import { TaskService } from '../../../services/task.service';
import { PayrollService } from '../../../services/payroll.service';
import { RoomService } from '../../../services/room.service';
import { DepositService } from '../../../services/deposit.service';
import { DealService } from '../../../services/deal.service';
import { DemoStore } from '../../../services/demo-store.service';
import { PHONE_PATTERN } from '../../../shared/validators';
import { ASSETS } from '../../../data/assets';
@Component({
  selector: 'app-employee-deposit-dossier-frame',
  standalone: false,
  templateUrl: './employee-deposit-dossier-frame.component.html',
  styleUrls: ['./employee-deposit-dossier-frame.component.css'],
})
export class EmployeeDepositDossierFrameComponent {
  rooms = inject(RoomService);
  deposits = inject(DepositService);
  router = inject(Router);
  route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);
  error = '';
  form = this.fb.nonNullable.group({
    bookingId: [''],
    customerName: ['', Validators.required],
    phone: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
    roomId: [this.route.snapshot.queryParamMap.get('roomId') || 'r1', Validators.required],
    total: [1800000, [Validators.required, Validators.min(1)]],
    method: ['QR', Validators.required],
    address: [''],
    duration: [12, [Validators.required, Validators.min(1)]],
    startDate: ['', Validators.required],
    terms: [false, Validators.requiredTrue],
  });
  get credit() {
    return (
      this.deposits.eligibleBookings().find((b) => b.id === this.form.controls.bookingId.value)
        ?.amount || 0
    );
  }
  get due() {
    return Math.max(0, this.form.controls.total.value - this.credit);
  }
  get room() {
    return this.rooms.get(this.form.controls.roomId.value);
  }
  selectBooking() {
    const b = this.deposits
      .eligibleBookings()
      .find((b) => b.id === this.form.controls.bookingId.value);
    if (b)
      this.form.patchValue({
        roomId: b.roomId,
        customerName: b.name,
        phone: b.phone,
        total: Math.max(this.form.controls.total.value, b.amount),
      });
  }
  submit() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    try {
      const v = this.form.getRawValue();
      if (new Date(v.startDate + 'T23:59:59').getTime() < Date.now()) {
        this.error = 'Ngày bắt đầu thuê không được ở quá khứ.';
        return;
      }
      const d = this.deposits.create(
        {
          roomId: v.roomId,
          customerName: v.customerName,
          phone: v.phone,
          total: v.total,
          method: v.method as 'QR' | 'CASH',
          address: v.address,
          duration: v.duration,
          startDate: v.startDate,
        },
        v.bookingId || undefined,
      );
      this.router.navigate([
        '/employee/deposits',
        d.id,
        v.method === 'QR' ? 'qr-receipt' : 'cash-receipt',
      ]);
    } catch (e) {
      this.error = (e as Error).message;
    }
  }
}
