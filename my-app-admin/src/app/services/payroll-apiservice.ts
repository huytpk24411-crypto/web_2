import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiPayrollPeriod, ApiPayslip, ApiPolicy, ApiRevenueReport } from '../classes/PayrollApi';
import { AuthService } from './auth-service';
import { apiMessage } from './api-message';

@Injectable({ providedIn: 'root' })
export class PayrollAPIService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private owner = signal('');
  private generation = 0;
  private pending = new Map<string, string>();
  private selected = this.currentMonth();
  private options = { withCredentials: true, timeout: 15000 };
  readonly online = computed(() => this.auth.serverAuthenticated());
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  private data = signal(this.empty());
  readonly state = computed(() =>
    this.auth.serverAuthenticated() && this.owner() === this.auth.account()?.id
      ? this.data()
      : this.empty(),
  );
  constructor() {
    effect(() => {
      const actor = this.auth.account(),
        server = this.auth.serverAuthenticated();
      untracked(() => {
        this.generation++;
        this.data.set(this.empty());
        this.owner.set('');
        this.error.set('');
        this.loading.set(false);
        this.saving.set(false);
        this.pending.clear();
        if (actor && server && ['ADMIN', 'EMPLOYEE'].includes(actor.role)) void this.refresh();
      });
    });
  }
  currentMonth() {
    const date = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
  private empty() {
    return {
      periods: [] as ApiPayrollPeriod[],
      slips: {} as Record<string, ApiPayslip[]>,
      policies: [] as ApiPolicy[],
      reports: {} as Record<string, ApiRevenueReport>,
    };
  }
  private get<T>(path: string) {
    return firstValueFrom(this.http.get<T>('/data/' + path, this.options));
  }
  message(error: unknown) {
    const code = error instanceof HttpErrorResponse ? error.error?.code : '';
    if (error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500))
      return apiMessage(error, 'Không thực hiện được yêu cầu.');
    const labels: Record<string, string> = {
      PAYROLL_CLOSED: 'Kỳ lương đã khóa, không thể tính hoặc điều chỉnh lại.',
      CLOSE_PERIOD_FIRST: 'Hãy chốt kỳ trước khi duyệt hoặc trả phiếu.',
      CALCULATE_FIRST: 'Hãy tính lương trước khi chốt kỳ.',
      POLICY_NOT_CONFIGURED: 'Chưa có chính sách hoa hồng hợp lệ cho kỳ này.',
      PERIOD_EXISTS: 'Tháng này đã có kỳ lương.',
      DUPLICATE_RECORD: 'Bản ghi đã tồn tại. Hãy tải lại dữ liệu.',
      INVALID_PAYSLIP_TRANSITION: 'Trạng thái phiếu không cho phép thao tác này.',
      BR18_LEVELS_REQUIRED: 'Các bậc hoa hồng phải đúng BR-18: 20%, 30%, 35%, 40%, 45%.',
      POLICY_LEVEL_OVERLAP: 'Các khoảng mức chính sách không được chồng nhau.',
      INVALID_POLICY_RANGE: 'Mốc trên phải lớn hơn mốc dưới. Để trống mốc trên nếu không giới hạn.',
      INVALID_POLICY: 'Kiểm tra loại, tên, ngày hiệu lực và các mức chính sách.',
      INVALID_RATE: 'Tỷ lệ phải là số nguyên từ 0 đến 10.000 bps (100 bps = 1%).',
      POLICY_NOT_EFFECTIVE: 'Chỉ kích hoạt khi đã đến ngày hiệu lực và chưa hết hạn.',
      POLICY_EFFECTIVE_OVERLAP: 'Ngày hiệu lực phải sau phiên bản đang dùng.',
      INVALID_AMOUNT: 'Số tiền và mốc phải là số nguyên không âm.',
      HOLD_POLICY_SINGLE_LEVEL_REQUIRED: 'Chính sách giữ chỗ chỉ hỗ trợ một mức áp dụng.',
      PAYSLIP_NOT_FOUND: 'Kỳ này chưa có phiếu lương được tính.',
    };
    return (
      labels[code] ||
      (error instanceof HttpErrorResponse && error.status === 401
        ? 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.'
        : error instanceof HttpErrorResponse && error.status === 403
          ? 'Bạn không có quyền thực hiện thao tác này.'
          : code
            ? `Không thể thực hiện (${code}). Vui lòng kiểm tra và thử lại.`
            : error instanceof Error && !(error instanceof HttpErrorResponse)
              ? error.message
              : 'Chưa xác định kết quả từ máy chủ. Hãy thử lại cùng thao tác.')
    );
  }
  async refresh(code = this.selected) {
    this.selected = code;
    if (!this.auth.serverAuthenticated()) return;
    const actor = this.auth.account(),
      generation = ++this.generation;
    if (!actor) return;
    this.loading.set(true);
    try {
      const admin = actor.role === 'ADMIN';
      const periods = await this.get<ApiPayrollPeriod[]>(
        admin ? 'admin/payroll-periods' : 'me/payroll-periods',
      );
      if (!admin && !periods.some((p) => p.code === code) && periods.length) {
        code = periods.at(-1)!.code;
        this.selected = code;
      }
      const period = periods.find((p) => p.code === code);
      const [slips, policies, report] = await Promise.all([
        period
          ? admin
            ? this.get<ApiPayslip[]>(`admin/payroll-periods/${period.id}/payslips`)
            : this.get<ApiPayslip>(`me/payslips?period=${encodeURIComponent(code)}`).then((s) => [
                s,
              ])
          : Promise.resolve([] as ApiPayslip[]),
        admin ? this.get<ApiPolicy[]>('admin/policies') : Promise.resolve([] as ApiPolicy[]),
        admin
          ? this.get<ApiRevenueReport>(`admin/reports/revenue?month=${encodeURIComponent(code)}`)
          : Promise.resolve(null),
      ]);
      if (generation !== this.generation || actor.id !== this.auth.account()?.id) return;
      this.owner.set(actor.id);
      this.data.update((s) => ({
        ...s,
        periods,
        policies,
        slips: { ...s.slips, [code]: slips },
        reports: report ? { ...s.reports, [code]: report } : s.reports,
      }));

      this.error.set('');
    } catch (error) {
      if (generation !== this.generation) return;
      this.data.set(this.empty());
      this.error.set(this.message(error));
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }
  async write<T>(path: string, body: unknown = {}): Promise<T> {
    if (!this.online()) throw new Error('Cần phiên đăng nhập máy chủ.');
    if (this.saving()) throw new Error('Đang lưu, vui lòng chờ.');
    const actor = this.auth.account()?.id,
      signature = `${actor}:${path}:${JSON.stringify(body)}`;
    let key = this.pending.get(signature);
    if (!key) {
      key = crypto.randomUUID();
      this.pending.set(signature, key);
    }
    this.saving.set(true);
    try {
      const result = await firstValueFrom(
        this.http.post<T>('/data/' + path, body, {
          ...this.options,
          headers: { 'Idempotency-Key': key },
        }),
      );
      this.pending.delete(signature);
      if (actor === this.auth.account()?.id) await this.refresh();
      return result;
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status >= 400 && error.status < 500)
        this.pending.delete(signature);
      const message = this.message(error);
      if (actor === this.auth.account()?.id) this.error.set(message);
      throw new Error(message);
    } finally {
      if (actor === this.auth.account()?.id) this.saving.set(false);
    }
  }
  periodView(code: string) {
    const period = this.state().periods.find((p) => p.code === code);
    const report = this.state().reports[code];
    const ranked = report?.payrollTopEmployees ?? report?.topEmployees ?? [];
    const payrollRevenue = report?.payrollRevenue ?? report?.revenue ?? 0;
    return {
      id: code,
      periodId: period?.id || '',
      label: code.slice(5) + '/' + code.slice(0, 4),
      status: period?.status || 'OPEN',
      closedAt: period?.closedAt || null,
      paidAt: period?.paidAt || null,
      revenue: payrollRevenue,
      companyRevenue: report?.revenue || 0,
      carriedRevenue: report?.carriedPayrollRevenue || 0,
      commission: report?.commission || 0,
      salary: (report?.baseSalary || 0) + (report?.bonus || 0),
      fine: report?.deductions || 0,
      payout: report?.netPay || 0,
      growth: null,
      shiftCount: report?.shiftCount || 0,
      lateCount: report?.lateCount || 0,
      leader1: ranked[0]?.name || '—',
      leader2: ranked[1]?.name || '—',
      team1: ranked[0]?.revenue || 0,
      team2: ranked[1]?.revenue || 0,
      count1: ranked[0]?.contractCount || 0,
      count2: ranked[1]?.contractCount || 0,
      target1: payrollRevenue || 1,
      target2: payrollRevenue || 1,
    };
  }
}
