import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth-service';
import { BookingService, PAYOS_LOCATION } from '../../services/booking-service';
import { HoldPayosLink } from '../../classes/Money';
import { RoomService } from '../../services/room-service';
import { apiMessage } from '../../services/api-message';
import { PHONE_PATTERN } from '../../shared/validators';
@Component({
  selector: 'app-customer-hold-payment-frame',
  standalone: false,
  templateUrl: './customer-booking-new.html',
  styleUrls: ['./customer-booking-new.css'],
})
export class CustomerBookingNewComponent {
  rooms = inject(RoomService);
  auth = inject(AuthService);
  booking = inject(BookingService);
  route = inject(ActivatedRoute);
  router = inject(Router);
  private fb = inject(FormBuilder);
  room: ReturnType<RoomService['forRecord']> = this.rooms
    .rooms()
    .find((room) => room.id === this.route.snapshot.queryParamMap.get('roomId'));
  readonly pendingId = signal('');
  readonly error = signal('');
  readonly busy = signal(false);
  private location = inject(PAYOS_LOCATION);
  readonly payosLink = signal<HoldPayosLink | null>(null);
  readonly gatewayUnavailable = signal(false);
  readonly copied = signal(false);
  readonly now = signal(Date.now());
  private destroyed = false;
  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      clearInterval(timer);
    });
    void this.booking
      .refresh()
      .then(async () => {
        if (this.destroyed) return;
        const pending = this.holds.find(
          (h) =>
            h.roomId === this.route.snapshot.queryParamMap.get('roomId') &&
            h.apiStatus === 'PAYMENT_PENDING',
        );
        if (pending) await this.resume(pending.id);
      })
      .catch((e) => this.error.set(apiMessage(e, 'Không tải được giữ chỗ.')));
  }
  get amount() {
    return this.booking.get(this.pendingId())?.amount;
  }
  get pendingHold() {
    return this.booking.get(this.pendingId());
  }
  get secondsLeft() {
    const deadline = Date.parse(this.pendingHold?.expiresAt || '');
    return Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - this.now()) / 1000)) : 0;
  }
  get paymentReference() {
    return this.payosLink()?.description || '';
  }
  get countdown() {
    const seconds = this.secondsLeft;
    return `${Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  }
  get canPay() {
    return this.pendingHold?.apiStatus === 'PAYMENT_PENDING' && this.secondsLeft > 0;
  }
  async copyReference() {
    this.copied.set(false);
    if (!this.paymentReference) return;
    try {
      await navigator.clipboard.writeText(this.paymentReference);
      this.copied.set(true);
    } catch {
      this.error.set(
        'Không sao chép được. Vui lòng chọn và sao chép nội dung chuyển khoản bên dưới.',
      );
    }
  }
  async resume(id: string) {
    if (this.busy()) return;
    const hold = this.booking.get(id);
    if (hold?.apiStatus === 'PAYMENT_PENDING') {
      this.busy.set(true);
      this.pendingId.set(id);
      this.room = this.rooms.forRecord(hold);
      this.now.set(Date.now());
      this.copied.set(false);
      this.error.set('');
      this.payosLink.set(null);
      try {
        await this.preparePayment();
      } finally {
        this.busy.set(false);
      }
    }
  }
  async cancelHold(id: string) {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.booking.cancel(id);
      if (this.pendingId() === id) {
        this.pendingId.set('');
        this.payosLink.set(null);
      }
    } catch (e) {
      this.error.set(apiMessage(e, 'Không xử lý được yêu cầu giữ chỗ. Vui lòng thử lại.'));
    } finally {
      this.busy.set(false);
    }
  }
  async refreshPending() {
    if (this.busy() || this.booking.loading()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.booking.refresh();
      this.now.set(Date.now());
      if (this.pendingHold?.paymentId) {
        await this.router.navigate(['/bookings', this.pendingId(), 'receipt']);
      } else if (['EXPIRED', 'CANCELLED'].includes(this.pendingHold?.apiStatus || '')) {
        this.pendingId.set('');
        this.payosLink.set(null);
      }
    } catch (e) {
      this.error.set(apiMessage(e, 'Không tải được trạng thái giữ chỗ. Vui lòng thử lại.'));
    } finally {
      this.busy.set(false);
    }
  }
  form = this.fb.nonNullable.group({
    name: [this.auth.account()?.name || '', Validators.required],
    phone: [
      this.auth.account()?.phone || '',
      [Validators.required, Validators.pattern(PHONE_PATTERN)],
    ],
    moveIn: ['', Validators.required],
    note: [''],
    terms: [false, Validators.requiredTrue],
  });
  async submit() {
    if (this.busy() || this.pendingId()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid || !this.room) return;
    this.busy.set(true);
    try {
      const v = this.form.getRawValue();
      if (new Date(v.moveIn + 'T23:59:59').getTime() < Date.now()) {
        this.error.set('Ngày dự kiến nhận phòng không được ở quá khứ.');
        return;
      }
      this.pendingId.set(
        (
          await this.booking.createRequest(this.room.id, v.name, v.phone, {
            moveIn: v.moveIn,
            note: v.note,
          })
        ).id,
      );
      this.now.set(Date.now());
      this.copied.set(false);
      this.payosLink.set(null);
      this.error.set('');
      await this.preparePayment();
    } catch (e) {
      this.error.set(apiMessage(e, 'Không xử lý được yêu cầu giữ chỗ. Vui lòng thử lại.'));
    } finally {
      this.busy.set(false);
    }
  }
  private async preparePayment() {
    if (!this.canPay || this.gatewayUnavailable()) return;
    try {
      this.payosLink.set(await this.booking.createPayosLink(this.pendingId()));
    } catch (e) {
      this.paymentError(e);
    }
  }
  private paymentError(error: unknown) {
    const message = apiMessage(error, 'Không tạo được liên kết thanh toán. Vui lòng thử lại.');
    this.error.set(message);
    if (message === 'Chưa cấu hình cổng thanh toán. Vui lòng liên hệ nhân viên.')
      this.gatewayUnavailable.set(true);
  }
  async pay() {
    if (this.busy() || this.gatewayUnavailable()) return;
    if (!this.canPay) {
      this.error.set('Đã hết thời gian thanh toán. Vui lòng tạo yêu cầu giữ chỗ mới.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const link = await this.booking.createPayosLink(this.pendingId());
      this.payosLink.set(link);
      this.now.set(Date.now());
      if (this.destroyed) return;
      if (this.canPay) this.location.assign(link.checkoutUrl);
      else this.error.set('Đã hết thời gian thanh toán. Vui lòng tạo yêu cầu giữ chỗ mới.');
    } catch (e) {
      this.paymentError(e);
    } finally {
      this.busy.set(false);
    }
  }
  get holds() {
    return this.booking.list();
  }
}
