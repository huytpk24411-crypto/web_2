import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom, map } from 'rxjs';
import {
  MoneyContract,
  MoneyDeposit,
  MoneyHold,
  MoneyPayment,
  MoneyReceipt,
  MoneyTransaction,
} from '../classes/Money';
import { AuthService } from './auth-service';
import { apiMessage } from './api-message';

@Injectable({ providedIn: 'root' })
export class MoneyService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private owner = '';
  private pending = new Map<string, string>();
  private refreshVersion = 0;
  private data = signal<{
    holds: MoneyHold[];
    deposits: MoneyDeposit[];
    payments: MoneyPayment[];
    contracts: MoneyContract[];
    transactions: MoneyTransaction[];
  }>({ holds: [], deposits: [], payments: [], contracts: [], transactions: [] });
  readonly loading = signal(false);
  readonly error = signal('');
  readonly online = this.auth.serverAuthenticated;
  private options = { responseType: 'text' as const, withCredentials: true, timeout: 10000 };
  constructor() {
    effect(() => {
      const actor = this.auth.account()?.id,
        authenticated = this.auth.serverAuthenticated();
      untracked(() => {
        if (!authenticated || (this.owner && actor !== this.owner)) {
          this.owner = '';
          this.refreshVersion++;
          this.data.set({ holds: [], deposits: [], payments: [], contracts: [], transactions: [] });
          this.loading.set(false);
          this.error.set('');
        }
      });
    });
  }
  private current() {
    // Read the data signal unconditionally so computed() consumers always track it
    // (owner is a plain field; a short-circuit here would freeze computed values).
    const data = this.data();
    return this.auth.serverAuthenticated() && this.owner === this.auth.account()?.id
      ? data
      : { holds: [], deposits: [], payments: [], contracts: [], transactions: [] };
  }
  holds() {
    return this.current().holds;
  }
  deposits() {
    return this.current().deposits;
  }
  payments() {
    return this.current().payments;
  }
  contracts() {
    return this.current().contracts;
  }
  transactions() {
    return this.current().transactions;
  }
  receipt(paymentId?: string) {
    return this.payments().find((p) => p.id === paymentId)?.receipt;
  }
  label(status: string) {
    const labels: Record<string, string> = {
      PAYMENT_PENDING: 'Chờ thanh toán',
      ACTIVE: 'Đang giữ chỗ',
      CONVERTED: 'Đã chuyển thành cọc',
      FORFEITED: 'Khách bỏ giữ chỗ',
      PENDING: 'Chờ đối soát',
      CONFIRMED: 'Đã xác nhận',
      REJECTED: 'Đã từ chối',
      FAILED: 'Không thành công',
      PAID: 'Đã thu cọc',
      CONTRACTED: 'Đã ký hợp đồng',
      ABANDONED: 'Khách bỏ cọc',
      DRAFT: 'Nháp',
      SIGNED: 'Đã ký – chờ admin xác nhận',
      COMPLETED: 'Thành công',
      VOID: 'Không hiệu lực – khách bỏ cọc',
      CANCELLED: 'Đã hủy',
      EXPIRED: 'Đã hết hạn',
    };
    return labels[status] || status;
  }
  private async get<T>(path: string): Promise<T> {
    return firstValueFrom(
      this.http.get('/data/' + path, this.options).pipe(map((text) => JSON.parse(text) as T)),
    );
  }
  private message(error: unknown): string {
    if (error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500))
      return apiMessage(error, 'Không thực hiện được yêu cầu.');
    const code =
      error instanceof HttpErrorResponse
        ? (() => {
            try {
              return (typeof error.error === 'string' ? JSON.parse(error.error) : error.error)
                ?.code;
            } catch {
              return '';
            }
          })()
        : '';
    const messages: Record<string, string> = {
      ROOM_LOCKED: 'Phòng vừa được giữ bởi giao dịch khác. Vui lòng chọn phòng khác.',
      POLICY_NOT_CONFIGURED: 'Chưa có mức tiền giữ chỗ hiệu lực. Vui lòng liên hệ nhân viên.',
      HOLD_PAYMENT_NOT_CONFIRMED: 'Nhân viên cần xác nhận tiền giữ chỗ trước khi trừ vào cọc.',
      HOLD_NOT_CREDITABLE: 'Giữ chỗ đã hết hạn, đã sử dụng hoặc không đúng khách/phòng.',
      PAYMENT_ALREADY_DECIDED: 'Khoản tiền đã được nhân viên khác xử lý. Vui lòng tải lại.',
      PAYROLL_CLOSED_OR_MISSING: 'Kỳ doanh thu đã khóa hoặc chưa được mở.',
      PAYROLL_CLOSED: 'Kỳ lương tháng này đã đóng, không ghi được doanh thu.',
      CUSTOMER_ACCOUNT_REQUIRED: 'Số điện thoại phải thuộc tài khoản khách hàng đang hoạt động.',
      AGREEMENT_NOT_CONFIGURED: 'Phòng chưa có thỏa thuận phí môi giới 50% hiệu lực.',
      PAYMENT_REQUIRES_RECONCILIATION:
        'Cần đối soát hoặc từ chối khoản tiền đang chờ trước khi hủy cọc.',
      CUSTOMER_IDENTITY_REQUIRED: 'Khách hàng cần đủ CCCD trước khi lập cọc.',
      DUPLICATE_IDENTITY: 'Số CCCD đã thuộc khách hàng khác.',
      INVALID_IDENTITY: 'Kiểm tra số CCCD 12 chữ số, ngày cấp, nơi cấp, địa chỉ và hai ảnh.',
      BANK_REFERENCE_REQUIRED: 'Nhập mã giao dịch ngân hàng.',
      IDEMPOTENCY_CONFLICT: 'Mã yêu cầu đã được dùng với nội dung khác.',
    };
    if (code && messages[code]) return messages[code];
    if (error instanceof HttpErrorResponse && error.status === 401)
      return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    if (error instanceof HttpErrorResponse && error.status === 403)
      return 'Bạn không có quyền xử lý hồ sơ này.';
    if (error instanceof HttpErrorResponse && error.status >= 400 && error.status < 500)
      return apiMessage(
        error,
        `Yêu cầu không hợp lệ (${code || error.status}). Vui lòng tải lại hồ sơ.`,
      );
    return 'Chưa xác định kết quả từ máy chủ. Vui lòng thử lại cùng thao tác để đối soát; không tạo yêu cầu mới.';
  }
  async write<T>(path: string, body: unknown, method: 'POST' | 'PUT' = 'POST'): Promise<T> {
    const actor = this.auth.account()?.id;
    if (!this.online() || !actor) throw new Error('Cần phiên đăng nhập máy chủ.');
    const storageKey = actor + ':' + method + ':' + path + ':' + JSON.stringify(body);
    let key = this.pending.get(storageKey);
    if (!key) {
      key = crypto.randomUUID();
      this.pending.set(storageKey, key);
    }
    try {
      const result = await firstValueFrom(
        this.http
          .request(method, '/data/' + path, {
            ...this.options,
            body,
            headers: { 'Idempotency-Key': key },
          })
          .pipe(map((text) => JSON.parse(text) as T)),
      );
      if (actor !== this.auth.account()?.id || !this.online())
        throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng tải lại hồ sơ.');
      return result;
    } catch (error) {
      throw new Error(
        error instanceof HttpErrorResponse
          ? this.message(error)
          : apiMessage(error, this.message(error)),
      );
    }
  }
  finishDraft(path: string, body: unknown, method: 'POST' | 'PUT' = 'POST') {
    this.pending.delete(
      this.auth.account()?.id + ':' + method + ':' + path + ':' + JSON.stringify(body),
    );
  }

  async refresh() {
    if (!this.online()) return;
    const version = ++this.refreshVersion;
    const actor = this.auth.account()?.id || '',
      role = this.auth.account()?.role;
    this.loading.set(true);
    this.error.set('');
    try {
      let holds: MoneyHold[] = [],
        payments: MoneyPayment[] = [],
        deposits: MoneyDeposit[] = [],
        contracts: MoneyContract[] = [],
        transactions: MoneyTransaction[] = [];
      if (role === 'CUSTOMER') {
        holds = (await this.get<{ items: MoneyHold[] }>('me/holds')).items;
        payments = await Promise.all(
          holds
            .filter((h) => h.paymentId)
            .map((h) => this.get<MoneyPayment>('payments/' + h.paymentId)),
        );
      } else {
        const values = await Promise.all([
          this.get<MoneyHold[]>('holds/creditable'),
          this.get<{ items: MoneyPayment[] }>('payments'),
          this.get<{ items: MoneyDeposit[] }>('deposits'),
          this.get<{ items: MoneyContract[] }>('contracts'),
          this.get<MoneyTransaction[]>('brokerage-transactions'),
        ]);
        holds = values[0];
        payments = values[1].items;
        deposits = values[2].items;
        contracts = values[3].items;
        transactions = values[4];
      }
      if (actor !== this.auth.account()?.id || !this.online() || version !== this.refreshVersion)
        return;
      this.owner = actor;
      this.data.set({ holds, payments, deposits, contracts, transactions });
    } catch (error) {
      if (version !== this.refreshVersion || actor !== this.auth.account()?.id) return;
      this.data.set({ holds: [], deposits: [], payments: [], contracts: [], transactions: [] });
      this.error.set(this.message(error));
      throw new Error(this.message(error));
    } finally {
      if (version === this.refreshVersion) this.loading.set(false);
    }
  }
  async reload() {
    try {
      await this.refresh();
    } catch {
      /* refresh exposes the error signal to the view. */
    }
  }
  async customerForDeposit(customerPhone: string, roomId: string) {
    const body = { customerPhone, roomId };
    const value = await this.write<EmployeeCustomer | null>('customers/identity-context', body);
    this.finishDraft('customers/identity-context', body);
    return value;
  }
  async saveIdentity(id: string, body: CustomerIdentity) {
    const path = 'customers/' + encodeURIComponent(id) + '/identity';
    const value = await this.write<EmployeeCustomer>(path, body, 'PUT');
    this.finishDraft(path, body, 'PUT');
    return value;
  }
  async saveDepositCustomer(
    body: CustomerIdentity & { customerName: string; customerPhone: string; roomId: string },
  ) {
    const path = 'customers/deposit-profile';
    const value = await this.write<EmployeeCustomer>(path, body);
    this.finishDraft(path, body);
    return value;
  }
  async uploadIdentity(file: File) {
    const body = new FormData();
    body.append('file', file);
    try {
      return (
        await firstValueFrom(
          this.http.post<{ url: string }>('/api/upload/cccd', body, {
            withCredentials: true,
            timeout: 10000,
          }),
        )
      ).url;
    } catch (error) {
      throw new Error(this.message(error));
    }
  }
  async loadHold(id: string) {
    await this.refresh();
    return this.holds().find((h) => h.id === id);
  }
  async reviewPayment(id: string, rejectReason?: string, bankTransactionRef?: string) {
    await this.write<MoneyPayment>(
      'payments/' + id + (rejectReason === undefined ? '/confirm' : '/reject'),
      rejectReason === undefined
        ? { ...(bankTransactionRef ? { bankTransactionRef } : {}) }
        : { reason: rejectReason },
    );
    await this.refresh();
  }
  async reviewDeposit(id: string, status: 'APPROVED' | 'REJECTED', reason: string) {
    await this.write('admin/deposits/' + id + '/review', { status, reason });
    await this.refresh();
  }
  getReceipt(id: string) {
    return this.get<MoneyReceipt>('payments/' + id + '/receipt');
  }
}

export interface CustomerIdentity {
  idNumber: string;
  issuedOn: string;
  issuedBy: string;
  permanentAddress: string;
  frontImageUrl: string;
  backImageUrl: string;
}
export interface EmployeeCustomer {
  id: string;
  name?: string;
  fullName?: string;
  phone: string;
  permanentAddress?: string;
  identity?: {
    number: string;
    issuedDate: string;
    issuedPlace: string;
    frontImage: string;
    backImage: string;
  };
}
