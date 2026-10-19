import { Component, inject } from '@angular/core';
import { AdminDashboardDemoService } from '../../../services/admin-dashboard-demo.service';

type TransactionKind = 'deposit' | 'forfeiture' | 'contract';
interface DemoTransaction {
  id: string;
  kind: TransactionKind;
  icon: string;
  badge: string;
  room: string;
  staff: string;
  customer: string;
  amount: number;
  amountLabel: string;
  submitted: string;
  action: string;
  secondary: string;
  approved: boolean;
}
interface DashboardDialog {
  title: string;
  text: string;
  type: 'info' | 'approve' | 'export';
  ids?: string[];
}
@Component({
  selector: 'app-admin-dashboard-frame',
  standalone: false,
  templateUrl: './admin-dashboard-frame.component.html',
  styleUrls: ['./admin-dashboard-frame.component.css'],
})
export class AdminDashboardFrameComponent {
  private dashboardDemo = inject(AdminDashboardDemoService);
  constructor() {
    this.dashboardDemo.pendingCount.set(4);
  }
  month = '2026-03';
  filter = 'all';
  toast = '';
  dialog: DashboardDialog | null = null;
  updatedAt = this.time();
  readonly periods = [
    {
      id: '2026-03',
      label: '03/2026',
      revenue: 386400000,
      growth: 18.4,
      occupancy: 92.6,
      occupied: 176,
      vacant: 14,
      available: 8,
      depositCount: 18,
      team1: 218600000,
      team2: 167800000,
    },
    {
      id: '2026-04',
      label: '04/2026',
      revenue: 412800000,
      growth: 6.8,
      occupancy: 94.7,
      occupied: 180,
      vacant: 10,
      available: 4,
      depositCount: 22,
      team1: 232800000,
      team2: 180000000,
    },
    {
      id: '2026-10',
      label: '10/2026',
      revenue: 1248600000,
      growth: 12.5,
      occupancy: 95.8,
      occupied: 182,
      vacant: 8,
      available: 2,
      depositCount: 26,
      team1: 698600000,
      team2: 550000000,
    },
  ];
  readonly transactions: DemoTransaction[] = [
    {
      id: '#PC – 2026 – HD403',
      kind: 'deposit',
      icon: 'UNC',
      badge: 'Đã nhận UNC Ngân hàng',
      room: 'KTX Hoàng Diệu – P.403B',
      staff: 'Tăng Khả Ái',
      customer: 'Lê Minh Triết (SV ĐHQG)',
      amount: 1800000,
      amountLabel: 'Tiền cọc',
      submitted: '09:12 · 30 phút trước',
      action: 'Duyệt Cọc & Khóa Phòng',
      secondary: 'Yêu cầu nộp bổ sung',
      approved: false,
    },
    {
      id: '#BB – PHẠT – 089',
      kind: 'forfeiture',
      icon: 'shield',
      badge: 'Biên bản Tịch thu cọc 100%',
      room: 'ĐHQG Khu B – Block C2–205',
      staff: 'Trần Quốc Dũng',
      customer: 'Vũ Đình Khang (Quá hạn ký HĐ 72 giờ)',
      amount: 2200000,
      amountLabel: 'Thu ngân sách',
      submitted: 'Thông báo lần cuối: Hôm qua 18:00',
      action: 'Phê duyệt Xuất Biên bản',
      secondary: 'Gia hạn 24h hỗ trợ sinh viên',
      approved: false,
    },
    {
      id: '#PC – 2026 – DH112',
      kind: 'contract',
      icon: 'HĐ',
      badge: 'Gia hạn hợp đồng 12 tháng',
      room: 'Nhà Phố Dĩ An – Căn A12',
      staff: 'Ngô Thị Thúy Hằng',
      customer: 'Nhóm SV Bách Khoa (4 người)',
      amount: 5500000,
      amountLabel: 'Giá trị HĐ / tháng',
      submitted: 'Tiền cọc giữ: 5.500.000 đ · Đã xác minh',
      action: 'Duyệt Ký Số Hợp Đồng',
      secondary: 'Xem dự thảo điều khoản',
      approved: false,
    },
    {
      id: '#PC – 2026 – HD508',
      kind: 'deposit',
      icon: 'UNC',
      badge: 'Đã nhận UNC Ngân hàng',
      room: 'KTX Hoàng Diệu – P.508A',
      staff: 'Lê Hoàng Nam',
      customer: 'Nguyễn Thị Minh Anh (SV ĐH Kinh tế – Luật)',
      amount: 2400000,
      amountLabel: 'Tiền cọc',
      submitted: '09:28 · 14 phút trước',
      action: 'Duyệt Cọc & Khóa Phòng',
      secondary: 'Yêu cầu nộp bổ sung',
      approved: false,
    },
  ];
  readonly shifts = [
    {
      initials: 'KA',
      name: 'Tăng Khả Ái',
      detail: 'Ca sáng: 08:00 – 12:00',
      status: 'Đúng giờ',
      tone: 'on-time',
      location: 'VP KTX Hoàng Diệu (Cách 8m)',
      time: '07:54',
    },
    {
      initials: 'QD',
      name: 'Trần Quốc Dũng',
      detail: 'Ca sáng: 08:00 – 12:00',
      status: 'Trễ 24p',
      tone: 'late',
      location: 'Phạt tự động: -50.000 đ',
      time: '08:24',
    },
    {
      initials: 'LH',
      name: 'Lê Hoàng Nam',
      detail: 'Dẫn khách xem phòng',
      status: 'Ngoài văn phòng',
      tone: 'outside',
      location: 'Cách VP 1.4km (Đang xác nhận)',
      time: '08:05',
    },
  ];
  get period() {
    return this.periods.find((item) => item.id === this.month)!;
  }
  get pendingCount() {
    return this.transactions.filter((item) => !item.approved).length;
  }
  get visibleTransactions() {
    return this.transactions.filter(
      (item) => !item.approved && (this.filter === 'all' || item.kind === this.filter),
    );
  }
  get teamTarget1() {
    return this.month === '2026-10' ? 800000000 : 250000000;
  }
  get teamTarget2() {
    return this.month === '2026-10' ? 600000000 : 180000000;
  }
  private time() {
    return new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  }
  changeMonth() {
    this.updatedAt = this.time();
    this.toast = 'Đã chuyển sang bộ dữ liệu minh họa tháng ' + this.period.label + '.';
  }
  requestApproval(item?: DemoTransaction) {
    const items = item ? [item] : this.visibleTransactions;
    if (!items.length) {
      this.toast = 'Không còn giao dịch trong bộ lọc này để duyệt.';
      return;
    }
    this.dialog = {
      type: 'approve',
      title: item ? 'Xác nhận: ' + item.action : 'Duyệt nhanh ' + items.length + ' giao dịch?',
      text: item
        ? item.id +
          ' · ' +
          item.room +
          '. Thao tác chỉ mô phỏng phê duyệt trên dashboard, không chuyển tiền, khóa phòng hay ký hợp đồng thực tế.'
        : 'Áp dụng cho các giao dịch đang hiển thị theo bộ lọc. Thao tác chỉ mô phỏng trên dashboard và sẽ được đặt lại khi tải lại trang.',
      ids: items.map((transaction) => transaction.id),
    };
  }
  confirmApproval() {
    const ids = this.dialog?.ids || [];
    this.transactions.forEach((item) => {
      if (ids.includes(item.id)) item.approved = true;
    });
    this.dialog = null;
    this.dashboardDemo.pendingCount.set(this.pendingCount);
    this.updatedAt = this.time();
    this.toast = 'Đã duyệt ' + ids.length + ' giao dịch mẫu. Không phát sinh thao tác thực tế.';
  }
  showInfo(title: string, text: string) {
    this.dialog = { type: 'info', title, text };
  }
  secondaryAction(item: DemoTransaction) {
    this.showInfo(
      item.secondary,
      item.kind === 'contract'
        ? 'Dự thảo mẫu: kỳ hạn 12 tháng, tiền thuê 5.500.000 đ/tháng, cọc giữ 5.500.000 đ. Chưa có tài liệu hay chữ ký thực tế.'
        : item.id +
            ': yêu cầu hỗ trợ đã được ghi nhận minh họa. Không gửi tin nhắn, thay đổi hạn hay cập nhật hồ sơ thực tế.',
    );
  }
  exportReport() {
    const rows = [
      'Báo cáo minh họa iHOUZZ Uni;Tháng ' + this.period.label,
      'Chỉ số;Giá trị',
      'Doanh thu;' + this.period.revenue,
      'Cọc mới;' + this.period.depositCount,
      'Giao dịch còn chờ duyệt;' + this.pendingCount,
      'Tỷ lệ lấp đầy (%);' + this.period.occupancy,
      'Doanh số nhóm Khu B;' + this.period.team1,
      'Doanh số nhóm KTX Hoàng Diệu;' + this.period.team2,
      'Hoa hồng dự kiến;' + this.period.revenue * 0.1,
    ];
    const url = URL.createObjectURL(
      new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ihouzz-dashboard-demo-' + this.month + '.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.dialog = null;
    this.toast = 'Đã xuất báo cáo CSV mẫu, có thể mở bằng Excel.';
  }
  printReport() {
    this.dialog = null;
    setTimeout(() => window.print(), 0);
  }
}
