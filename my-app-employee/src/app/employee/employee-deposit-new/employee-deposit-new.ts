import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ValidatorFn, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DepositService } from '../../services/deposit-service';
import { RoomService } from '../../services/room-service';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { CustomerIdentity, EmployeeCustomer } from '../../services/money-service';
import { PHONE_PATTERN } from '../../shared/validators';
import { DepositDocumentService } from '../../services/deposit-document-service';
import { DepositDraft, DepositDraftData, DepositSheet } from '../../classes/DepositSheet';
import { depositLeaseEnd, vietnameseMoney } from '../../shared/vietnamese-money';

const identityTextLength = (minimum: number, maximum: number): ValidatorFn => (control) => {
  const length = typeof control.value === 'string' ? control.value.trim().length : 0;
  if (length < minimum) return { minlength: { requiredLength: minimum, actualLength: length } };
  if (length > maximum) return { maxlength: { requiredLength: maximum, actualLength: length } };
  return null;
};
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
  documents = inject(DepositDocumentService);
  readonly drafts = signal<DepositDraft[]>([]);
  readonly draftsOpen = signal(false);
  readonly draftsLoading = signal(false);
  readonly draftBusy = signal(false);
  readonly draftError = signal('');
  readonly draftMessage = signal('');
  readonly activeDraftId = signal('');
  readonly previewOpen = signal(false);
  readonly employee = signal<{ fullName: string; employeeCode: string } | null>(null);
  readonly employeeError = signal('');
  readonly company = signal<DepositSheet['company']>(null);
  readonly imageNames = signal<Partial<Record<'frontImageUrl' | 'backImageUrl', string>>>({});
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
    void this.loadDrafts();
    void this.loadEmployee();
    const initialRoom = this.rooms.get(this.form.controls.roomId.value);
    if (initialRoom)
      this.form.patchValue({
        propertyId: initialRoom.propertyId,
      });
    this.form.controls.customerName.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.identityReady.set(false));
    this.identityForm.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.identityReady.set(false));
    this.form.controls.phone.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.customer()) {
        this.form.controls.customerName.setValue('');
        this.identityForm.reset();
        this.imageNames.set({});
      }
      this.customer.set(null);
      this.identityReady.set(false);
      this.customerContext = '';
      this.customerMessage.set('');
    });
    this.form.controls.roomId.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.customerContext = '';
    });
  }
  readonly eligibleBookings = computed(() => this.deposits.eligibleBookings());
  // Available rooms plus rooms held by a paid booking (HELD rooms are not in publishedRooms).
  readonly selectableRooms = computed(() => {
    const available = this.rooms.publishedRooms();
    const held = this.eligibleBookings()
      .map((b) => this.rooms.get(b.roomId))
      .filter(
        (r): r is NonNullable<typeof r> =>
          !!r && r.status === 'HELD' && !available.some((a) => a.id === r.id),
      );
    return [...available, ...held.filter((r, i) => held.findIndex((x) => x.id === r.id) === i)];
  });
  trackById(_index: number, item: { id: string }) {
    return item.id;
  }

  form = this.fb.nonNullable.group({
    bookingId: [''],
    customerName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    phone: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
    propertyId: [''],
    roomId: [
      this.route.snapshot.queryParamMap.get('roomId') || this.rooms.rooms()[0]?.id || '',
      Validators.required,
    ],
    total: [
      this.rooms.get(
        this.route.snapshot.queryParamMap.get('roomId') || this.rooms.rooms()[0]?.id || '',
      )?.deposit ||
        this.rooms.get(
          this.route.snapshot.queryParamMap.get('roomId') || this.rooms.rooms()[0]?.id || '',
        )?.standardDeposit ||
        0,
      [Validators.required, Validators.min(1)],
    ],
    collectedMethod: this.fb.nonNullable.control<'CASH' | 'BANK_TRANSFER'>(
      'BANK_TRANSFER',
      Validators.required,
    ),
    note: ['', Validators.maxLength(500)],
    duration: [12, [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)]],
    startDate: ['', Validators.required],
    terms: [false, Validators.requiredTrue],
  });
  readonly customer = signal<EmployeeCustomer | null>(null);
  readonly identityReady = signal(false);
  readonly identityBusy = signal(false);
  readonly customerMessage = signal('');
  private customerContext = '';
  identityForm = this.fb.nonNullable.group({
    idNumber: ['', [Validators.required, Validators.pattern(/^\d{12}$/)]],
    issuedOn: ['', Validators.required],
    issuedBy: ['', [Validators.required, identityTextLength(2, 200)]],
    permanentAddress: ['', [Validators.required, identityTextLength(5, 500)]],
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
    if (this.form.controls.phone.invalid || !this.form.controls.roomId.value) {
      this.form.controls.phone.markAsTouched();
      this.error = 'Nhập số điện thoại hợp lệ và chọn phòng ở mục II để tra cứu hồ sơ.';
      return;
    }
    this.identityBusy.set(true);
    this.identityReady.set(false);
    this.customerMessage.set('');
    const key = this.contextKey();
    try {
      const c = await this.deposits.money.customerForDeposit(
        this.form.controls.phone.value,
        this.form.controls.roomId.value,
      );
      if (key !== this.contextKey()) return;
      this.customer.set(c);
      if (!c) {
        this.customerContext = '';
        this.customerMessage.set(
          'Chưa có hồ sơ với số điện thoại này. Bạn có thể nhập thông tin khách mới tại đây.',
        );
        this.error = '';
        return;
      }
      this.customerContext = key;
      const i = c.identity;
      this.identityForm.setValue({
        idNumber: i?.number || '',
        issuedOn: i?.issuedDate || '',
        issuedBy: i?.issuedPlace || '',
        permanentAddress: c.permanentAddress || '',
        frontImageUrl: i?.frontImage || '',
        backImageUrl: i?.backImage || '',
      });
      this.imageNames.set({});
      this.form.patchValue({
        customerName: c.fullName || c.name || this.form.controls.customerName.value,
      });
      this.identityReady.set(this.identityForm.valid);
      this.customerMessage.set('Đã tải hồ sơ. Bạn có thể chỉnh sửa thông tin rồi lưu lại.');
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
    const phone = this.form.controls.phone.value;
    try {
      const url = await this.deposits.money.uploadIdentity(file);
      if (phone === this.form.controls.phone.value) {
        this.identityForm.controls[side].setValue(url);
        this.imageNames.update((names) => ({ ...names, [side]: file.name }));
      }
      this.error = '';
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.identityBusy.set(false);
    }
  }
  async saveIdentity() {
    this.identityForm.markAllAsTouched();
    this.form.controls.customerName.markAsTouched();
    this.form.controls.phone.markAsTouched();
    if (this.identityBusy()) return false;
    if (
      this.identityForm.invalid ||
      this.form.controls.customerName.invalid ||
      this.form.controls.phone.invalid ||
      !this.form.controls.roomId.value
    ) {
      this.error =
        'Nhập đầy đủ họ tên, số điện thoại, CCCD và chọn phòng trước khi lưu hồ sơ khách hàng.';
      return false;
    }
    this.identityBusy.set(true);
    this.customerMessage.set('');
    const key = this.contextKey();
    try {
      const identity = this.identityForm.getRawValue() as CustomerIdentity;
      const name = this.form.controls.customerName.value.trim();
      const c = await this.deposits.money.saveDepositCustomer({
        ...identity,
        customerName: name,
        customerPhone: this.form.controls.phone.value,
        roomId: this.form.controls.roomId.value,
      });
      if (key === this.contextKey()) {
        this.customer.set(c);
        this.customerContext = key;
        const saved =
          name === this.form.controls.customerName.value.trim() &&
          JSON.stringify(identity) === JSON.stringify(this.identityForm.getRawValue());
        this.identityReady.set(saved);
        this.error = saved ? '' : 'Thông tin vừa thay đổi. Vui lòng lưu lại hồ sơ khách hàng.';
        if (saved) this.customerMessage.set('Đã lưu hồ sơ khách hàng.');
        return saved;
      }
      this.error = 'Số điện thoại hoặc phòng vừa thay đổi. Vui lòng lưu lại hồ sơ khách hàng.';
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.identityBusy.set(false);
    }
    return false;
  }
  readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  readonly identityValue = toSignal(this.identityForm.valueChanges, {
    initialValue: this.identityForm.getRawValue(),
  });
  readonly properties = computed(() => {
    const rooms = this.selectableRooms();
    return Array.from(
      new Map(
        rooms.map((r) => [
          r.propertyId,
          { id: r.propertyId, name: r.propertyName || r.propertyId },
        ]),
      ).values(),
    );
  });
  readonly filteredRooms = computed(() => {
    const rooms = this.selectableRooms(),
      value = this.formValue();
    return rooms.filter((r) => r.propertyId === value.propertyId);
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
  readonly otherFees = computed(() => {
    const room = this.room();
    return Object.entries(room?.fees || {})
      .filter(([name, amount]) => {
        const key = name
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/đ/g, 'd');
        return (
          !/dien|nuoc|electric|water/.test(key) &&
          amount !== '' &&
          amount !== null &&
          amount !== undefined
        );
      })
      .map(([name, amount]) => ({ name, amount: Number(amount) }))
      .filter((fee) => Number.isFinite(fee.amount));
  });
  readonly amountWords = computed(() => vietnameseMoney(this.due()));
  readonly endDate = computed(() => {
    const value = this.formValue();
    return depositLeaseEnd(value.startDate || '', value.duration || 0);
  });
  readonly startDate = computed(() => {
    const value = this.formValue();
    return depositLeaseEnd(value.startDate || '', 1) ? value.startDate || '' : '';
  });
  readonly preview = computed<DepositSheet>(() => {
    const value = this.formValue(),
      identity = this.identityValue(),
      room = this.room();
    const employee = this.employee(),
      credit = this.credit(),
      due = this.due(),
      end = this.endDate();
    const start = this.startDate();
    const fees = this.otherFees(),
      bookings = this.eligibleBookings();
    return {
      company: this.company(),
      deposit: {
        id: '',
        number: 'Chưa cấp',
        status: '',
        statusLabel: '',
        createdAt: null,
        totalRequired: value.total || 0,
        holdCredit: credit,
        amountDue: due,
        collected: {
          method: value.collectedMethod || 'BANK_TRANSFER',
          amount: due,
          note: value.note || '',
          at: null,
        },
        proposedLease: {
          months: value.duration || null,
          startDate: start || null,
          endDate: end || null,
          monthlyRent: room?.monthlyRent ?? room?.price ?? null,
        },
      },
      hold: bookings.find((b) => b.id === value.bookingId)
        ? { number: bookings.find((b) => b.id === value.bookingId)!.number || '' }
        : null,
      customer: {
        fullName: value.customerName || '',
        phone: value.phone || '',
        permanentAddress: identity.permanentAddress || '',
        identity: {
          number: identity.idNumber || '',
          issuedDate: identity.issuedOn || '',
          issuedPlace: identity.issuedBy || '',
        },
      },
      employee: employee || { fullName: '', employeeCode: '' },
      room: {
        code: room?.code || '',
        name: room?.name || '',
        propertyName: room?.propertyName || '',
        floor: room?.floor ?? null,
        address: room?.address || '',
        type: room?.type || '',
        monthlyRent: room?.monthlyRent ?? room?.price ?? null,
        electricityPrice: room?.electricityPrice ?? null,
        waterPrice: room?.waterPrice ?? null,
        fees,
      },
      contract: null,
    };
  });
  selectProperty() {
    this.form.controls.roomId.setValue('');
  }
  selectBooking() {
    const b = this.eligibleBookings().find((b) => b.id === this.form.controls.bookingId.value);
    if (b)
      this.form.patchValue({
        propertyId: this.rooms.get(b.roomId)?.propertyId || '',
        roomId: b.roomId,
        phone: b.phone,
        customerName: b.name,
        total: Math.max(this.form.controls.total.value, b.amount),
      });
  }
  async loadEmployee() {
    this.employeeError.set('');
    try {
      this.employee.set(await this.documents.employee());
    } catch (e) {
      this.employeeError.set((e as Error).message);
    }
    try {
      this.company.set(await this.documents.company());
    } catch {
      /* Preview shows '—' for company fields when unavailable. */
    }
  }
  async loadDrafts() {
    this.draftsLoading.set(true);
    this.draftError.set('');
    try {
      this.drafts.set((await this.documents.listDrafts()).items);
    } catch (e) {
      this.draftError.set((e as Error).message);
    } finally {
      this.draftsLoading.set(false);
    }
  }
  async saveDraft(asNew = false) {
    if (this.busy || this.draftBusy() || this.draftsLoading() || this.identityBusy()) return;
    const { terms, ...values } = this.form.getRawValue();
    // Number inputs can emit null when cleared, even with nonNullable controls.
    // B1 accepts strings and finite numbers only; omit empty numeric fields.
    const data = Object.fromEntries(
      Object.entries({ ...values, ...this.identityForm.getRawValue() }).filter(
        ([, value]) => value != null && (typeof value !== 'number' || Number.isFinite(value)),
      ),
    ) as Partial<DepositDraftData>;
    if (
      !Object.entries(data).some(
        ([key, value]) =>
          !['total', 'duration', 'collectedMethod'].includes(key) &&
          typeof value === 'string' &&
          value.trim(),
      )
    ) {
      this.draftError.set('Nhập ít nhất một thông tin để lưu nháp.');
      return;
    }
    this.draftBusy.set(true);
    this.draftError.set('');
    this.draftMessage.set('');
    try {
      const draft = await this.documents.saveDraft(
        data,
        asNew ? undefined : this.activeDraftId() || undefined,
      );
      this.activeDraftId.set(draft.id);
      this.draftsOpen.set(true);
      this.drafts.update((items) => [draft, ...items.filter((item) => item.id !== draft.id)]);
      this.draftMessage.set(
        'Đã lưu nháp lúc ' +
          new Date(draft.updatedAt).toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }),
      );
    } catch (e) {
      this.draftError.set((e as Error).message);
    } finally {
      this.draftBusy.set(false);
    }
  }
  openDraft(draft: DepositDraft) {
    if (this.busy || this.draftBusy() || this.draftsLoading() || this.identityBusy()) return;
    const {
        idNumber = '',
        issuedOn = '',
        issuedBy = '',
        permanentAddress = '',
        frontImageUrl = '',
        backImageUrl = '',
        floor: _legacyFloor,
        ...data
      } = draft.data,
      room = this.rooms.get(data.roomId || '');
    this.customer.set(null);
    this.form.reset({
      bookingId: '',
      customerName: '',
      phone: '',
      roomId: '',
      propertyId: '',
      total: 0,
      duration: 12,
      startDate: '',
      collectedMethod: 'BANK_TRANSFER',
      note: '',
      ...data,
      terms: false,
    });
    this.form.patchValue({
      propertyId: room?.propertyId ?? data.propertyId ?? '',
    });
    this.customer.set(null);
    this.customerContext = '';
    this.identityReady.set(false);
    this.identityForm.reset({
      idNumber,
      issuedOn,
      issuedBy,
      permanentAddress,
      frontImageUrl,
      backImageUrl,
    });
    this.imageNames.set({});
    this.customerMessage.set('');
    this.activeDraftId.set(draft.id);
    this.draftMessage.set('Đã mở nháp. Bạn có thể sửa thông tin và bấm “Lưu nháp” để cập nhật.');
    this.draftError.set('');
    this.error = '';
  }
  async deleteDraft(draft: DepositDraft) {
    if (
      this.busy ||
      this.draftBusy() ||
      this.draftsLoading() ||
      !window.confirm('Xóa nháp này? Thao tác này không thể hoàn tác.')
    )
      return;
    this.draftBusy.set(true);
    this.draftError.set('');
    try {
      await this.documents.deleteDraft(draft.id);
      this.drafts.update((items) => items.filter((item) => item.id !== draft.id));
      if (this.activeDraftId() === draft.id) this.activeDraftId.set('');
      this.draftMessage.set('Đã xóa nháp.');
    } catch (e) {
      this.draftError.set((e as Error).message);
    } finally {
      this.draftBusy.set(false);
    }
  }
  imageName(side: 'frontImageUrl' | 'backImageUrl') {
    const names = this.imageNames(),
      identity = this.identityValue();
    return names[side] || identity[side]?.split('/').pop() || '';
  }
  async submit() {
    if (this.busy || this.draftBusy() || this.identityBusy()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.error = 'Kiểm tra các trường bắt buộc và xác nhận thông tin hồ sơ cọc.';
      return;
    }
    this.identityForm.markAllAsTouched();
    if (this.identityForm.invalid) {
      this.error = 'Nhập và đính kèm đầy đủ CCCD trước khi lập cọc.';
      return;
    }
    const selectedRoom = this.selectableRooms().find(
      (r) => r.id === this.form.controls.roomId.value,
    );
    if (!selectedRoom) {
      this.error = 'Phòng không còn đủ điều kiện lập cọc. Vui lòng chọn lại.';
      return;
    }
    this.busy = true;
    try {
      const v = this.form.getRawValue();
      if (!Number.isSafeInteger(v.total) || !this.endDate()) {
        this.error = 'Nhập số tiền nguyên đồng, ngày bắt đầu và số tháng thuê hợp lệ.';
        return;
      }
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
      if (
        (!this.identityReady() || this.contextKey() !== this.customerContext) &&
        !(await this.saveIdentity())
      )
        return;
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
          draftId: this.activeDraftId() || undefined,
        },
        v.bookingId || undefined,
      );
      this.activeDraftId.set('');
      void this.rooms.refresh();
      await this.router.navigate(['/employee/deposits', d.id, 'receipt']);
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.busy = false;
    }
  }
}
