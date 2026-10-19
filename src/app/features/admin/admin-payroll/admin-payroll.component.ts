import { Component } from '@angular/core';
import { demoCsv, downloadDemo } from '../admin-finance-demo';

interface PayrollRow {
  id: string;
  name: string;
  initials: string;
  role: string;
  area: string;
  salary: number;
  shifts: number;
  sales: number;
  commission: number;
  bonus: number;
  fine: number;
}
@Component({
  selector: 'app-admin-payroll',
  standalone: false,
  templateUrl: './admin-payroll.component.html',
  styleUrls: ['../admin-finance-ui.css', './admin-payroll.component.css'],
})
export class AdminPayrollComponent {
  month = '2026-03';
  status = 'all';
  search = '';
  page = 1;
  toast = '';
  dialog: 'close' | 'create' | 'export' | 'bank' | 'policy' | 'detail' | null = null;
  selected: PayrollRow | null = null;
  approvedByMonth: Record<string, string[]> = {
    '2026-03': ['0020', '0024'],
    '2026-02': ['0020', '0024', '0031'],
    '2026-04': [],
  };
  generatedByMonth: Record<string, boolean> = {
    '2026-03': true,
    '2026-02': true,
    '2026-04': false,
  };
  readonly periods = [
    {
      id: '2026-03',
      label: '03/2026',
      revenue: 386400000,
      salary: 84500000,
      fine: 2150000,
      team1: 218600000,
      team2: 167800000,
      count1: 38,
      count2: 29,
      target1: 250000000,
      target2: 180000000,
      factor: 1,
    },
    {
      id: '2026-02',
      label: '02/2026',
      revenue: 326350000,
      salary: 81000000,
      fine: 1450000,
      team1: 180350000,
      team2: 146000000,
      count1: 31,
      count2: 25,
      target1: 250000000,
      target2: 180000000,
      factor: 326350000 / 386400000,
    },
    {
      id: '2026-04',
      label: '04/2026',
      revenue: 412800000,
      salary: 86000000,
      fine: 1200000,
      team1: 232800000,
      team2: 180000000,
      count1: 41,
      count2: 32,
      target1: 250000000,
      target2: 180000000,
      factor: 412800000 / 386400000,
    },
  ];
  readonly employees: PayrollRow[] = [
    {
      id: '0020',
      name: 'Tăng Khả Ái',
      initials: 'KA',
      role: 'Trưởng nhóm KD',
      area: 'Khu B ĐHQG',
      salary: 9000000,
      shifts: 48,
      sales: 112000000,
      commission: 11200000,
      bonus: 2000000,
      fine: 0,
    },
    {
      id: '0024',
      name: 'Trần Quốc Dũng',
      initials: 'QD',
      role: 'Trưởng nhóm Vận hành',
      area: 'KTX Hoàng Diệu',
      salary: 7500000,
      shifts: 50,
      sales: 85000000,
      commission: 6800000,
      bonus: 1000000,
      fine: 100000,
    },
    {
      id: '0031',
      name: 'Lê Hoàng Nam',
      initials: 'LH',
      role: 'NV Khảo sát & Dẫn khách',
      area: 'Khu B ĐHQG',
      salary: 6500000,
      shifts: 42,
      sales: 64000000,
      commission: 5120000,
      bonus: 500000,
      fine: 50000,
    },
    {
      id: '0015',
      name: 'Ngô Thị Thúy Hằng',
      initials: 'TH',
      role: 'Kế toán & Phê duyệt cọc',
      area: 'Văn phòng Trung tâm',
      salary: 8500000,
      shifts: 44,
      sales: 0,
      commission: 3500000,
      bonus: 1500000,
      fine: 0,
    },
    {
      id: '0042',
      name: 'Vũ Đình Khang',
      initials: 'VK',
      role: 'Kiểm tra phòng & CSKH',
      area: 'Khu B & C2',
      salary: 6000000,
      shifts: 40,
      sales: 29000000,
      commission: 2900000,
      bonus: 0,
      fine: 150000,
    },
    {
      id: '0055',
      name: 'Hoàng Thùy Linh',
      initials: 'HL',
      role: 'Thực tập sinh tư vấn',
      area: 'Khu B & KTX Hoàng Diệu',
      salary: 4500000,
      shifts: 36,
      sales: 17000000,
      commission: 1700000,
      bonus: 0,
      fine: 50000,
    },
    ...[
      'Nguyễn Minh Anh',
      'Phạm Gia Huy',
      'Đỗ Ngọc Hà',
      'Trần Thanh Tâm',
      'Lý Quốc Bảo',
      'Bùi Thảo Vy',
      'Võ Minh Quân',
      'Nguyễn Khánh Linh',
      'Lê Tuấn Anh',
      'Phan Hải Yến',
      'Đặng Bảo Ngọc',
      'Trương Đức An',
    ].map((name, i) => ({
      id: String(60 + i).padStart(4, '0'),
      name,
      initials: name
        .split(' ')
        .slice(-2)
        .map((p) => p[0])
        .join(''),
      role: i % 2 ? 'NV Vận hành & CSKH' : 'NV Tư vấn phòng',
      area: i % 2 ? 'KTX Hoàng Diệu' : 'Khu B ĐHQG',
      salary: i === 11 ? 4500000 : 3000000,
      shifts: i < 8 ? 6 : 5,
      sales: i === 11 ? 13400000 : 6000000,
      commission: i === 11 ? 820000 : 600000,
      bonus: 0,
      fine: 150000,
    })),
  ];
  get period() {
    return this.periods.find((p) => p.id === this.month)!;
  }
  get generated() {
    return !!this.generatedByMonth[this.month];
  }
  get approved() {
    return this.approvedByMonth[this.month] || [];
  }
  get commission() {
    return this.period.revenue * 0.1;
  }
  get payout() {
    return this.period.salary + this.commission - this.period.fine;
  }
  /** Keep the 18 sample payslips and the period summary arithmetically consistent. */
  get periodRows(): PayrollRow[] {
    const rows = this.employees.map((r) => ({
      ...r,
      salary: Math.round((r.salary * this.period.salary) / 84500000),
      bonus: Math.round((r.bonus * this.period.salary) / 84500000),
      fine: Math.round((r.fine * this.period.fine) / 2150000),
      sales: Math.round(r.sales * this.period.factor),
      commission: Math.round(r.commission * this.period.factor),
    }));
    const last = rows[rows.length - 1];
    last.salary += this.period.salary - rows.reduce((s, r) => s + r.salary + r.bonus, 0);
    last.fine += this.period.fine - rows.reduce((s, r) => s + r.fine, 0);
    last.sales += this.period.revenue - rows.reduce((s, r) => s + r.sales, 0);
    last.commission += this.commission - rows.reduce((s, r) => s + r.commission, 0);
    return rows;
  }
  get filtered() {
    if (!this.generated) return [];
    const q = this.normalize(this.search);
    return this.periodRows.filter(
      (r) =>
        this.normalize(r.name + ' NV-2026-' + r.id).includes(q) &&
        (this.status === 'all' ||
          (this.status === 'approved'
            ? this.approved.includes(r.id)
            : !this.approved.includes(r.id))),
    );
  }
  get pages() {
    return Math.max(1, Math.ceil(this.filtered.length / 6));
  }
  get visible() {
    return this.filtered.slice((this.page - 1) * 6, this.page * 6);
  }
  get pageNumbers() {
    return Array.from({ length: this.pages }, (_, i) => i + 1);
  }
  get pendingCount() {
    return this.generated ? this.employees.length - this.approved.length : 0;
  }
  get pageTotal() {
    return this.visible.reduce((sum, r) => sum + this.net(r), 0);
  }
  normalize(v: string) {
    return v
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/đ/g, 'd');
  }
  net(r: PayrollRow) {
    return r.salary + r.commission + r.bonus - r.fine;
  }
  changeMonth() {
    this.page = 1;
    this.status = 'all';
    this.search = '';
    this.toast = 'Đã chuyển kỳ lương mẫu sang tháng ' + this.period.label + '.';
  }
  filter(status: string) {
    this.status = status;
    this.page = 1;
  }
  detail(row: PayrollRow) {
    this.selected = row;
    this.dialog = 'detail';
  }
  approveRow() {
    if (!this.selected || this.approved.includes(this.selected.id)) return;
    this.approvedByMonth[this.month] = [...this.approved, this.selected.id];
    this.toast = 'Đã duyệt phiếu lương mẫu của ' + this.selected.name + '.';
    this.dialog = null;
    this.page = 1;
  }
  confirm() {
    if (this.dialog === 'create') {
      this.generatedByMonth[this.month] = true;
      this.toast = 'Đã tạo bảng lương mẫu tháng ' + this.period.label + ' cho 18 nhân sự.';
    }
    if (this.dialog === 'close') {
      this.approvedByMonth[this.month] = this.employees.map((r) => r.id);
      this.toast = 'Đã chốt và ký duyệt bảng lương mẫu tháng ' + this.period.label + '.';
      this.page = 1;
    }
    if (this.dialog === 'bank') {
      this.toast = 'Đã tạo ủy nhiệm chi mẫu. Không phát sinh chuyển tiền thực tế.';
      this.exportBank();
    }
    this.dialog = null;
  }
  export() {
    downloadDemo(
      'ihouzz-bang-luong-' + this.month + '.csv',
      demoCsv([
        [
          'Kỳ lương',
          'Mã NV',
          'Nhân viên',
          'Lương cứng',
          'Ca trực',
          'Doanh số',
          'Hoa hồng',
          'Thưởng KPI',
          'Khấu trừ',
          'Thực nhận',
          'Trạng thái',
        ],
        ...this.filtered.map((r) => [
          this.period.label,
          'NV-2026-' + r.id,
          r.name,
          r.salary,
          r.shifts,
          r.sales,
          r.commission,
          r.bonus,
          r.fine,
          this.net(r),
          this.approved.includes(r.id) ? 'Đã duyệt' : 'Chờ duyệt',
        ]),
      ]),
    );
    this.dialog = null;
    this.toast = 'Đã xuất bảng lương đang lọc sang CSV (mở bằng Excel).';
  }
  exportBank() {
    downloadDemo(
      'ihouzz-uy-nhiem-chi-' + this.month + '.csv',
      demoCsv([
        ['Ủy nhiệm chi mẫu', this.period.label],
        ['Mã NV', 'Người nhận', 'Số tiền'],
        ...this.periodRows
          .filter((r) => this.approved.includes(r.id))
          .map((r) => ['NV-2026-' + r.id, r.name, this.net(r)]),
      ]),
    );
  }
  print() {
    this.dialog = null;
    setTimeout(() => window.print(), 0);
  }
}
