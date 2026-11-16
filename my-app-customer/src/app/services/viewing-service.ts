import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Viewing, ViewingAvailability, ViewingOut } from '../classes/Viewing';
import { AuthService } from './auth-service';
import { RoomService } from './room-service';
import { ViewingCartAPIService, ViewingCheckout } from './viewing-cart-apiservice';
import { apiMessage } from './api-message';
import { canScheduleViewing } from '../classes/Room';

export const VIEWING_SHIFT_ERROR = 'Giờ xem phải bắt đầu trong 07:00–10:30 hoặc 13:00–16:30.';
export function isViewingShiftTime(time: string): boolean {
  return /^(?:(?:07|08|09|10|13|14|15|16):(?:00|30))$/.test(time);
}

// Preserve server messages and roomId without changing the shared error policy.
export function viewingApiError(error: unknown, fallback: string): Error {
  let body = error instanceof HttpErrorResponse ? error.error : null;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }
  return Object.assign(
    new Error(apiMessage(new Error(body?.message || apiMessage(error, fallback)), fallback)),
    {
      status: error instanceof HttpErrorResponse ? error.status : undefined,
      roomId: body?.roomId as string | undefined,
      code: body?.code as string | undefined,
    },
  );
}

@Injectable({ providedIn: 'root' })
export class ViewingService {
  private auth = inject(AuthService);
  private rooms = inject(RoomService);
  private cartApi = inject(ViewingCartAPIService);
  private http = inject(HttpClient);
  private options = { withCredentials: true, timeout: 10000 };
  private remote = signal<{ owner: string; items: Viewing[] } | null>(null);
  private roomAvailable(id: string): boolean {
    const room = this.rooms.get(id);
    return canScheduleViewing(room);
  }
  private owner(): string {
    if (!this.auth.hasRole(['CUSTOMER']))
      throw new Error('Vui lòng đăng nhập tài khoản khách hàng.');
    return this.auth.account()!.id;
  }
  private checkOwner(owner: string) {
    if (this.auth.account()?.id !== owner) throw new Error('Phiên đăng nhập đã thay đổi.');
  }
  async getCart(): Promise<string[]> {
    const owner = this.owner();
    const cart = await firstValueFrom(this.cartApi.get());
    this.checkOwner(owner);
    return cart;
  }
  async addToCart(roomId: string): Promise<void> {
    const owner = this.owner();
    if (!this.roomAvailable(roomId)) throw new Error('Phòng không còn trống. Vui lòng chọn lại.');
    await firstValueFrom(this.cartApi.add(roomId));
    this.checkOwner(owner);
  }
  async availability(date: string, excludeViewingId?: string): Promise<ViewingAvailability> {
    const owner = this.owner();
    try {
      const params: Record<string, string> = excludeViewingId
        ? { date, excludeViewingId }
        : { date };
      const result = await firstValueFrom(
        this.http.get<ViewingAvailability>('/viewings/availability', { ...this.options, params }),
      );
      this.checkOwner(owner);
      return result;
    } catch (error) {
      throw viewingApiError(error, 'Không tải được khung giờ. Vui lòng thử lại.');
    }
  }
  async schedule(data: ViewingCheckout): Promise<{ bookingId: string; viewings: Viewing[] }> {
    const owner = this.owner();
    if (
      !data.items.length ||
      data.items.length > 20 ||
      new Set(data.items.map((i) => i.roomId)).size !== data.items.length
    )
      throw new Error('Vui lòng chọn từ 1 đến 20 phòng khác nhau.');
    const times = new Set<string>();
    for (const item of data.items) {
      if (!isViewingShiftTime(item.startTime)) throw new Error(VIEWING_SHIFT_ERROR);
      const at = `${item.date}T${item.startTime}:00+07:00`;
      if (!Number.isFinite(Date.parse(at)) || Date.parse(at) <= Date.now())
        throw new Error('Chọn phòng và thời gian trong tương lai.');
      if (times.has(at))
        throw new Error('Bạn đã có lịch xem khác vào giờ này, vui lòng chọn giờ khác.');
      times.add(at);
      if (!this.roomAvailable(item.roomId))
        throw new Error('Có phòng không còn trống. Vui lòng chọn lại.');
    }
    try {
      const cart = await this.getCart();
      // A2 consumes only items; preserve unrelated rooms in the session cart.
      for (const item of data.items.filter((i) => !cart.includes(i.roomId))) {
        this.checkOwner(owner);
        await firstValueFrom(this.cartApi.add(item.roomId));
      }
      this.checkOwner(owner);
      const result = await firstValueFrom(this.cartApi.checkout(data));
      this.checkOwner(owner);
      return { bookingId: result.bookingId, viewings: result.viewings.map((v) => this.fromApi(v)) };
    } catch (error) {
      throw viewingApiError(error, 'Không đặt được lịch xem. Vui lòng thử lại.');
    }
  }
  list(): Viewing[] {
    const remote = this.remote();
    return this.auth.serverAuthenticated() && remote && remote.owner === this.auth.account()?.id
      ? remote.items
      : [];
  }
  async refreshMine(): Promise<void> {
    const owner = this.owner();
    try {
      const records = await firstValueFrom(
        this.http.get<ViewingOut[]>('/viewings/mine', this.options),
      );
      this.checkOwner(owner);
      this.remote.set({
        owner,
        items: records.map((v) => this.fromApi(v)).sort((a, b) => b.at.localeCompare(a.at)),
      });
    } catch (error) {
      throw viewingApiError(error, 'Không tải được lịch xem. Vui lòng thử lại.');
    }
  }
  private fromApi(value: ViewingOut): Viewing {
    return {
      id: value.id,
      bookingId: value.bookingId,
      customerId: this.auth.account()!.id,
      roomIds: value.rooms.map((r) => r.roomId),
      roomSnapshots: Object.fromEntries(
        value.rooms.filter((r) => r.roomSnapshot).map((r) => [r.roomId, r.roomSnapshot!]),
      ),
      name: value.viewerName ?? value.visitorName ?? '',
      phone: value.viewerPhone ?? value.visitorPhone ?? '',
      at: value.startAt || `${value.date}T${value.startTime}:00+07:00`,
      note: value.note || '',
      status:
        value.status === 'DA_HUY'
          ? 'CANCELLED'
          : value.status === 'DA_XEM'
            ? 'COMPLETED'
            : 'SCHEDULED',
      serverStatus: value.status,
      guide: value.guide ?? null,
      roomsInfo: value.roomsInfo ?? [],
      canEdit: value.canEdit === true,
    };
  }
  async update(
    id: string,
    body: { date?: string; startTime?: string; note?: string },
  ): Promise<Viewing> {
    const owner = this.owner();
    try {
      const record = await firstValueFrom(
        this.http.put<ViewingOut>('/viewings/' + encodeURIComponent(id), body, this.options),
      );
      this.checkOwner(owner);
      return this.fromApi(record);
    } catch (error) {
      throw viewingApiError(error, 'Không cập nhật được lịch xem. Vui lòng thử lại.');
    }
  }
  async remove(id: string): Promise<void> {
    const owner = this.owner();
    try {
      await firstValueFrom(this.http.delete('/viewings/' + encodeURIComponent(id), this.options));
      this.checkOwner(owner);
    } catch (error) {
      throw viewingApiError(error, 'Không xóa được lịch xem. Vui lòng thử lại.');
    }
  }
  async cancel(id: string): Promise<void> {
    const owner = this.owner();
    const viewing = this.list().find((item) => item.id === id);
    if (!viewing || viewing.status !== 'SCHEDULED') throw new Error('Không thể hủy lịch xem này.');
    const record = await firstValueFrom(
      this.http.put<ViewingOut>(
        '/viewings/' + encodeURIComponent(id) + '/cancel',
        {},
        this.options,
      ),
    );
    this.checkOwner(owner);
    this.remote.update((value) =>
      value?.owner === owner
        ? {
            owner,
            items: value.items.map((item) => (item.id === id ? this.fromApi(record) : item)),
          }
        : value,
    );
  }
}
