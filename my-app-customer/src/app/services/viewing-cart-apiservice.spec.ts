import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth-service';
import { ViewingCartAPIService } from './viewing-cart-apiservice';
import { ViewingService } from './viewing-service';
import { RoomService } from './room-service';
import { API_ACCOUNT, API_ROOMS } from '../testing/api-fixtures';
import { ViewingOut } from '../classes/Viewing';

describe('VIEW-API: cart, availability, checkout, update, delete', () => {
  let http: HttpTestingController, viewings: ViewingService, auth: AuthService;
  const details = {
    viewerName: API_ACCOUNT.name,
    viewerPhone: API_ACCOUNT.phone!,
    peopleCount: 1,
    note: 'Gọi trước',
    items: [
      { roomId: 'phong-48', date: '2099-11-17', startTime: '08:00' },
      { roomId: 'phong-49', date: '2099-11-17', startTime: '08:30' },
    ],
  };
  const guide = {
    employeeId: 'nv-1',
    employeeCode: 'NV001',
    fullName: 'Nhân viên kiểm thử',
    phone: '0901234568',
  };
  const record: ViewingOut = {
    id: 'viewing-test',
    bookingId: 'dl-test',
    viewerName: details.viewerName,
    viewerPhone: details.viewerPhone,
    date: '2099-11-17',
    startTime: '08:00',
    startAt: '2099-11-17T08:00:00+07:00',
    note: details.note,
    status: 'DA_XAC_NHAN',
    rooms: [{ roomId: 'phong-48' }],
    guide,
    canEdit: true,
    roomsInfo: [
      {
        roomId: 'phong-48',
        code: 'PHONG_48',
        name: 'Phòng từ API',
        address: 'Địa chỉ API',
        price: 4800000,
        image: '/room.jpg',
      },
    ],
  };
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: RoomService,
          useValue: { get: (id: string) => API_ROOMS.find((room) => room.id === id) },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    auth.account.set(API_ACCOUNT);
    auth.serverAuthenticated.set(true);
    viewings = TestBed.inject(ViewingService);
  });
  afterEach(() => http.verify());

  it('thêm/đọc/xóa ID giỏ có encode và cookie', async () => {
    const added = viewings.addToCart('phong-48');
    const add = http.expectOne('/viewing-cart/add');
    expect(add.request.body).toEqual({ roomId: 'phong-48' });
    expect(add.request.withCredentials).toBe(true);
    add.flush('["phong-48"]');
    await added;
    const cart = viewings.getCart();
    http.expectOne('/viewing-cart').flush('["phong-48"]');
    expect(await cart).toEqual(['phong-48']);
    TestBed.inject(ViewingCartAPIService).remove('a/b').subscribe();
    const remove = http.expectOne('/viewing-cart/a%2Fb');
    expect(remove.request.method).toBe('DELETE');
    remove.flush('[]');
  });

  it.each([undefined, 'viewing/a'])(
    'A1 gửi date và excludeViewingId=%s có cookie',
    async (exclude) => {
      const pending = viewings.availability('2099-11-17', exclude);
      const request = http.expectOne((req) => req.url === '/viewings/availability');
      expect(request.request.method).toBe('GET');
      expect(request.request.withCredentials).toBe(true);
      expect(request.request.params.get('date')).toBe('2099-11-17');
      expect(request.request.params.get('excludeViewingId')).toBe(exclude ?? null);
      const response = {
        date: '2099-11-17',
        slots: [{ time: '08:00', available: false, reason: 'NO_STAFF' }],
      };
      request.flush(response);
      expect(await pending).toEqual(response);
    },
  );

  it('A2 gửi chính xác items theo thứ tự, giữ phòng chưa chọn trong giỏ, map từng lịch và guide', async () => {
    const pending = viewings.schedule(details);
    http.expectOne('/viewing-cart').flush('["phong-50","phong-48"]');
    await Promise.resolve();
    await Promise.resolve();
    const add = http.expectOne('/viewing-cart/add');
    expect(add.request.body).toEqual({ roomId: 'phong-49' });
    add.flush('["phong-50","phong-48","phong-49"]');
    await Promise.resolve();
    const request = http.expectOne('/viewing-cart/checkout');
    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.body).toEqual(details);
    request.flush(
      JSON.stringify({
        bookingId: 'dl-test',
        viewings: [
          record,
          { ...record, id: 'viewing-2', rooms: [{ roomId: 'phong-49' }], guide: null },
        ],
      }),
    );
    const result = await pending;
    expect(result.bookingId).toBe('dl-test');
    expect(result.viewings.map((v) => v.id)).toEqual(['viewing-test', 'viewing-2']);
    expect(result.viewings[0]).toMatchObject({
      guide,
      roomsInfo: record.roomsInfo,
      bookingId: 'dl-test',
      canEdit: true,
      serverStatus: 'DA_XAC_NHAN',
      name: details.viewerName,
      phone: details.viewerPhone,
    });
    expect(result.viewings[1].guide).toBeNull();
    http.expectNone((req) => req.method === 'DELETE');
    expect(viewings.list()).toEqual([]);
  });

  it.each([false, true])(
    'A2 lỗi 409 giữ message và roomId, body chuỗi=%s; không tạo local/retry',
    async (asString) => {
      const pending = viewings.schedule(details);
      const rejected = expect(pending).rejects.toMatchObject({
        message: 'Thông báo tranh chấp máy chủ',
        status: 409,
        code: 'SLOT_NO_STAFF',
        roomId: 'phong-49',
      });
      http.expectOne('/viewing-cart').flush('["phong-48","phong-49"]');
      await Promise.resolve();
      await Promise.resolve();
      const body = {
        code: 'SLOT_NO_STAFF',
        message: 'Thông báo tranh chấp máy chủ',
        roomId: 'phong-49',
      };
      http
        .expectOne('/viewing-cart/checkout')
        .flush(asString ? JSON.stringify(body) : body, { status: 409, statusText: 'Conflict' });
      await rejected;
      expect(viewings.list()).toEqual([]);
      http.expectNone('/viewing-cart/checkout');
    },
  );

  it('A3 map đủ trường mới, lịch cũ nhiều phòng/snapshot và ẩn khi đổi tài khoản', async () => {
    const loaded = viewings.refreshMine();
    http.expectOne('/viewings/mine').flush([
      record,
      {
        ...record,
        id: 'legacy',
        viewerName: undefined,
        viewerPhone: undefined,
        visitorName: 'Tên lịch cũ',
        visitorPhone: '0901234569',
        canEdit: false,
        guide: null,
        rooms: [
          { roomId: 'phong-48' },
          {
            roomId: 'deleted-room',
            roomSnapshot: {
              code: 'OLD',
              name: 'Phòng đã xóa',
              address: 'Địa chỉ cũ',
              monthlyRent: 3000000,
            },
          },
        ],
      },
    ]);
    await loaded;
    expect(viewings.list()[0]).toMatchObject({
      bookingId: 'dl-test',
      serverStatus: 'DA_XAC_NHAN',
      canEdit: true,
      guide,
      roomsInfo: record.roomsInfo,
    });
    expect(viewings.list()[1]).toMatchObject({
      name: 'Tên lịch cũ',
      phone: '0901234569',
      roomIds: ['phong-48', 'deleted-room'],
      canEdit: false,
      guide: null,
      roomSnapshots: { 'deleted-room': { code: 'OLD' } },
    });
    auth.account.set({ ...API_ACCOUNT, id: 'other' });
    expect(viewings.list()).toEqual([]);
  });

  it('A4 PUT đúng body và cookie, trả nhân viên mới từ API', async () => {
    const body = { date: '2099-11-18', startTime: '13:00', note: 'Ghi chú sửa' };
    const pending = viewings.update('viewing/a', body);
    const request = http.expectOne('/viewings/viewing%2Fa');
    expect(request.request.method).toBe('PUT');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.body).toEqual(body);
    request.flush({
      ...record,
      date: body.date,
      startTime: body.startTime,
      startAt: '2099-11-18T13:00:00+07:00',
      note: body.note,
      guide: { ...guide, employeeId: 'nv-2' },
    });
    expect(await pending).toMatchObject({
      at: '2099-11-18T13:00:00+07:00',
      note: body.note,
      guide: { employeeId: 'nv-2' },
    });
  });

  it('A5 DELETE đúng endpoint và cookie', async () => {
    const pending = viewings.remove('viewing/a');
    const request = http.expectOne('/viewings/viewing%2Fa');
    expect(request.request.method).toBe('DELETE');
    expect(request.request.withCredentials).toBe(true);
    request.flush({ deleted: true, id: 'viewing/a' });
    await pending;
  });

  it.each(['update', 'remove'] as const)('%s lỗi giữ message server', async (action) => {
    const pending =
      action === 'update'
        ? viewings.update('viewing-test', { note: 'Mới' })
        : viewings.remove('viewing-test');
    const rejected = expect(pending).rejects.toMatchObject({
      status: 409,
      message: 'Lịch xem đã qua hoặc không còn hoạt động, không thể thay đổi.',
    });
    http.expectOne('/viewings/viewing-test').flush(
      {
        code: 'VIEWING_LOCKED',
        message: 'Lịch xem đã qua hoặc không còn hoạt động, không thể thay đổi.',
      },
      { status: 409, statusText: 'Conflict' },
    );
    await rejected;
  });

  it('chặn giờ trùng, giờ quá khứ, ngoài ca và sai tài khoản trước khi gọi API', async () => {
    await expect(
      viewings.schedule({
        ...details,
        items: [{ ...details.items[0] }, { ...details.items[1], startTime: '08:00' }],
      }),
    ).rejects.toThrow('Bạn đã có lịch xem khác vào giờ này');
    await expect(
      viewings.schedule({ ...details, items: [{ ...details.items[0], date: '2000-01-01' }] }),
    ).rejects.toThrow('tương lai');
    await expect(
      viewings.schedule({ ...details, items: [{ ...details.items[0], startTime: '11:00' }] }),
    ).rejects.toThrow('Giờ xem phải bắt đầu');
    await expect(viewings.addToCart('missing')).rejects.toThrow('không còn trống');
    auth.account.set(null);
    await expect(viewings.addToCart('phong-48')).rejects.toThrow('đăng nhập');
    http.expectNone(() => true);
  });
});
