import { Component, computed, inject, signal } from '@angular/core';
import { merge } from 'rxjs';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DepositService } from '../../services/deposit-service';
import { RoomService } from '../../services/room-service';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { CustomerIdentity, EmployeeCustomer } from '../../services/money-service';
import { PHONE_PATTERN } from '../../shared/validators';
@Component({
  selector: 'app-employee-deposit-dossier-frame',
  standalone: false,
  templateUrl: './employee-deposit-new.html',
  styleUrls: ['./employee-deposit-new.css'],
})
export class EmployeeDepositNewComponent {
  rooms = inject(RoomService);
  deposits = inject(DepositService);
  router = inject(Router);
  route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);
  private _error = signal('');
  get error() {
    return this._error();
  }
  set error(value: ReturnType<typeof this._error>) {
    this._error.set(value);
  }
  private _busy = signal(false);
  get busy() {
    return this._busy();
  }
  set busy(value: ReturnType<typeof this._busy>) {
    this._busy.set(value);
  }
  constructor() {
    void this.deposits.money.refresh().catch((e) => (this.error = e.message));
    this.identityForm.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.identityReady.set(false));
    merge(this.form.controls.phone.valueChanges, this.form.controls.roomId.valueChanges)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.customer.set(null);
        this.identityReady.set(false);
        this.customerContext = '';
      });
  }
  readonly eligibleBookings = computed(() => this.deposits.eligibleBookings());
  // Available rooms plus rooms held by a paid booking (HELD rooms are not in publishedRooms).
  readonly selectableRooms = computed(() => {
    const available = this.rooms.publishedRooms();
    const held = this.eligibleBookings()
      .map((b) => this.rooms.get(b.roomId))
      .filter((r): r is NonNullable<typeof r> => !!r && !available.some((a) => a.id === r.id));
    return [...available, ...held.filter((r, i) => held.findIndex((x) => x.id === r.id) === i)];
  });
  trackById(_index: number, item: { id: string }) {
    return item.id;
  }

  form = this.fb.nonNullable.group({
    bookingId: [''],
    customerName: ['', Validators.required],
    phone: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
    roomId: [
      this.route.snapshot.queryParamMap.get('roomId') || this.rooms.rooms()[0]?.id || '',
      Validators.required,
    ],
    total: [
      this.rooms.get(
        this.route.snapshot.queryParamMap.get('roomId') || this.rooms.rooms()[0]?.id || '',
      )?.deposit || 0,
      [Validators.required, Validators.min(1)],
    ],
    collectedMethod: this.fb.nonNullable.control<'CASH' | 'BANK_TRANSFER'>(
      'BANK_TRANSFER',
      Validators.required,
    ),
    note: ['', Validators.maxLength(500)],
    duration: [12, [Validators.required, Validators.min(1)]],
    startDate: ['', Validators.required],
    terms: [false, Validators.requiredTrue],
  });
  readonly customer = signal<EmployeeCustomer | null>(null);
  readonly identityReady = signal(false);
  readonly identityBusy = signal(false);
  private customerContext = '';
  identityForm = this.fb.nonNullable.group({
    idNumber: ['', [Validators.required, Validators.pattern(/^\d{12}$/)]],
    issuedOn: ['', Validators.required],
    issuedBy: ['', Validators.required],
    permanentAddress: ['', Validators.required],
    frontImageUrl: [
      '',
      [
        Validators.required,
        Validators.pattern(/^\/uploads\/cccd\/[a-zA-Z0-9_-]+\.(jpe?g|png|webp)$/i),
      ],
    ],
    backImageUrl: [
      '',
      [
        Validators.required,
        Validators.pattern(/^\/uploads\/cccd\/[a-zA-Z0-9_-]+\.(jpe?g|png|webp)$/i),
      ],
    ],
  });
  private contextKey() {
    return this.form.controls.phone.value + ':' + this.form.controls.roomId.value;
  }
  async loadCustomer() {
    if (this.identityBusy()) return;
    this.identityBusy.set(true);
    this.customer.set(null);
    this.identityReady.set(false);
    const key = this.contextKey();
    try {
      const c = await this.deposits.money.customerForDeposit(
        this.form.controls.phone.value,
        this.form.controls.roomId.value,
      );
      if (key !== this.contextKey()) return;
      this.customerContext = key;
      this.customer.set(c);
      const i = c.identity;
      this.identityForm.setValue(
        {
          idNumber: i?.number || '',
          issuedOn: i?.issuedDate || '',
          issuedBy: i?.issuedPlace || '',
          permanentAddress: c.permanentAddress || '',
          frontImageUrl: i?.frontImage || '',
          backImageUrl: i?.backImage || '',
        },
        { emitEvent: false },
      );
      this.identityReady.set(this.identityForm.valid);
      this.form.patchValue({
        customerName: c.fullName || c.name || this.form.controls.customerName.value,
      });
      await this.deposits.money.refresh();
      this.error = '';
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.identityBusy.set(false);
    }
  }
  async uploadIdentity(event: Event, side: 'frontImageUrl' | 'backImageUrl') {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || this.identityBusy()) return;
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      this.error = 'Chọn ảnh JPG, PNG hoặc WebP tối đa 5 MB.';
      return;
    }
    this.identityBusy.set(true);
    this.identityReady.set(false);
    const customerId = this.customer()?.id;
    try {
      const url = await this.deposits.money.uploadIdentity(file);
      if (customerId === this.customer()?.id) this.identityForm.controls[side].setValue(url);
      this.error = '';
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.identityBusy.set(false);
    }
  }
  async saveIdentity() {
    this.identityForm.markAllAsTouched();
    if (this.identityBusy() || this.identityForm.invalid || !this.customer()) return;
    if (this.contextKey() !== this.customerContext) {
      this.error = 'Tải lại khách hàng theo số điện thoại và phòng đã chọn.';
      return;
    }
    this.identityBusy.set(true);
    const key = this.contextKey();
    try {
      const body = this.identityForm.getRawValue() as CustomerIdentity;
      const c = await this.deposits.money.saveIdentity(this.customer()!.id, body);
      if (key === this.contextKey()) {
        this.customer.set(c);
        this.identityReady.set(
          JSON.stringify(body) === JSON.stringify(this.identityForm.getRawValue()),
        );
        this.error = '';
      }
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.identityBusy.set(false);
    }
  }
  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  readonly credit = computed(() => {
    const value = this.formValue();
    return (
      this.eligibleBookings().find(
        (b) => b.id === value.bookingId && b.roomId === value.roomId && b.phone === value.phone,
      )?.amount || 0
    );
  });
  readonly due = computed(() => Math.max(0, (this.formValue().total || 0) - this.credit()));
  readonly room = computed(() => this.rooms.get(this.formValue().roomId || ''));
  selectBooking() {
    const b = this.eligibleBookings().find((b) => b.id === this.form.controls.bookingId.value);
    if (b)
      this.form.patchValue({
        roomId: b.roomId,
        customerName: b.name,
        phone: b.phone,
        total: Math.max(this.form.controls.total.value, b.amount),
      });
  }
  async submit() {
    if (this.busy || this.identityBusy()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    if (!this.identityReady() || this.contextKey() !== this.customerContext) {
      this.error = 'Tải khách hàng và lưu đầy đủ CCCD trước khi lập cọc.';
      return;
    }
    this.busy = true;
    try {
      const v = this.form.getRawValue();
      if (v.bookingId && !this.credit()) {
        this.error = 'Giữ chỗ không còn hợp lệ hoặc không đúng khách/phòng. Vui lòng chọn lại.';
        return;
      }
      if (v.total < this.credit()) {
        this.error = 'Tổng tiền cọc không được nhỏ hơn tiền giữ chỗ được trừ.';
        return;
      }
      if (new Date(v.startDate + 'T23:59:59').getTime() < Date.now()) {
        this.error = 'Ngày bắt đầu thuê không được ở quá khứ.';
        return;
      }
      const d = await this.deposits.createRequest(
        {
          roomId: v.roomId,
          customerName: v.customerName,
          phone: v.phone,
          total: v.total,
          collectedMethod: v.collectedMethod,
          note: v.note,
          duration: v.duration,
          startDate: v.startDate,
        },
        v.bookingId || undefined,
      );
      await this.rooms.refresh();
      await this.router.navigate(['/employee/deals', d.id]);
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.busy = false;
    }
  }
}
