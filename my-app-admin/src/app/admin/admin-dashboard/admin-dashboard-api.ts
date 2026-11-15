import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiRevenueReport } from '../../classes/PayrollApi';
import { AuthService } from '../../services/auth-service';
import { apiMessage } from '../../services/api-message';

export interface RoomCounts {
  total: number;
  byStatus: Record<string, number>;
  occupancy: number;
}
export interface AdminSummary extends ApiRevenueReport {
  asOf: string;
  rooms: RoomCounts;
  activeStaff: number;
  pendingDeposits: number;
  pendingDepositAmount: number;
  today: {
    date: string;
    shifts: number;
    assignments: number;
    checkedIn: number;
    checkedOut: number;
    late: number;
    absent: number;
  };
}
export interface OccupancyReport extends RoomCounts {
  asOf: string;
  date: string;
  depositCount: number;
  contractCount: number;
  rows: (RoomCounts & {
    propertyId: string;
    propertyName: string;
    roomType: string;
    depositCount: number;
    depositRequired: number;
    depositConfirmed: number;
    contractCount: number;
  })[];
}
@Injectable({ providedIn: 'root' })
export class AdminDashboardAPI {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private data = signal<{ owner: string; summary: AdminSummary } | null>(null);
  private version = 0;
  readonly loading = signal(false);
  readonly error = signal('');
  readonly summary = computed(() =>
    this.auth.serverAuthenticated() &&
    this.auth.account()?.role === 'ADMIN' &&
    this.data()?.owner === this.auth.account()?.id
      ? this.data()!.summary
      : null,
  );
  constructor() {
    effect(() => {
      const actor = this.auth.account(),
        authenticated = this.auth.serverAuthenticated();
      untracked(() => {
        this.version++;
        this.data.set(null);
        this.error.set('');
        this.loading.set(false);
        if (actor?.role === 'ADMIN' && authenticated) void this.refresh();
      });
    });
  }
  currentMonth() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(new Date());
    return `${parts.find((p) => p.type === 'year')!.value}-${parts.find((p) => p.type === 'month')!.value}`;
  }
  async refresh(month = this.currentMonth()) {
    const actor = this.auth.account();
    if (actor?.role !== 'ADMIN' || !this.auth.serverAuthenticated()) return;
    const version = ++this.version;
    this.data.set(null);
    this.error.set('');
    this.loading.set(true);
    try {
      const summary = await firstValueFrom(
        this.http.get<AdminSummary>(`/data/admin/summary?month=${encodeURIComponent(month)}`, {
          withCredentials: true,
          timeout: 15000,
        }),
      );
      if (version === this.version && actor.id === this.auth.account()?.id)
        this.data.set({ owner: actor.id, summary });
    } catch (error) {
      if (version === this.version)
        this.error.set(apiMessage(error, 'Không tải được số liệu tổng quan.'));
    } finally {
      if (version === this.version) this.loading.set(false);
    }
  }
}
