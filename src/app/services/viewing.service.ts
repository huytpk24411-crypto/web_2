import { Injectable, inject } from '@angular/core';
import { DemoStore, uid } from './demo-store.service';
import { AuthService } from './auth.service';
import { Viewing } from '../models/domain';
@Injectable({ providedIn: 'root' })
export class ViewingService {
  private store = inject(DemoStore);
  private auth = inject(AuthService);
  list() {
    return this.store.state().viewings.filter((v) => v.customerId === this.auth.account()?.id);
  }
  create(data: Omit<Viewing, 'id' | 'customerId' | 'status'>): Viewing {
    if (this.auth.account()?.role !== 'CUSTOMER')
      throw new Error('Vui lòng đăng nhập tài khoản khách hàng.');
    if (!data.roomIds.length || new Date(data.at).getTime() <= Date.now())
      throw new Error('Chọn phòng và thời gian trong tương lai.');
    if (
      data.roomIds.some(
        (id) => !this.store.state().rooms.some((r) => r.id === id && r.status === 'AVAILABLE' && r.publicationStatus === 'PUBLISHED'),
      )
    )
      throw new Error('Có phòng không còn trống. Vui lòng chọn lại.');
    const viewing: Viewing = {
      ...data,
      id: uid('view'),
      customerId: this.auth.account()!.id,
      status: 'SCHEDULED',
    };
    this.store.update((s) => s.viewings.push(viewing));
    return viewing;
  }
  cancel(id: string) {
    this.store.update((s) => {
      const v = s.viewings.find((v) => v.id === id && v.customerId === this.auth.account()?.id);
      if (v) v.status = 'CANCELLED';
    });
  }
}
