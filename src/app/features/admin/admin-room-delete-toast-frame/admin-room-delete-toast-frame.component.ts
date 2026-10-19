import { Component, inject, Input, Output, EventEmitter } from '@angular/core';
import { signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminRoomService } from '../../../services/admin-room.service';
import { DealService } from '../../../services/deal.service';
import { DepositService } from '../../../services/deposit.service';
import { DemoStore } from '../../../services/demo-store.service';
import { AuthService } from '../../../services/auth.service';
import { ShiftService } from '../../../services/shift.service';
import { Room } from '../../../models/domain';
import { PROPERTIES, STAFF, PAYROLL } from '../../../data/mock-data';
import { ASSETS } from '../../../data/assets';
@Component({
  selector: 'app-admin-room-delete-toast-frame',
  standalone: false,
  templateUrl: './admin-room-delete-toast-frame.component.html',
  styleUrls: ['./admin-room-delete-toast-frame.component.css'],
})
export class AdminRoomDeleteToastFrameComponent {
  @Input() message = 'Đã cập nhật trạng thái phòng trong dữ liệu demo.';
  @Output() closed = new EventEmitter<void>();
}
