import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminSummary } from '../classes/AdminDashboard';
export type { RoomCounts, AdminSummary, OccupancyReport } from '../classes/AdminDashboard';
import { AuthService } from './auth-service';
import { apiMessage } from './api-message';

@Injectable({ providedIn: 'root' })
export class AdminDashboardAPI {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private data = signal<{ owner: string; summary: AdminSummary } | null>(null);
  private version = 0;
  private inFlight?: { owner: string; month: string; request: Promise<void> };
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
        this.inFlight = undefined;
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
  refresh(month = this.currentMonth()): Promise<void> {
    const actor = this.auth.account();
    if (actor?.role !== 'ADMIN' || !this.auth.serverAuthenticated()) return Promise.resolve();
    const existing = this.inFlight;
    if (existing?.owner === actor.id && existing.month === month) return existing.request;
    const loading = this.load(month).finally(() => {
      if (this.inFlight?.request === loading) this.inFlight = undefined;
    });
    this.inFlight = { owner: actor.id, month, request: loading };
    return loading;
  }
  private async load(month: string) {
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
