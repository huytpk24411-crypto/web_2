import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth-service';
import { CustomerAPIService } from './customer-apiservice';
import { apiMessage } from './api-message';
@Injectable({ providedIn: 'root' })
export class FavoriteService {
  private auth = inject(AuthService);
  private api = inject(CustomerAPIService);
  private remote = signal<{ owner: string; ids: string[] } | null>(null);
  private refreshPromise: Promise<void> = Promise.resolve();
  readonly loading = signal(false);
  readonly pending = signal<string[]>([]);
  readonly error = signal('');
  readonly ids = computed(() => {
    const remote = this.remote();
    return this.auth.serverAuthenticated() && remote?.owner === this.auth.account()?.id
      ? remote!.ids
      : [];
  });
  constructor() {
    effect(() => {
      const account = this.auth.account();
      const server = this.auth.serverAuthenticated();
      this.error.set('');
      this.remote.set(null);
      this.loading.set(false);
      if (account?.role === 'CUSTOMER' && server) this.refreshPromise = this.refresh(account.id);
    });
  }
  private async refresh(owner: string): Promise<void> {
    this.loading.set(true);
    try {
      const favorites = await firstValueFrom(this.api.favorites());
      if (this.auth.account()?.id === owner)
        this.remote.set({ owner, ids: favorites.map((item) => item.roomId) });
    } catch (error) {
      if (this.auth.account()?.id === owner)
        this.error.set(apiMessage(error, 'Không tải được phòng yêu thích.'));
    } finally {
      if (this.auth.account()?.id === owner) this.loading.set(false);
    }
  }
  has(id: string): boolean {
    return this.ids().includes(id);
  }
  toggle(roomId: string): void {
    const owner = this.auth.account()?.id;
    if (!owner || !this.auth.hasRole(['CUSTOMER']) || this.pending().includes(roomId)) return;
    this.pending.update((ids) => [...ids, roomId]);
    void this.refreshPromise
      .then(() => {
        if (this.auth.account()?.id !== owner) return;
        if (this.error()) throw new Error(this.error());
        return this.save(roomId, !this.has(roomId));
      })
      .catch((error) => {
        if (this.auth.account()?.id === owner)
          this.error.set(apiMessage(error, 'Không lưu được phòng yêu thích.'));
      })
      .finally(() => this.pending.update((ids) => ids.filter((id) => id !== roomId)));
  }
  async save(roomId: string, saved: boolean): Promise<void> {
    const owner = this.auth.account()?.id;
    if (!owner || !this.auth.hasRole(['CUSTOMER']))
      throw new Error('Vui lòng đăng nhập tài khoản khách hàng.');
    await this.refreshPromise;
    if (this.auth.account()?.id !== owner) throw new Error('Phiên đăng nhập đã thay đổi.');
    this.error.set('');
    if (saved) await firstValueFrom(this.api.addFavorite(roomId));
    else await firstValueFrom(this.api.removeFavorite(roomId));
    if (this.auth.account()?.id !== owner) return;
    const ids = this.ids().filter((id) => id !== roomId);
    this.remote.set({ owner, ids: saved ? [...ids, roomId] : ids });
  }
}
