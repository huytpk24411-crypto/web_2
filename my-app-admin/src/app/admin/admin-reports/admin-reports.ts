import { catalogIsActive, roomTypeLabel } from '../../classes/display-labels';
import { Component, computed, inject, signal } from '@angular/core';
import { PayrollAPIService } from '../../services/payroll-apiservice';
import { AdminCatalogAPIService } from '../../services/admin-catalog-apiservice';
import { AuthService } from '../../services/auth-service';
import { ApiPolicy, ApiPolicyLevel } from '../../classes/PayrollApi';
import { OccupancyReport } from '../../services/admin-dashboard-apiservice';
import { csv, downloadFile } from '../admin-finance-export';

interface WorkLocation {
  id: string;
  name: string;
  address: string;
  lat?: number;
  lng?: number;
  geo?: { coordinates: number[] };
  allowedRadiusM: number;
  active?: boolean;
}
@Component({
  selector: 'app-admin-reports',
  standalone: false,
  templateUrl: './admin-reports.html',
  styleUrls: ['../admin-finance-ui.css', './admin-reports.css', './policy-version-form.css'],
})
export class AdminReportsComponent {
  readonly isActive = catalogIsActive;
  readonly payrollApi = inject(PayrollAPIService);
  private catalog = inject(AdminCatalogAPIService);
  private auth = inject(AuthService);
  reportMonth = this.payrollApi.currentMonth();
  policyType: ApiPolicy['type'] = 'HOA_HONG';
  policyName = '';
  policyFrom = '';
  policyTo = '';
  policyLevels: ApiPolicyLevel[] = this.commissionLevels();
  readonly policyError = signal('');
  readonly toast = signal('');
  readonly loading = signal(false);
  readonly error = signal('');
  private generation = 0;
  private operational = signal<{
    owner: string;
    occupancy: OccupancyReport;
    locations: WorkLocation[];
  } | null>(null);
  private readonly current = computed(() =>
    this.auth.serverAuthenticated() &&
    this.auth.account()?.role === 'ADMIN' &&
    this.operational()?.owner === this.auth.account()?.id
      ? this.operational()
      : null,
  );
  readonly occupancy = computed(() => this.current()?.occupancy || null);
  readonly locations = computed(() => this.current()?.locations || []);
  get policyVersions() {
    return this.payrollApi.state().policies;
  }
  get revenueReport() {
    return this.payrollApi.state().reports[this.reportMonth];
  }
  get latePolicies() {
    const now = new Date();
    return this.policyVersions.filter(
      (p) =>
        p.type === 'PHAT_TRE' &&
        p.status === 'ACTIVE' &&
        new Date(p.effectiveFrom) <= now &&
        (!p.effectiveTo || now < new Date(p.effectiveTo)),
    );
  }
  ngOnInit() {
    void this.payrollApi.refresh(this.reportMonth);
    void this.loadOperations();
  }
  ngOnDestroy() {
    this.generation++;
  }
  changeReportMonth() {
    if (this.reportMonth) void this.payrollApi.refresh(this.reportMonth);
  }
  async loadOperations() {
    const version = ++this.generation,
      owner = this.auth.account()?.id || '';
    this.loading.set(true);
    this.error.set('');
    this.operational.set(null);
    try {
      const [occupancy, locations] = await Promise.all([
        this.catalog.read<OccupancyReport>('/data/admin/reports/occupancy'),
        this.catalog.read<WorkLocation[]>('/data/admin/work-locations'),
      ]);
      if (version === this.generation && owner === this.auth.account()?.id)
        this.operational.set({ owner, occupancy, locations });
    } catch (error) {
      if (version === this.generation) this.error.set(this.catalog.message(error));
    } finally {
      if (version === this.generation) this.loading.set(false);
    }
  }
  changePolicyType() {
    this.policyError.set('');
    const source = this.policyVersions.find(
      (p) => p.type === this.policyType && p.status === 'ACTIVE',
    );
    this.policyLevels =
      source?.levels.map((l) => ({ ...l })) ||
      (this.policyType === 'HOA_HONG'
        ? this.commissionLevels()
        : [{ from: 0, to: null, rateBps: null, amount: 0 }]);
  }
  private commissionLevels(): ApiPolicyLevel[] {
    return [
      { from: 0, to: 10000000, rateBps: 2000, amount: null },
      { from: 10000000, to: 15000000, rateBps: 3000, amount: null },
      { from: 15000000, to: 20000000, rateBps: 3500, amount: null },
      { from: 20000000, to: 30000000, rateBps: 4000, amount: null },
      { from: 30000000, to: null, rateBps: 4500, amount: null },
    ];
  }
  copyPolicy(policy: { type: string; name: string; levels: ApiPolicyLevel[] }) {
    this.policyError.set('');
    this.policyType = policy.type as ApiPolicy['type'];
    this.policyName = policy.name;
    this.policyLevels = policy.levels.map((l) => ({ ...l }));
    this.policyFrom = '';
    this.policyTo = '';
  }
  addPolicyLevel() {
    this.policyError.set('');
    if (this.policyType === 'GIU_CHO') {
      this.policyError.set('Chính sách tiền giữ chỗ chỉ có một mức áp dụng.');
      return;
    }
    const error = this.policyLevelsError();
    if (error) {
      this.policyError.set(error);
      return;
    }
    const last = [...this.policyLevels].sort((a, b) => a.from - b.from).at(-1);
    if (last?.to == null) {
      this.policyError.set('Nhập mốc trên cho mức không giới hạn trước khi thêm mức mới.');
      return;
    }
    this.policyLevels.push({
      from: last.to,
      to: null,
      rateBps: this.policyType === 'HOA_HONG' ? 0 : null,
      amount: this.policyType === 'HOA_HONG' ? null : 0,
    });
  }
  policyLevelError(index: number): string {
    const level = this.policyLevels[index];
    const integer = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
    if (!integer(level.from)) return `Mức ${index + 1}: mốc dưới phải là số nguyên không âm.`;
    if (level.to != null && (!integer(level.to) || level.to <= level.from))
      return `Mức ${index + 1}: mốc trên phải lớn hơn mốc dưới; để trống nếu không giới hạn.`;
    if (this.policyType === 'HOA_HONG') {
      if (!integer(level.rateBps) || Number(level.rateBps) > 10000)
        return `Mức ${index + 1}: tỷ lệ phải là số nguyên từ 0 đến 10.000 bps.`;
    } else if (!integer(level.amount))
      return `Mức ${index + 1}: số tiền phải là số nguyên không âm.`;
    return '';
  }
  private policyLevelsError(): string {
    if (!this.policyLevels.length) return 'Thêm ít nhất một mức chính sách.';
    for (let i = 0; i < this.policyLevels.length; i++) {
      const error = this.policyLevelError(i);
      if (error) return error;
    }
    const sorted = this.policyLevels
      .map((level, index) => ({ ...level, index }))
      .sort((a, b) => a.from - b.from);
    for (let i = 1; i < sorted.length; i++) {
      const previous = sorted[i - 1],
        current = sorted[i];
      if (previous.to == null || previous.to > current.from)
        return `Mức ${current.index + 1} chồng khoảng với mức ${previous.index + 1}. Mốc trên không bao gồm trong khoảng; chỉ mức cuối được để trống mốc trên.`;
    }
    if (this.policyType === 'GIU_CHO' && this.policyLevels.length !== 1)
      return 'Chính sách tiền giữ chỗ chỉ có một mức áp dụng.';
    return '';
  }
  async savePolicy() {
    this.policyError.set('');
    if (!this.policyName.trim() || !this.policyFrom) {
      this.policyError.set('Nhập tên và ngày hiệu lực chính sách.');
      return;
    }
    const error = this.policyLevelsError();
    if (error) {
      this.policyError.set(error);
      return;
    }
    const from = new Date(this.policyFrom + '+07:00'),
      to = this.policyTo ? new Date(this.policyTo + '+07:00') : null;
    if (!Number.isFinite(+from) || (to && (!Number.isFinite(+to) || to <= from))) {
      this.policyError.set('Ngày hết hiệu lực phải sau ngày bắt đầu; để trống nếu không giới hạn.');
      return;
    }
    try {
      await this.payrollApi.write('admin/policies', {
        type: this.policyType,
        name: this.policyName,
        effectiveFrom: from.toISOString(),
        effectiveTo: to?.toISOString() || null,
        levels: this.policyLevels.map(({ from, to, rateBps, amount }) => ({
          from,
          to,
          rateBps,
          amount,
        })),
      });
      this.toast.set('Đã tạo phiên bản nháp. Chọn Kích hoạt khi đến ngày hiệu lực.');
    } catch (error) {
      this.policyError.set(error instanceof Error ? error.message : 'Không tạo được phiên bản.');
    }
  }
  async activatePolicy(id: string) {
    this.policyError.set('');
    try {
      await this.payrollApi.write(`admin/policies/${id}/activate`);
      this.toast.set('Đã kích hoạt phiên bản chính sách.');
    } catch (error) {
      this.policyError.set(
        error instanceof Error ? error.message : 'Không kích hoạt được chính sách.',
      );
    }
  }
  exportOccupancy() {
    const report = this.occupancy();
    if (!report) return;
    downloadFile(
      'ihouzz-hien-trang-phong.csv',
      csv([
        ['Hiện trạng tại', report.asOf],
        [
          'Tòa',
          'Loại phòng',
          'Tổng phòng',
          'Trống',
          'Đang giữ',
          'Đã thuê',
          'Bảo trì',
          'Cọc hiện hành',
          'Cọc yêu cầu (VNĐ)',
          'Tiền cọc đã xác nhận (VNĐ)',
          'Hợp đồng hiện hành',
        ],
        ...report.rows.map((r) => [
          r.propertyName,
          roomTypeLabel(r.roomType),
          r.total,
          r.byStatus['AVAILABLE'] || 0,
          r.byStatus['HELD'] || 0,
          r.byStatus['RENTED'] || 0,
          r.byStatus['MAINTENANCE'] || 0,
          r.depositCount,
          r.depositRequired,
          r.depositConfirmed,
          r.contractCount,
        ]),
      ]),
    );
    this.toast.set('Đã xuất báo cáo hiện trạng phòng.');
  }
  exportRevenue() {
    const report = this.revenueReport;
    if (!report || this.payrollApi.error() || this.payrollApi.loading()) return;
    downloadFile(
      `ihouzz-doanh-thu-${report.month}.csv`,
      csv([
        ['Tháng', report.month],
        ['Doanh thu (VNĐ)', report.revenue],
        ['Hoa hồng (VNĐ)', report.commission],
        ['Nhân viên', 'Doanh thu (VNĐ)', 'Hợp đồng hoàn tất'],
        ...report.topEmployees.map((r) => [r.name, r.revenue, r.contractCount]),
      ]),
    );
    this.toast.set('Đã xuất báo cáo doanh thu.');
  }
}
