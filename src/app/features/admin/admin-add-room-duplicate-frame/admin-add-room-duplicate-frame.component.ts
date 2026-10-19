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
  selector: 'app-admin-add-room-duplicate-frame',
  standalone: false,
  templateUrl: './admin-add-room-duplicate-frame.component.html',
  styleUrls: ['./admin-add-room-duplicate-frame.component.css'],
})
export class AdminAddRoomDuplicateFrameComponent {
  admin = inject(AdminRoomService);
}
