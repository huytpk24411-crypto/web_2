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
  selector: 'app-deposit-payment',
  standalone: false,
  templateUrl: './deposit-payment.component.html',
  styleUrls: ['./deposit-payment.component.css'],
})
export class DepositPaymentComponent {
  @Input() method: 'QR' | 'CASH' = 'QR';
  @Input() id = '';
  deposits = inject(DepositService);
  rooms = inject(RoomService);
  store = inject(DemoStore);
  error = '';
  acknowledge = false;
  get dossier() {
    return this.deposits.get(this.id);
  }
  get room() {
    return this.rooms.get(this.dossier?.roomId || '');
  }
  get payment() {
    return this.store.state().payments.find((p) => p.id === this.dossier?.paymentId);
  }
  get paymentMethod() {
    return this.payment?.method || this.method;
  }
  confirm() {
    if (!this.acknowledge) {
      this.error = 'Vui lòng xác nhận đang mô phỏng giao dịch.';
      return;
    }
    try {
      this.deposits.confirmDemo(this.id, this.method);
      this.error = '';
    } catch (e) {
      this.error = (e as Error).message;
    }
  }
  print() {
    window.print();
  }
}
