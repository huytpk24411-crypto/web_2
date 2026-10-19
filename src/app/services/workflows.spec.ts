import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { DemoStore } from './demo-store.service';
import { RoomService } from './room.service';
import { FavoriteService } from './favorite.service';
import { BookingService } from './booking.service';
import { DepositService } from './deposit.service';
import { ViewingService } from './viewing.service';
import { ShiftService } from './shift.service';
import { AttendanceService } from './attendance.service';
import { TaskService } from './task.service';
import { AdminRoomService } from './admin-room.service';
import { DealService } from './deal.service';
import { PayrollService } from './payroll.service';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { SEED_ROOMS } from '../data/rooms';

describe('Nghiệp vụ iHOUZZ Uni', () => {
  let auth: AuthService, store: DemoStore;
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    auth = TestBed.inject(AuthService);
    store = TestBed.inject(DemoStore);
  });
  it('bắt đầu ở guest, xem được phòng công khai và chưa có dữ liệu yêu thích', () => {
    expect(auth.account()).toBeNull();
    expect(TestBed.inject(RoomService).rooms().length).toBeGreaterThan(0);
    expect(TestBed.inject(FavoriteService).ids()).toEqual([]);
  });
  it('chấp nhận đúng ba tài khoản, admin có quyền nhân viên, đăng xuất xóa phiên', () => {
    expect(auth.login('customer123', 'sai')).toBe(false);
    expect(auth.login('0901234567', '123')).toBe(false);
    auth.logout();
    for (const [username, role, path] of [
      ['customer123', 'CUSTOMER', '/'],
      ['employee123', 'EMPLOYEE', '/employee/shifts/register'],
      ['admin123', 'ADMIN', '/admin'],
    ]) {
      expect(auth.login(username, '123')).toBe(true);
      expect(auth.account()?.role).toBe(role);
      expect(auth.destination()).toBe(path);
    }
    expect(auth.isEmployee()).toBe(true);
    expect(sessionStorage.getItem('ihouzz-session')).not.toContain('password');
    auth.logout();
    expect(sessionStorage.getItem('ihouzz-session')).toBeNull();
  });
  it('không cho redirect ra ngoài hoặc vào vai trò trái quyền', () => {
    auth.login('customer123', '123');
    for (const url of [
      'https://example.com',
      '//example.com',
      '/\\example.com',
      '/admin',
      '/admin/approvals',
      '/admin/payroll',
      '/employee/payroll',
      '/login',
      '/khong-ton-tai',
    ])
      expect(auth.destination(url)).toBe('/');
    expect(auth.destination('/bookings/new?roomId=r1')).toBe('/bookings/new?roomId=r1');
    auth.login('admin123', '123');
    expect(auth.destination('/employee/payroll')).toBe('/employee/payroll');
    expect(auth.destination('/admin/approvals')).toBe('/admin/approvals');
    expect(auth.destination('/admin/payroll')).toBe('/admin/payroll');
  });
  it('đăng ký username riêng, chỉ tạo CUSTOMER và mật khẩu không xuất hiện trong storage', () => {
    expect(auth.register('khachthu', 'Khách thử', '0909999999', 'secret-demo')).toBe(true);
    expect(auth.account()?.role).toBe('CUSTOMER');
    expect(auth.account()?.username).toBe('khachthu');
    expect(JSON.stringify(localStorage) + JSON.stringify(sessionStorage)).not.toContain(
      'secret-demo',
    );
    auth.logout();
    expect(auth.login('0909999999', 'secret-demo')).toBe(false);
    expect(auth.login('khachthu', 'secret-demo')).toBe(true);
    expect(auth.register('khachthu', 'Người khác', '0908888888', 'abc')).toBe(false);
    expect(auth.register('khachkhac', 'Trùng số', '0909999999', 'abc')).toBe(false);
  });
  it('yêu thích tách theo tài khoản và toggle đồng bộ', () => {
    const favorites = TestBed.inject(FavoriteService);
    favorites.toggle('r1');
    expect(favorites.ids()).toEqual([]);
    auth.login('customer123', '123');
    favorites.toggle('r1');
    expect(favorites.has('r1')).toBe(true);
    favorites.toggle('r1');
    expect(favorites.has('r1')).toBe(false);
    favorites.toggle('r1');
    auth.register('khachmoi', 'Khách mới', '0909999999', '123');
    expect(favorites.ids()).toEqual([]);
  });
  it('tìm kiếm bỏ dấu và lọc kết hợp', () => {
    const service = TestBed.inject(RoomService);
    store.state.update((state) => ({ ...state, rooms: structuredClone(SEED_ROOMS) }));
    expect(service.filter({ query: 'dao su tich' })).toHaveLength(1);
    expect(service.filter({ district: 'Đông Hòa', maxPrice: 3000000 })).toHaveLength(1);
    const sorted = service.filter({ sort: 'price-asc' });
    expect(sorted[0].price).toBeLessThanOrEqual(sorted[1].price);
  });
  it('đặt lịch nhiều phòng, ngăn quá khứ và phòng không khả dụng', () => {
    auth.login('customer123', '123');
    const viewing = TestBed.inject(ViewingService);
    const data = {
      name: 'An',
      phone: '0901234567',
      roomIds: ['r1', 'r2'],
      at: new Date(Date.now() + 86400000).toISOString(),
      note: '',
    };
    const result = viewing.create(data);
    expect(result.roomIds).toHaveLength(2);
    expect(() => viewing.create({ ...data, at: '2000-01-01' })).toThrow();
    expect(() => viewing.create({ ...data, roomIds: [] })).toThrow();
    store.update((s) => (s.rooms[0].publicationStatus = 'HIDDEN'));
    expect(() => viewing.create(data)).toThrow();
    viewing.cancel(result.id);
    expect(viewing.list()[0].status).toBe('CANCELLED');
  });
  it('chỉ khóa 48 giờ sau xác nhận và không tạo thanh toán trùng', () => {
    auth.login('customer123', '123');
    const service = TestBed.inject(BookingService);
    const b = service.create('r1', 'An', '0901234567');
    expect(b.status).toBe('PENDING');
    expect(b.expiresAt).toBeUndefined();
    expect(store.state().rooms[0].status).toBe('AVAILABLE');
    expect(store.state().payments).toHaveLength(0);
    const confirmed = service.confirmDemo(b.id);
    expect(confirmed.status).toBe('CONFIRMED');
    const payment = store.state().payments[0];
    expect(new Date(confirmed.expiresAt!).getTime() - new Date(payment.confirmedAt).getTime()).toBe(
      48 * 3600000,
    );
    expect(store.state().rooms[0].status).toBe('HELD');
    service.confirmDemo(b.id);
    expect(store.state().payments).toHaveLength(1);
    expect(() => service.create('r1', 'An', '0901234567')).toThrow();
  });
  it('chỉ chủ sở hữu xem và xác nhận booking của mình', () => {
    auth.login('customer123', '123');
    const service = TestBed.inject(BookingService);
    const b = service.create('r1', 'An', '0901234567');
    auth.register('khachkhac', 'Khách khác', '0900000000', '123');
    expect(service.get(b.id)).toBeUndefined();
    expect(() => service.confirmDemo(b.id)).toThrow();
  });
  it('hết hạn giữ chỗ mở lại phòng khi chưa chuyển sang cọc', () => {
    auth.login('customer123', '123');
    const service = TestBed.inject(BookingService);
    const b = service.create('r1', 'An', '0901234567');
    service.confirmDemo(b.id);
    store.update((s) => (s.bookings[0].expiresAt = '2000-01-01'));
    service.expire();
    expect(service.get(b.id)?.status).toBe('EXPIRED');
    expect(store.state().rooms[0].status).toBe('AVAILABLE');
  });
  it('khấu trừ giữ chỗ một lần, cọc tiền mặt idempotent và bàn giao ghi phí môi giới riêng', () => {
    auth.login('customer123', '123');
    const bookings = TestBed.inject(BookingService);
    const b = bookings.create('r1', 'An', '0901234567');
    bookings.confirmDemo(b.id);
    auth.login('employee123', '123');
    const deposits = TestBed.inject(DepositService);
    const data = {
      roomId: 'r1',
      customerName: 'An',
      phone: '0901234567',
      total: 1800000,
      method: 'CASH' as const,
    };
    const d = deposits.create(data, b.id);
    expect(d.holdCredit).toBe(1000000);
    expect(d.due).toBe(800000);
    expect(() => deposits.create(data, b.id)).toThrow();
    expect(store.state().payments).toHaveLength(1);
    deposits.confirmDemo(d.id, 'CASH');
    deposits.confirmDemo(d.id, 'CASH');
    expect(store.state().payments).toHaveLength(2);
    expect(store.state().payments[1].amount).toBe(800000);
    const deals = TestBed.inject(DealService);
    const deal = deals.list().find((x) => x.depositId === d.id)!;
    expect(deal.brokerageFee).toBe(4200000);
    deals.complete(deal.id);
    expect(store.state().rooms[0].status).toBe('RENTED');
  });
  it('cọc trực tiếp không có credit, bỏ cọc giải phóng phòng', () => {
    auth.login('employee123', '123');
    const deposits = TestBed.inject(DepositService);
    const d = deposits.create({
      roomId: 'r2',
      customerName: 'An',
      phone: '0901234567',
      total: 3000000,
      method: 'QR',
    });
    expect(d.due).toBe(3000000);
    expect(d.holdCredit).toBe(0);
    const deals = TestBed.inject(DealService);
    expect(() => deals.forfeit('deal1', 'Test')).toThrow();
    deposits.confirmDemo(d.id, 'QR');
    const deal = deals.list().find((x) => x.depositId === d.id)!;
    deals.forfeit(deal.id, 'Khách thay đổi nhu cầu');
    expect(deposits.get(d.id)?.status).toBe('FORFEITED');
    expect(store.state().rooms.find((x) => x.id === 'r2')?.status).toBe('AVAILABLE');
  });
  it('đăng ký ca giới hạn số chỗ, số ca, ngăn trùng và nhận ngay', () => {
    auth.login('employee123', '123');
    const shifts = TestBed.inject(ShiftService);
    const before = shifts.remaining('shift1');
    shifts.register(['shift1']);
    expect(shifts.remaining('shift1')).toBe(before - 1);
    expect(shifts.mine()[0].status).toBe('REGISTERED');
    expect(() => shifts.register(['shift1'])).toThrow();
    expect(() => shifts.register(['shift6'])).toThrow();
    expect(() => shifts.register(['shift2', 'shift2'])).toThrow();
    expect(() =>
      shifts.register(['shift2', 'shift3', 'shift4', 'shift5', 'shift7', 'shift8', 'shift9']),
    ).toThrow();
  });
  it('check-in, trạng thái cá nhân/nhóm và bàn giao cùng employeeShiftId', () => {
    auth.login('employee123', '123');
    const shifts = TestBed.inject(ShiftService);
    shifts.register(['shift1', 'shift2']);
    const [a, b] = shifts.mine();
    const attendance = TestBed.inject(AttendanceService),
      tasks = TestBed.inject(TaskService);
    expect(() => attendance.checkIn(a.id, '', '')).toThrow();
    attendance.checkIn(a.id, ASSET, 'Bắt đầu');
    expect(shifts.get(a.id)?.status).toBe('IN_PROGRESS');
    expect(() => attendance.checkIn(a.id, ASSET, '')).toThrow();
    const t = tasks.list(a.id)[0];
    tasks.toggle(t.id, a.id);
    expect(tasks.list(a.id)[0].doneBy).toContain('employee1');
    expect(tasks.list(a.id)[0].status).toBe('IN_PROGRESS');
    attendance.checkOut(a.id, 'Tiếp tục liên hệ khách', b.id);
    expect(attendance.get(a.id)?.checkOutAt).toBeTruthy();
    expect(shifts.get(a.id)?.status).toBe('COMPLETED');
    expect(tasks.list(b.id)[0].carriedFrom).toBe(a.id);
    auth.login('admin123', '123');
    expect(attendance.get(a.id)).toBeUndefined();
  });
  it('các thao tác API phòng yêu cầu quyền Admin', async () => {
    const service = TestBed.inject(AdminRoomService);
    await expect(service.remove('r1')).rejects.toThrow('Chỉ quản trị viên');
  });
  it('lương tính theo doanh thu phân bổ, không cộng toàn bộ tiền cọc', () => {
    const payroll = TestBed.inject(PayrollService),
      slip = payroll.slips[0];
    expect(payroll.commission(slip)).toBe(11320000);
    expect(payroll.net(slip)).toBe(17640000);
  });
  it('dữ liệu demo khôi phục từ localStorage sau lần tải mới', () => {
    auth.login('customer123', '123');
    TestBed.inject(FavoriteService).toggle('r3');
    const copy = new DemoStore();
    expect(copy.state().favorites[0].roomId).toBe('r3');
  });
  it('không hiển thị phòng giả khi API chưa nạp, số tiền không hợp lệ bị từ chối', () => {
    expect(TestBed.inject(RoomService).rooms().length).toBeGreaterThan(0);
    auth.login('employee123', '123');
    expect(() =>
      TestBed.inject(DepositService).create({
        roomId: 'r2',
        customerName: 'An',
        phone: '0901234567',
        total: NaN,
        method: 'QR',
      }),
    ).toThrow();
  });
  it('lưu lý do bỏ cọc sau tải mới và giữ nguyên phòng đã ẩn', () => {
    auth.login('employee123', '123');
    const deposits = TestBed.inject(DepositService);
    const d = deposits.create({
      roomId: 'r2',
      customerName: 'An',
      phone: '0901234567',
      total: 1800000,
      method: 'QR',
    });
    deposits.confirmDemo(d.id, 'QR');
    auth.login('admin123', '123');
    store.update((state) => {
      const room = state.rooms.find((item) => item.id === 'r2');
      if (room) room.publicationStatus = 'HIDDEN';
    });
    const deals = TestBed.inject(DealService),
      deal = deals.list().find((x) => x.depositId === d.id)!;
    deals.forfeit(deal.id, 'Khách chuyển khu vực');
    const restored = new DemoStore();
    expect(restored.state().deals.find((x) => x.id === deal.id)?.forfeitureReason).toBe(
      'Khách chuyển khu vực',
    );
    expect(restored.state().rooms[1].publicationStatus).toBe('HIDDEN');
  });
});
const ASSET = '/assets/room-placeholder.svg';
