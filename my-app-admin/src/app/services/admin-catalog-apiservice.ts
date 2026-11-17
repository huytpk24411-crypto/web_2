import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth-service';
import { apiMessage } from './api-message';
import { AuditPage } from '../classes/AdminCatalog';

@Injectable({ providedIn: 'root' })
export class AdminCatalogAPIService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  readonly online = computed(() => this.authenticated);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  private pending = new Map<string, { key: string; body: unknown }>();
  private generation = 0;
  private session = `${this.auth.account()?.id}:${this.auth.serverAuthenticated()}`;
  private options = { withCredentials: true, timeout: 60000 };
  constructor() {
    effect(() => {
      const session = `${this.auth.account()?.id}:${this.auth.serverAuthenticated()}`;
      if (session === this.session) return;
      this.session = session;
      this.generation++;
      this.error.set('');
      this.pending.clear();
      this.saving.set(false);
    });
  }
  get authenticated() {
    return this.auth.serverAuthenticated() && this.auth.account()?.role === 'ADMIN';
  }
  message(error: unknown): string {
    const response = error instanceof HttpErrorResponse ? error : null;
    if (response && (response.status === 0 || response.status >= 500))
      return apiMessage(error, 'Không thể thực hiện thao tác.');
    if (response && [401, 403, 404].includes(response.status))
      return apiMessage(error, 'Không thể thực hiện thao tác.');
    const code = response?.error?.code;
    const labels: Record<string, string> = {
      PHONE_EXISTS: 'Số điện thoại đã có tài khoản. Hãy dùng số khác.',
      EMAIL_EXISTS: 'Email đã được sử dụng.',
      DUPLICATE_RECORD: 'Mã hoặc thông tin duy nhất đã tồn tại.',
      DUPLICATE_ROOM: 'Mã phòng hoặc số căn trong tòa nhà đã tồn tại.',
      AGREEMENT_OVERLAP: 'Thời gian thỏa thuận chồng với bản đã có. Hãy kết thúc bản cũ trước.',
      ROOM_HAS_HISTORY_OR_ACTIVE_LOCK: 'Phòng có lịch sử, hợp đồng hoặc cọc. Hãy ẩn phòng.',
      ROOM_HAS_HISTORY: 'Phòng có lịch sử nghiệp vụ liên quan. Hãy ẩn tin thay vì xóa.',
      ROOM_HAS_ACTIVE_FLOW:
        'Phòng còn giữ chỗ, cọc hoặc hợp đồng đang xử lý. Hãy kết thúc hồ sơ trước khi xóa.',
      ROOM_NOT_AVAILABLE: 'Chỉ phòng đang trống mới được đăng tin.',
      USE_MONEY_WORKFLOW: 'Phòng đang bị khóa bởi nghiệp vụ giữ chỗ, cọc hoặc hợp đồng.',
      ROOM_OWNER_HAS_AGREEMENT: 'Hãy kết thúc thỏa thuận hiệu lực trước khi đổi chủ phòng.',
      USE_DEACTIVATE: 'Hãy dùng thao tác Ngừng hoạt động để khóa tài khoản nhân viên.',
      CONCURRENT_CHANGE: 'Dữ liệu vừa thay đổi. Tải lại trang trước khi lưu.',
      CATALOG_RECOVERY_REQUIRED: 'Máy chủ đang khôi phục thao tác. Hãy thử lại cùng nội dung.',
      INVALID_IMAGE_URL: 'Ảnh phải được tải lên máy chủ trước khi lưu.',
      INVALID_ROOM_IMAGES: 'Phòng đã đăng cần ít nhất một ảnh; tối đa 15 ảnh không trùng.',
      BROKERAGE_FEE_FIXED_BY_DATA_PLAN: 'Phí môi giới là 50% một tháng thuê.',
      INVALID_COORDINATES: 'Nhập vĩ độ từ -90 đến 90, kinh độ từ -180 đến 180.',
      INVALID_PHONE: 'Số điện thoại cần có 10 chữ số, bắt đầu bằng 0 hoặc dùng đầu +84.',
      INVALID_FULLNAME: 'Họ tên cần từ 2 đến 120 ký tự.',
      INVALID_EMAIL: 'Nhập địa chỉ email hợp lệ.',
      INVALID_CONTRACT_TYPE: 'Chọn loại hợp đồng: Toàn thời gian, Bán thời gian hoặc Thực tập.',
      INVALID_BASE_SALARY: 'Lương cơ bản cần là số nguyên không âm hoặc để trống.',
      INVALID_EMPLOYEE_DATES:
        'Kiểm tra ngày sinh và ngày vào làm; ngày vào làm không vượt quá hôm nay.',
      INVALID_AGREEMENT_DATES: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu thỏa thuận.',
      INVALID_DATE_RANGE: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.',
      AGREEMENT_OWNER_MISMATCH: 'Chủ thỏa thuận phải khớp chủ phòng.',
      AGREEMENT_ALREADY_USED: 'Thỏa thuận đã có giao dịch; không thể đổi phòng, chủ hoặc phí.',
    };
    if (code === 'REFERENCED_RECORD') {
      const resources: Record<string, string> = {
        owners: 'Owner',
        properties: 'Property',
        schools: 'School',
        employees: 'Employee',
        'work-locations': 'WorkLocation',
        'brokerage-agreements': 'BrokerageAgreement',
        rooms: 'Room',
      };
      const resource =
        response?.error?.resource ||
        resources[response?.url?.match(/\/(?:admin\/)?([^/]+)\/[^/?]+(?:\?|$)/)?.[1] || ''];
      const references: Record<string, string> = {
        Owner:
          'Chủ phòng đang được sử dụng bởi phòng hoặc hồ sơ môi giới; hãy ngưng hoạt động thay vì xóa.',
        Property:
          'Tòa nhà đang có phòng hoặc liên kết trường học; hãy ngưng hoạt động thay vì xóa.',
        School: 'Trường học đang được liên kết với tòa nhà; hãy ngưng hoạt động thay vì xóa.',
        Employee:
          'Nhân viên đã có ca làm, lương hoặc hồ sơ liên quan; hãy ngừng hoạt động thay vì xóa.',
        WorkLocation: 'Địa điểm đang được dùng trong lịch ca; hãy ngưng hoạt động thay vì xóa.',
        BrokerageAgreement:
          'Thỏa thuận đã có hợp đồng hoặc giao dịch; hãy kết thúc hiệu lực thay vì xóa.',
        Room: labels['ROOM_HAS_ACTIVE_FLOW'],
      };
      return (
        references[resource] ||
        'Bản ghi đang được sử dụng; hãy ngưng hoạt động hoặc ẩn thay vì xóa.'
      );
    }
    if (response?.status === 401) return 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.';
    if (response?.status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
    if (typeof code === 'string' && code.startsWith('INVALID_') && !labels[code])
      return 'Vui lòng kiểm tra các trường bắt buộc và định dạng dữ liệu.';
    if (typeof code === 'string' && code.endsWith('_REFERENCE_UNAVAILABLE'))
      return 'Bản ghi được chọn không tồn tại hoặc đã ngưng hoạt động. Hãy chọn bản ghi khác.';
    return (
      labels[code] ||
      (error instanceof Error && !response
        ? error.message
        : apiMessage(error, 'Không thể thực hiện thao tác. Vui lòng kiểm tra dữ liệu và thử lại.'))
    );
  }
  async read<T>(path: string): Promise<T> {
    if (!this.authenticated) throw new Error('Cần phiên đăng nhập quản trị viên.');
    const generation = this.generation;
    this.loading.set(true);
    try {
      const result = await firstValueFrom(this.http.get<T>(path, this.options));
      if (generation !== this.generation) throw new Error('Phiên đăng nhập đã thay đổi.');
      this.error.set('');
      return result;
    } catch (error) {
      if (generation === this.generation) this.error.set(this.message(error));
      throw new Error(this.message(error));
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }
  list<T>(resource: string) {
    return this.read<T[]>(`/data/admin/${resource}`);
  }
  detail<T>(resource: string, id: string) {
    return this.read<T>(`/data/admin/${resource}/${encodeURIComponent(id)}`);
  }
  async write<T>(method: 'POST' | 'PUT' | 'DELETE', path: string, body: unknown = {}): Promise<T> {
    if (!this.authenticated) throw new Error('Cần phiên đăng nhập quản trị viên.');
    if (this.saving()) throw new Error('Đang lưu, vui lòng chờ.');
    const generation = this.generation;
    const signature = JSON.stringify({ method, path, body });
    let request = this.pending.get(signature);
    if (!request) {
      const credentials =
        method === 'POST' && (path === '/data/admin/employees' || path.endsWith('/reset-password'));
      request = {
        key: crypto.randomUUID(),
        body: credentials ? { ...(body as object), temporaryPassword: crypto.randomUUID() } : body,
      };
      this.pending.set(signature, request);
    }
    this.saving.set(true);
    try {
      const result = await firstValueFrom(
        this.http.request<T>(method, path, {
          ...this.options,
          body: request.body,
          headers: { 'Idempotency-Key': request.key },
        }),
      );
      if (generation !== this.generation) throw new Error('Phiên đăng nhập đã thay đổi.');
      this.pending.delete(signature);
      this.error.set('');
      return result;
    } catch (error) {
      if (generation === this.generation) {
        if (error instanceof HttpErrorResponse && error.status >= 400 && error.status < 500)
          this.pending.delete(signature);
        this.error.set(this.message(error));
      }
      throw Object.assign(new Error(this.message(error)), {
        status: error instanceof HttpErrorResponse ? error.status : undefined,
        code: error instanceof HttpErrorResponse ? error.error?.code : undefined,
      });
    } finally {
      if (generation === this.generation) this.saving.set(false);
    }
  }
  save<T>(resource: string, body: unknown, id?: string) {
    return this.write<T>(
      id ? 'PUT' : 'POST',
      `/data/admin/${resource}${id ? '/' + encodeURIComponent(id) : ''}`,
      body,
    );
  }
  deactivate<T>(resource: string, id: string, body = {}) {
    return this.write<T>(
      'POST',
      `/data/admin/${resource}/${encodeURIComponent(id)}/deactivate`,
      body,
    );
  }
  remove(resource: string, id: string) {
    return this.write('DELETE', `/data/admin/${resource}/${encodeURIComponent(id)}`);
  }
  audit(filters: Record<string, string | number>) {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters))
      if (value !== '') params = params.set(key, value);
    return this.read<AuditPage>('/audit-logs?' + params.toString());
  }
}
