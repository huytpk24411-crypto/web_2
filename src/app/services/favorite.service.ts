import { Injectable, computed, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { DemoStore } from './demo-store.service';
@Injectable({ providedIn: 'root' })
export class FavoriteService {
  private store = inject(DemoStore);
  private auth = inject(AuthService);
  readonly ids = computed(() =>
    this.store
      .state()
      .favorites.filter((f) => f.customerId === this.auth.account()?.id)
      .map((f) => f.roomId),
  );
  has(id: string): boolean {
    return this.ids().includes(id);
  }
  toggle(roomId: string): void {
    const account = this.auth.account();
    if (account?.role !== 'CUSTOMER') return;
    this.store.update((s) => {
      const index = s.favorites.findIndex(
        (f) => f.customerId === account.id && f.roomId === roomId,
      );
      if (index >= 0) s.favorites.splice(index, 1);
      else s.favorites.push({ customerId: account.id, roomId });
    });
  }
}
