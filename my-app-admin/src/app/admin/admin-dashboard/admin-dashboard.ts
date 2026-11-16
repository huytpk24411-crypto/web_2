import { Component, inject, signal } from '@angular/core';
import { AdminDashboardAPI } from '../../services/admin-dashboard-apiservice';
import { downloadFile, csv } from '../admin-finance-export';

@Component({
  selector: 'app-admin-dashboard-frame',
  standalone: false,
  templateUrl: './admin-dashboard.html',
  styleUrls: ['./admin-dashboard.css'],
})
export class AdminDashboardComponent {
  readonly api = inject(AdminDashboardAPI);
  month = this.api.currentMonth();
  readonly toast = signal('');
  changeMonth() {
    if (this.month) void this.api.refresh(this.month);
  }
  exportReport() {
    const s = this.api.summary();
    if (!s) return;
    downloadFile(
      `ihouzz-dashboard-${s.month}.csv`,
      csv([
        ['Chỉ số', 'Giá trị'],
        ['Tháng', s.month],
        ['Cập nhật', s.asOf],
        ['Doanh thu môi giới', s.revenue],
        ['Hoa hồng', s.commission],
        ['Hợp đồng chưa xác nhận', s.pendingDeposits],
        ['Nhân sự hoạt động', s.activeStaff],
        ['Tổng phòng hiện tại', s.rooms.total],
        ...Object.entries(s.rooms.byStatus).map(([status, count]) => [status, count]),
        ['Ngày chấm công', s.today.date],
        ['Ca hôm nay', s.today.shifts],
        ['Phân ca', s.today.assignments],
        ['Đã check-in', s.today.checkedIn],
        ['Đã check-out', s.today.checkedOut],
        ['Đi trễ', s.today.late],
        ['Vắng', s.today.absent],
      ]),
    );
    this.toast.set('Đã xuất báo cáo CSV.');
  }
}
