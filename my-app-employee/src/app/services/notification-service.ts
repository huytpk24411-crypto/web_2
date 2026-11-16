import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Notification } from '../classes/Notification';
import { AuthService } from './auth-service';
import { CustomerAPIService } from './customer-apiservice';
import { apiMessage } from './api-message';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private auth = inject(AuthService);
  private api = inject(CustomerAPIService);
  private state = signal<{ owner: string; items: Notification[] } | null>(null);
  private refreshVersion = 0;
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly items = computed(() => {
    const state = this.state();
    const owner = this.auth.account()?.id;
    return state && state.owner === owner ? state.items : [];
  });
  readonly unread = computed(() => this.items().filter((item) => !item.read).length);

  constructor() {
    effect(() => {
      const account = this.auth.account();
      this.auth.serverAuthenticated();
      this.refreshVersion++;
      this.state.set(null);
      this.loading.set(false);
      this.error.set('');
      if (account && this.auth.serverAuthenticated()) void this.refresh();
    });
  }
  async refresh(): Promise<void> {
    const account = this.auth.account();
    if (!account || !this.auth.serverAuthenticated()) return;
    const version = ++this.refreshVersion;
    this.loading.set(true);
    this.error.set('');
    try {
      const items = await firstValueFrom(this.api.notifications());
      if (this.auth.account()?.id === account.id && version === this.refreshVersion)
        this.state.set({
          owner: account.id,
          items: items.map((item) => ({
            ...item,
            ...this.display(item),
            body: [
              this.display(item).body,
              ...(item.roomSnapshots || []).map((room) =>
                [room.code, room.name, room.address].filter(Boolean).join(' · '),
              ),
            ]
              .filter(Boolean)
              .join(' — '),
          })),
        });
    } catch (error) {
      if (this.auth.account()?.id !== account.id || version !== this.refreshVersion) return;
      this.error.set(apiMessage(error, 'Không tải được thông báo.'));
    } finally {
      if (version === this.refreshVersion) this.loading.set(false);
    }
  }
  private display(item: Notification): { title: string; body: string } {
    if (!/^P3_/.test(item.type) || !/^[A-Za-z]+: [A-Z_]+$/.test(item.title))
      return { title: item.title, body: item.body };
    const entities: Record<string, string> = {
      Hold: 'Giữ chỗ phòng',
      Payment: 'Thanh toán',
      Receipt: 'Phiếu thu',
      Deposit: 'Hồ sơ cọc',
      Contract: 'Hợp đồng',
      Room: 'Phòng',
      BrokerageTransaction: 'Giao dịch môi giới',
      EmployeeRevenue: 'Doanh thu nhân viên',
      CompanyRevenue: 'Doanh thu công ty',
      PayrollPeriod: 'Kỳ lương',
    };
    const states: Record<string, string> = {
      CREATE: 'Đã tạo mới',
      UPDATE: 'Đã cập nhật',
      ACTIVE: 'Đang có hiệu lực',
      CONFIRMED: 'Đã xác nhận',
      PAID: 'Đã ghi nhận tiền',
      SIGNED: 'Đã ký',
      COMPLETED: 'Đã hoàn tất',
      CANCELLED: 'Đã hủy',
      EXPIRED: 'Đã hết hạn',
      FORFEITED: 'Đã hết hạn giữ chỗ',
      ABANDONED: 'Khách đã bỏ cọc',
      CONTRACTED: 'Đã lập hợp đồng',
      REJECTED: 'Không được chấp thuận',
      FAILED: 'Không thành công',
      PAYMENT_PENDING: 'Chờ thanh toán',
    };
    const action = item.title.split(': ')[1];
    const title = entities[item.entityType] || 'Cập nhật hồ sơ';
    return { title, body: states[action] || 'Thông tin hồ sơ vừa được cập nhật.' };
  }
  async markRead(id?: string): Promise<void> {
    const account = this.auth.account();
    if (!account || this.saving() || this.loading()) return;
    const ids = this.items()
      .filter((item) => !item.read && (!id || item.id === id))
      .map((item) => item.id);
    if (!ids.length) return;
    this.saving.set(true);
    this.error.set('');
    try {
      if (!this.auth.serverAuthenticated()) throw new Error('Vui lòng đăng nhập lại.');
      if (id) await firstValueFrom(this.api.readNotification(id));
      else await firstValueFrom(this.api.readAllNotifications());
      if (this.auth.account()?.id !== account.id) return;
      this.state.update((value) =>
        value && value.owner === account.id
          ? {
              ...value,
              items: value.items.map((item) =>
                ids.includes(item.id)
                  ? { ...item, read: true, readAt: new Date().toISOString() }
                  : item,
              ),
            }
          : value,
      );
    } catch (error) {
      if (this.auth.account()?.id === account.id)
        this.error.set(apiMessage(error, 'Không cập nhật được thông báo.'));
    } finally {
      this.saving.set(false);
    }
  }
}
