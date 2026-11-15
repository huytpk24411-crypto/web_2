import { Component, inject, signal } from '@angular/core';
import { PayrollAPIService } from '../../services/payroll-apiservice';
import { ApiPayrollPeriod, ApiPolicyLevel } from '../../classes/PayrollApi';
import { csv, downloadFile } from '../admin-finance-export';

interface PayrollRow {
  id: string;
  name: string;
  code: string;
  initials: string;
  role: string;
  area: string;
  salary: number;
  shifts: number;
  sales: number;
  commission: number;
  bonus: number;
  fine: number;
  slipId?: string;
  slipStatus?: string;
  netPay?: number;
}
@Component({
  selector: 'app-admin-payroll',
  standalone: false,
  templateUrl: './admin-payroll.html',
  styleUrls: ['../admin-finance-ui.css', './admin-payroll.css'],
})
export class AdminPayrollComponent {
  api = inject(PayrollAPIService);
  readonly busy = signal(false);
  readonly actionError = signal('');
  newMonth = '';
  adjustmentAmount = 0;
  adjustmentKind = 'BONUS';
  adjustmentReason = '';
  ngOnInit() {
    void this.api.refresh(this.month);
  }
  month = this.api.currentMonth();
  status = 'all';
  search = '';
  page = 1;
  readonly toast = signal('');
  dialog: 'close' | 'create' | 'export' | 'payout' | 'policy' | 'detail' | null = null;
  selected: PayrollRow | null = null;
  get periods() {
    return this.api.state().periods.map((p) => ({
      id: p.code,
      label: p.code.slice(5) + '/' + p.code.slice(0, 4),
      periodId: p.id,
    }));
  }
  get policies(): { id: string; name: string; version: number; levels: ApiPolicyLevel[] }[] {
    return ['HOA_HONG', 'PHAT_TRE'].map(
      (type) =>
        this.api.state().policies.find((p) => p.type === type && p.status === 'ACTIVE') || {
          id: '',
          name: 'Chưa cấu hình',
          version: 0,
          levels: [],
        },
    );
  }
  get employees(): PayrollRow[] {
    return this.periodRows;
  }
  get period() {
    return this.api.periodView(this.month);
  }
  get generated() {
    return !!this.api.state().slips[this.month]?.length;
  }
  get approved() {
    return this.periodRows
      .filter((r) => r.slipStatus === 'APPROVED' || r.slipStatus === 'PAID')
      .map((r) => r.id);
  }
  get commission() {
    return this.period.commission;
  }
  get payout() {
    return this.period.payout;
  }
  get periodRows(): PayrollRow[] {
    return (this.api.state().slips[this.month] || []).map((s) => ({
      id: s.employeeId,
      slipId: s.id,
      slipStatus: s.status,
      netPay: s.netPay,
      name: s.employee.fullName,
      code: s.employee.employeeCode,
      initials: s.employee.fullName
        .split(' ')
        .slice(-2)
        .map((v) => v[0])
        .join(''),
      role: s.employee.position,
      area: '',
      salary: s.baseSalary,
      shifts: s.shiftCount || 0,
      sales: s.totalRevenue,
      commission: s.commissionAmount,
      bonus: s.totalBonus,
      fine: s.totalDeductions,
    }));
  }
  get filtered() {
    if (!this.generated) return [];
    const q = this.normalize(this.search);
    return this.periodRows.filter(
      (r) =>
        this.normalize(r.name + ' ' + r.code).includes(q) &&
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
    return r.netPay ?? Math.max(0, r.salary + r.commission + r.bonus - r.fine);
  }
  changeMonth() {
    this.page = 1;
    this.status = 'all';
    this.search = '';
    this.selected = null;
    this.actionError.set('');
    void this.api.refresh(this.month);
  }
  filter(status: string) {
    this.status = status;
    this.page = 1;
  }
  detail(row: PayrollRow) {
    this.selected = row;
    this.actionError.set('');
    this.adjustmentAmount = 0;
    this.adjustmentReason = '';
    this.dialog = 'detail';
  }
  get selectedSlip() {
    return this.api.state().slips[this.month]?.find((s) => s.id === this.selected?.slipId);
  }
  async approveRow() {
    if (
      !this.selected?.slipId ||
      this.approved.includes(this.selected.id) ||
      this.period.status !== 'CLOSED'
    )
      return;
    await this.action(
      `admin/payslips/${this.selected.slipId}/approve`,
      {},
      'Đã duyệt phiếu lương.',
    );
  }
  async confirm() {
    if (this.dialog === 'create' || this.dialog === 'close') {
      if (!this.period.periodId) return;
      await this.action(
        `admin/payroll-periods/${this.period.periodId}/${this.dialog === 'close' ? 'close' : 'calculate'}`,
        {},
        this.dialog === 'close' ? 'Đã chốt kỳ lương.' : 'Đã tính lương.',
      );
    } else if (this.dialog === 'payout') {
      this.exportPayout();
      this.dialog = null;
    }
  }
  async action(path: string, body: unknown, success: string) {
    if (this.busy()) return;
    this.busy.set(true);
    this.actionError.set('');
    try {
      await this.api.write(path, body);
      this.toast.set(success);
      this.dialog = null;
      this.selected = null;
    } catch (error) {
      this.actionError.set(error instanceof Error ? error.message : 'Không lưu được dữ liệu.');
    } finally {
      this.busy.set(false);
    }
  }
  async createPeriod() {
    if (!this.newMonth) {
      this.actionError.set('Hãy chọn tháng tạo kỳ.');
      return;
    }
    if (this.busy()) return;
    this.busy.set(true);
    this.actionError.set('');
    try {
      const period = await this.api.write<ApiPayrollPeriod>('admin/payroll-periods', {
        code: this.newMonth,
      });
      this.month = period.code;
      await this.api.refresh(this.month);
      this.newMonth = '';
      this.toast.set('Đã tạo kỳ lương tháng ' + period.code + '.');
    } catch (error) {
      this.actionError.set(error instanceof Error ? error.message : 'Không tạo được kỳ.');
    } finally {
      this.busy.set(false);
    }
  }
  async adjust() {
    if (!this.selected?.slipId) return;
    if (
      !Number.isSafeInteger(this.adjustmentAmount) ||
      this.adjustmentAmount < 0 ||
      this.adjustmentReason.trim().length < 3
    ) {
      this.actionError.set('Nhập số tiền nguyên không âm và lý do ít nhất 3 ký tự.');
      return;
    }
    await this.action(
      `admin/payslips/${this.selected.slipId}/adjustments`,
      {
        kind: this.adjustmentKind,
        amount: this.adjustmentAmount,
        reason: this.adjustmentReason,
      },
      'Đã lưu điều chỉnh. Hãy tính lại trước khi chốt.',
    );
  }
  async payRow() {
    if (this.selected?.slipId)
      await this.action(
        `admin/payslips/${this.selected.slipId}/pay`,
        {},
        'Đã đánh dấu thanh toán và thông báo nhân viên.',
      );
  }
  export() {
    downloadFile(
      'ihouzz-bang-luong-' + this.month + '.csv',
      csv([
        [
          'Kỳ lương',
          'Mã NV',
          'Nhân viên',
          'Lương cứng',
          'Ca trực',
          'Doanh số',
          'Hoa hồng',
          'Thưởng',
          'Khấu trừ',
          'Thực nhận',
          'Trạng thái',
        ],
        ...this.filtered.map((r) => [
          this.period.label,
          r.code,
          r.name,
          r.salary,
          r.shifts,
          r.sales,
          r.commission,
          r.bonus,
          r.fine,
          this.net(r),
          r.slipStatus === 'PAID'
            ? 'Đã trả'
            : this.approved.includes(r.id)
              ? 'Đã duyệt'
              : 'Chờ duyệt',
        ]),
      ]),
    );
    this.dialog = null;
    this.toast.set('Đã xuất bảng lương đang lọc sang CSV (mở bằng Excel).');
  }
  exportPayout() {
    downloadFile(
      'ihouzz-chi-tra-' + this.month + '.csv',
      csv([
        ['Danh sách chi trả', this.period.label],
        ['Mã NV', 'Người nhận', 'Số tiền'],
        ...this.periodRows
          .filter((r) => this.approved.includes(r.id))
          .map((r) => [r.code, r.name, this.net(r)]),
      ]),
    );
  }
  print() {
    this.dialog = null;
    setTimeout(() => window.print(), 0);
  }
}
