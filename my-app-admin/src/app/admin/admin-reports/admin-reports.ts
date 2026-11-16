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
  styleUrls: ['../admin-finance-ui.css', './admin-reports.css'],
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
  policyLevels: ApiPolicyLevel[] = [{ from: 0, to: null, rateBps: 0, amount: null }];
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
    const source = this.policyVersions.find(
      (p) => p.type === this.policyType && p.status === 'ACTIVE',
    );
    this.policyLevels = source?.levels.map((l) => ({ ...l })) || [
      { from: 0, to: null, rateBps: null, amount: 0 },
    ];
  }
  copyPolicy(policy: { type: string; name: string; levels: ApiPolicyLevel[] }) {
    this.policyType = policy.type as ApiPolicy['type'];
    this.policyName = policy.name;
    this.policyLevels = policy.levels.map((l) => ({ ...l }));
    this.policyFrom = '';
    this.policyTo = '';
  }
  addPolicyLevel() {
    this.policyLevels.push({
      from: 0,
      to: null,
      rateBps: this.policyType === 'HOA_HONG' ? 0 : null,
      amount: this.policyType === 'HOA_HONG' ? null : 0,
    });
  }
  async savePolicy() {
    this.policyError.set('');
    if (!this.policyName.trim() || !this.policyFrom) {
      this.policyError.set('Nhập tên và ngày hiệu lực chính sách.');
      return;
    }
    try {
      await this.payrollApi.write('admin/policies', {
        type: this.policyType,
        name: this.policyName,
        effectiveFrom: new Date(this.policyFrom + '+07:00').toISOString(),
        effectiveTo: this.policyTo ? new Date(this.policyTo + '+07:00').toISOString() : null,
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
