import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { HoldPaymentStatus } from '../../classes/Money';
import { BookingService, PAYOS_LOCATION } from '../../services/booking-service';
import { apiMessage } from '../../services/api-message';
import { RoomService } from '../../services/room-service';
@Component({
  selector: 'app-customer-booking-receipt-frame',
  standalone: false,
  templateUrl: './customer-booking-receipt.html',
  styleUrls: ['./customer-booking-receipt.css'],
})
export class CustomerBookingReceiptComponent {
  booking = inject(BookingService);
  rooms = inject(RoomService);
  route = inject(ActivatedRoute);
  private location = inject(PAYOS_LOCATION);
  id = this.route.snapshot.paramMap.get('id') || '';
  private readonly payos = this.route.snapshot.queryParamMap?.get('payos');
  readonly error = signal('');
  readonly busy = signal(false);
  readonly gatewayUnavailable = signal(false);
  readonly timedOut = signal(false);
  readonly now = signal(Date.now());
  private readonly status = signal<HoldPaymentStatus | null>(null);
  readonly holdStatus = computed(() => this.status()?.holdStatus || this.hold?.apiStatus);
  readonly expired = computed(() => {
    const state = this.holdStatus();
    const deadline = Date.parse(this.status()?.expiresAt || this.hold?.expiresAt || '');
    return (
      state === 'EXPIRED' ||
      (state === 'PAYMENT_PENDING' && Number.isFinite(deadline) && deadline <= this.now())
    );
  });
  readonly canRetry = computed(() => this.holdStatus() === 'PAYMENT_PENDING' && !this.expired());
  private readonly stop = new Subject<void>();
  private pollTimer?: ReturnType<typeof setInterval>;
  private timeoutTimer?: ReturnType<typeof setTimeout>;
  private pollUntil = 0;
  private checking = false;
  private destroyed = false;
  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      clearInterval(timer);
      this.stopPolling();
      this.stop.complete();
    });
    void this.refresh();
  }
  get hold() {
    return this.booking.get(this.id);
  }
  get payment() {
    return this.booking.payments().find((p) => p.id === this.hold?.paymentId);
  }
  get receipt() {
    return this.booking.receipt(this.hold?.paymentId);
  }
  get confirmed() {
    return ['ACTIVE', 'CONVERTED'].includes(this.holdStatus() || '');
  }
  get heading() {
    if (this.holdStatus() === 'FORFEITED') return 'Khách bỏ giữ chỗ';
    if (this.expired()) return 'Giữ chỗ đã hết hạn';
    if (this.holdStatus() === 'CANCELLED') return 'Yêu cầu giữ chỗ đã hủy';
    if (this.holdStatus() === 'CONVERTED') return 'Đã chuyển thành cọc';
    if (this.confirmed) return 'Thanh toán thành công';
    if (this.payos === 'cancel') return 'Bạn đã hủy thanh toán.';
    if (this.timedOut()) return 'Chưa nhận được xác nhận từ ngân hàng';
    if (this.holdStatus() === 'PAYMENT_PENDING' || this.payos === 'return')
      return 'Đang chờ ngân hàng xác nhận thanh toán…';
    return 'Chưa hoàn tất thanh toán';
  }
  get message() {
    if (this.status()?.paymentStatus === 'LATE_PAID')
      return 'Ngân hàng ghi nhận thanh toán sau khi yêu cầu giữ chỗ đã hết hạn. Theo quy định, khoản tiền này không được hoàn lại.';
    if (this.holdStatus() === 'FORFEITED')
      return 'Đã quá 48 giờ chưa làm hồ sơ cọc. Tiền giữ chỗ không được hoàn lại.';
    if (this.expired()) return 'Đã hết thời gian thanh toán 15 phút. Vui lòng chọn phòng khác.';
    if (this.holdStatus() === 'CANCELLED')
      return 'Yêu cầu giữ chỗ đã hủy. Vui lòng chọn phòng khác.';
    if (this.confirmed)
      return this.receipt
        ? 'Biên lai đã sẵn sàng. Bạn có thể in hoặc lưu thành PDF từ trình duyệt.'
        : 'Ngân hàng đã xác nhận thanh toán. Vui lòng tải lại để xem biên lai.';
    if (this.payos === 'cancel') return 'Bạn có thể thanh toán lại khi yêu cầu giữ chỗ còn hạn.';
    if (this.timedOut())
      return 'Vui lòng tải lại trạng thái để kiểm tra xác nhận và biên lai từ ngân hàng.';
    return 'Biên lai sẽ hiển thị sau khi ngân hàng xác nhận thanh toán.';
  }
  private stopPolling() {
    clearInterval(this.pollTimer);
    clearTimeout(this.timeoutTimer);
    this.pollTimer = undefined;
    this.timeoutTimer = undefined;
    this.stop.next();
  }
  private async checkPayment() {
    if (this.destroyed || this.timedOut() || this.checking) return;
    if (Date.now() >= this.pollUntil) {
      this.timedOut.set(true);
      this.stopPolling();
      return;
    }
    this.checking = true;
    try {
      const status = await this.booking.paymentStatus(this.id, this.stop);
      if (this.destroyed || this.timedOut()) return;
      this.status.set(status);
      this.now.set(Date.now());
      this.error.set('');
      if (
        status.holdStatus !== 'PAYMENT_PENDING' ||
        this.expired() ||
        status.paymentStatus === 'LATE_PAID'
      ) {
        this.stopPolling();
        await this.booking.refresh();
      }
    } catch (e) {
      if (!this.destroyed && !this.timedOut())
        this.error.set(
          apiMessage(e, 'Không kiểm tra được thanh toán. Vui lòng tải lại trạng thái.'),
        );
    } finally {
      this.checking = false;
    }
  }
  async refresh() {
    if (this.busy() || this.checking || this.destroyed) return;
    this.stopPolling();
    this.busy.set(true);
    this.error.set('');
    this.timedOut.set(false);
    try {
      await this.booking.refresh();
      if (this.destroyed) return;
      this.status.set(null);
      this.now.set(Date.now());
      if (
        this.hold?.apiStatus === 'PAYMENT_PENDING' ||
        (this.payos === 'return' && !this.hold?.apiStatus)
      ) {
        this.pollUntil = Date.now() + 3 * 60000;
        this.pollTimer = setInterval(() => void this.checkPayment(), 3000);
        this.timeoutTimer = setTimeout(() => {
          this.timedOut.set(true);
          this.stopPolling();
        }, 3 * 60000);
        await this.checkPayment();
      }
    } catch (e) {
      if (!this.destroyed) this.error.set(apiMessage(e, 'Không tải được phiếu giữ chỗ.'));
    } finally {
      this.busy.set(false);
    }
  }
  async retryPayment() {
    if (!this.canRetry() || this.busy() || this.gatewayUnavailable()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const link = await this.booking.createPayosLink(this.id);
      this.now.set(Date.now());
      if (!this.destroyed && this.canRetry()) this.location.assign(link.checkoutUrl);
    } catch (e) {
      const message = apiMessage(e, 'Không tạo được liên kết thanh toán. Vui lòng thử lại.');
      this.error.set(message);
      if (message === 'Chưa cấu hình cổng thanh toán. Vui lòng liên hệ nhân viên.')
        this.gatewayUnavailable.set(true);
    } finally {
      this.busy.set(false);
    }
  }
  get room() {
    return this.rooms.forRecord(this.hold);
  }
  print() {
    if (this.confirmed && this.receipt) window.print();
  }
}
