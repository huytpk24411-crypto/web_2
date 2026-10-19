import { Component, inject } from '@angular/core';
import { AdminDashboardDemoService } from '../../../services/admin-dashboard-demo.service';
import { demoCsv, downloadDemo } from '../admin-finance-demo';

interface Approval {
  id: string;
  kind: string;
  badge: string;
  room: string;
  cluster: string;
  staff: string;
  customer: string;
  amount: number;
  note: string;
  time: string;
  action: string;
  state: 'pending' | 'approved' | 'rejected';
  extended?: boolean;
  requested?: boolean;
  processingNote?: string;
}
@Component({
  selector: 'app-admin-approvals',
  standalone: false,
  templateUrl: './admin-approvals.component.html',
  styleUrls: ['../admin-finance-ui.css', './admin-approvals.component.css'],
})
export class AdminApprovalsComponent {
  private demo = inject(AdminDashboardDemoService);
  toast = '';
  search = '';
  cluster = 'all';
  amount = 'all';
  status = 'pending';
  filters = { search: '', cluster: 'all', amount: 'all', status: 'pending' };
  dialog: { title: string; type: string; items: Approval[] } | null = null;
  reason = '';
  error = '';
  readonly records: Approval[] = [
    {
      id: 'PC-2026-HD403',
      kind: 'deposit',
      badge: 'Đã nhận UNC Ngân hàng',
      room: 'KTX Hoàng Diệu - P.403B',
      cluster: 'hd',
      staff: 'Tăng Khả Ái',
      customer: 'Lê Minh Triết (SV ĐHQG)',
      amount: 1800000,
      note: 'Xem ảnh UNC (VietinBank.jpg)',
      time: '09:12 (30 phút trước)',
      action: 'Duyệt Cọc & Khóa Phòng',
      state: 'pending',
    },
    {
      id: 'PC-2026-HD408',
      kind: 'waiting',
      badge: 'Chờ Đối Soát Techcombank',
      room: 'Căn hộ Duplex The Nestro - P.402',
      cluster: 'da',
      staff: 'Lê Hoàng Nam',
      customer: 'Nguyễn Mai Anh',
      amount: 8400000,
      note: 'Phí dịch vụ: 0 đ (Gói sinh viên miễn phí)',
      time: '08:45 (57 phút trước)',
      action: 'Duyệt Cọc & Giữ Chỗ',
      state: 'pending',
    },
    {
      id: 'BB-PHAT-089',
      kind: 'forfeiture',
      badge: 'Biên bản Tịch thu cọc 100%',
      room: 'ĐHQG Khu B - Block C2-205',
      cluster: 'kb',
      staff: 'Trần Quốc Dũng',
      customer: 'Vũ Đình Khang (Quá hạn ký HĐ 72h)',
      amount: 2200000,
      note: 'Thông báo lần cuối: Hôm qua 18:00',
      time: 'Đã gửi SMS 3 lần',
      action: 'Phê duyệt Xuất Biên bản',
      state: 'pending',
    },
    {
      id: 'PC-2026-DH112',
      kind: 'contract',
      badge: 'Gia hạn hợp đồng 12 tháng',
      room: 'Nhà Phố Dĩ An - Căn A12',
      cluster: 'da',
      staff: 'Ngô Thị Thúy Hằng',
      customer: 'Nhóm SV Bách Khoa (4 người)',
      amount: 5500000,
      note: 'Bảo lãnh tài sản: Đầy đủ phụ lục',
      time: 'Giá trị HĐ: 5.500.000 đ/tháng',
      action: 'Duyệt Ký Số Hợp Đồng',
      state: 'pending',
    },
  ];
  constructor() {
    this.updateCount();
  }
  get pending() {
    return this.records.filter((r) => r.state === 'pending');
  }
  get pendingAmount() {
    return this.pending.reduce((sum, r) => sum + r.amount, 0);
  }
  get actionableCount() {
    return this.visible.filter((r) => r.state === 'pending').length;
  }
  get approved() {
    return this.records.filter((r) => r.state === 'approved');
  }
  get approvedAmount() {
    return 62400000 + this.approved.reduce((sum, r) => sum + r.amount, 0);
  }
  get visible() {
    const f = this.filters,
      q = this.normalize(f.search);
    return this.records.filter(
      (r) =>
        (f.status === 'all' || r.state === f.status) &&
        (f.cluster === 'all' || r.cluster === f.cluster) &&
        (f.amount === 'all' || (f.amount === 'small' ? r.amount < 5000000 : r.amount >= 5000000)) &&
        this.normalize([r.id, r.room, r.customer, r.staff].join(' ')).includes(q),
    );
  }
  normalize(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/đ/g, 'd');
  }
  apply() {
    this.filters = {
      search: this.search,
      cluster: this.cluster,
      amount: this.amount,
      status: this.status,
    };
  }
  resetFilters() {
    this.search = '';
    this.cluster = this.amount = 'all';
    this.status = 'pending';
    this.apply();
  }
  open(type: string, item?: Approval) {
    const items = item ? [item] : this.visible.filter((r) => r.state === 'pending');
    if (!items.length) {
      this.toast = 'Không có hồ sơ chờ duyệt trong bộ lọc.';
      return;
    }
    this.reason = '';
    this.error = '';
    const titles: Record<string, string> = {
      approve: item ? item.action : 'Duyệt nhanh tất cả hồ sơ đang lọc',
      reject: 'Từ chối hồ sơ',
      detail: 'Chi tiết giao dịch',
      evidence: 'Kiểm tra Ủy nhiệm chi',
      request: 'Yêu cầu bổ sung hồ sơ',
      extend: 'Gia hạn 24h hỗ trợ sinh viên',
      contract: 'Dự thảo điều khoản hợp đồng',
      distribution: 'Phân bổ quỹ cọc theo cụm tòa',
    };
    this.dialog = { title: titles[type] || 'Thông tin hồ sơ', type, items };
  }
  confirm() {
    if (!this.dialog) return;
    const { type, items } = this.dialog;
    if ((type === 'reject' || type === 'request') && !this.reason.trim()) {
      this.error = 'Vui lòng nhập nội dung trước khi xác nhận.';
      return;
    }
    items.forEach((r) => {
      if (type === 'approve' && r.state === 'pending') r.state = 'approved';
      if (type === 'reject' && r.state === 'pending') r.state = 'rejected';
      if (type === 'extend') {
        r.extended = true;
        r.time = 'Đã gia hạn thêm 24 giờ';
      }
      if (type === 'request') r.requested = true;
      if (type === 'reject' || type === 'request') r.processingNote = this.reason.trim();
    });
    this.updateCount();
    this.dialog = null;
    this.toast =
      type === 'approve'
        ? `Đã duyệt ${items.length} hồ sơ mẫu thành công.`
        : type === 'reject'
          ? 'Đã từ chối hồ sơ mẫu và ghi nhận lý do.'
          : type === 'extend'
            ? 'Đã gia hạn hồ sơ mẫu thêm 24 giờ.'
            : 'Đã ghi nhận yêu cầu bổ sung hồ sơ mẫu.';
  }
  updateCount() {
    this.demo.pendingCount.set(this.pending.length);
  }
  export() {
    downloadDemo(
      'ihouzz-giao-dich-demo.csv',
      demoCsv([
        ['Mã hồ sơ', 'Phòng', 'Khách hàng', 'Nhân viên', 'Số tiền', 'Trạng thái'],
        ...this.visible.map((r) => [r.id, r.room, r.customer, r.staff, r.amount, r.state]),
      ]),
    );
    this.toast = 'Đã xuất danh sách đang lọc sang CSV (mở bằng Excel).';
  }
}
