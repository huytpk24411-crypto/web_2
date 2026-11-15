import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-status-badge',
  standalone: false,
  templateUrl: './status-badge.html',
  styleUrls: ['./status-badge.css'],
})
export class StatusBadgeComponent {
  @Input() status = 'AVAILABLE';
  labels: Record<string, string> = {
    AVAILABLE: 'Đang trống',
    HELD: 'Đang giữ chỗ',
    RENTED: 'Đã cho thuê',
    MAINTENANCE: 'Bảo trì / Sửa chữa',
    HIDDEN: 'Đã ẩn',
    PENDING: 'Chờ xác nhận',
    CONFIRMED: 'Đã xác nhận',
    EXPIRED: 'Đã hết hạn',
    REGISTERED: 'Đã đăng ký',
    IN_PROGRESS: 'Đang thực hiện',
    COMPLETED: 'Hoàn thành',
    FORFEITED: 'Đã xử lý bỏ cọc',
    TODO: 'Chờ xử lý',
    DONE: 'Hoàn thành',
    SCHEDULED: 'Đã đặt lịch',
    CANCELLED: 'Đã hủy',
  };
}
