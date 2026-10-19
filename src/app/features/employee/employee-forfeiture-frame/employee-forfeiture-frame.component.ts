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
  selector: 'app-employee-forfeiture-frame',
  standalone: false,
  templateUrl: './employee-forfeiture-frame.component.html',
  styleUrls: ['./employee-forfeiture-frame.component.css'],
})
export class EmployeeForfeitureFrameComponent {
  deals = inject(DealService);
  deposits = inject(DepositService);
  rooms = inject(RoomService);
  route = inject(ActivatedRoute);
  router = inject(Router);
  id = '';
  error = '';
  toast = '';
  constructor() {
    this.route.params.pipe(takeUntilDestroyed()).subscribe((p) => {
      this.id = p['id'];
      this.error = '';
    });
  }
  get deal() {
    return this.deals.get(this.id);
  }
  get room() {
    return this.rooms.get(this.deal?.roomId || '');
  }
  get deposit() {
    return this.deposits.get(this.deal?.depositId || '');
  }
  get pending() {
    return this.deals.list().filter((d) => d.status === 'PENDING').length;
  }
  get completed() {
    return this.deals.list().filter((d) => d.status === 'COMPLETED').length;
  }
  get forfeited() {
    return this.deals.list().filter((d) => d.status === 'FORFEITED').length;
  }
  reason = '';
  acknowledge = false;
  submit() {
    if (!this.acknowledge) {
      this.error = 'Cần xác nhận xử lý bỏ cọc mô phỏng.';
      return;
    }
    try {
      this.deals.forfeit(this.id, this.reason);
      this.error = '';
      this.toast = 'Đã ghi nhận khách bỏ cọc và mở lại phòng trong dữ liệu demo.';
    } catch (e) {
      this.error = (e as Error).message;
    }
  }
  print() {
    window.print();
  }
}
