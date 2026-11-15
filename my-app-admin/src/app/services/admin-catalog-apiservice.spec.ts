import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AdminCatalogAPIService } from './admin-catalog-apiservice';
import { AuthService } from './auth-service';

describe('P6 administration transport', () => {
  let api: AdminCatalogAPIService;
  let http: HttpTestingController;
  let auth: {
    account: ReturnType<typeof signal>;
    serverAuthenticated: ReturnType<typeof signal<boolean>>;
  };
  beforeEach(() => {
    auth = { account: signal({ id: 'admin', role: 'ADMIN' }), serverAuthenticated: signal(true) };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
      ],
    });
    api = TestBed.inject(AdminCatalogAPIService);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
  });
  afterEach(() => http.verify());
  it.each([
    ['owners', 'Owner', 'Chủ phòng'],
    ['properties', 'Property', 'Tòa nhà'],
    ['schools', 'School', 'Trường học'],
    ['employees', 'Employee', 'Nhân viên'],
    ['work-locations', 'WorkLocation', 'Địa điểm'],
    ['brokerage-agreements', 'BrokerageAgreement', 'Thỏa thuận'],
  ])(
    'translates referenced %s records without exposing storage details',
    async (path, resource, label) => {
      const removing = api.remove(path, 'record-test');
      const failed = expect(removing).rejects.toThrow(label);
      http.expectOne(`/data/admin/${path}/record-test`).flush(
        {
          code: 'REFERENCED_RECORD',
          resource,
          reason: 'RoomImage.roomId còn tham chiếu record-test',
        },
        { status: 409, statusText: 'Conflict' },
      );
      await failed;
      expect(api.error()).not.toContain('RoomImage');
      expect(api.error()).not.toContain('roomId');
      expect(api.error()).not.toContain('record-test');
    },
  );
  it('hides technical details from unrecognized API errors', async () => {
    const reading = api.list('owners');
    const failed = expect(reading).rejects.toThrow('Vui lòng');
    http
      .expectOne('/data/admin/owners')
      .flush(
        {
          code: 'UNRECOGNIZED_ERROR',
          reason: 'Owner.id còn tham chiếu owner-test',
          message: 'collection Owner failed',
        },
        { status: 400, statusText: 'Bad Request' },
      );
    await failed;
    expect(api.error()).not.toContain('Owner');
    expect(api.error()).not.toContain('owner-test');
  });
  it('preserves the room-history code while showing a friendly error', async () => {
    const removing = api.write('DELETE', '/data/rooms/room-test');
    const failed = expect(removing).rejects.toMatchObject({
      status: 409,
      code: 'ROOM_HAS_HISTORY',
      message: expect.stringContaining('ẩn tin'),
    });
    http
      .expectOne('/data/rooms/room-test')
      .flush({ code: 'ROOM_HAS_HISTORY' }, { status: 409, statusText: 'Conflict' });
    await failed;
  });
  it('translates contract-type validation errors', async () => {
    const saving = api.save('employees', { contractType: 'OTHER' }, 'employee-test');
    const failed = expect(saving).rejects.toThrow('Toàn thời gian, Bán thời gian hoặc Thực tập');
    http
      .expectOne('/data/admin/employees/employee-test')
      .flush({ code: 'INVALID_CONTRACT_TYPE' }, { status: 400, statusText: 'Bad Request' });
    await failed;
  });
  it('rejects disconnected reads and retains permission errors', async () => {
    const denied = api.list('owners');
    const rejection = expect(denied).rejects.toThrow('quyền');
    http.expectOne('/data/admin/owners').flush({}, { status: 403, statusText: 'Forbidden' });
    await rejection;
    expect(api.online()).toBe(true);
    const disconnected = api.list('owners');
    const failed = expect(disconnected).rejects.toThrow('Không kết nối được máy chủ');
    http.expectOne('/data/admin/owners').flush('', { status: 502, statusText: 'Bad Gateway' });
    await failed;
    const retry = api.list('owners');
    http.expectOne('/data/admin/owners').flush([]);
    expect(await retry).toEqual([]);
  });
  it('retries an uncertain employee create with the same idempotency key and temporary password', async () => {
    const input = { fullName: 'Employee', phone: '0912345678' };
    const first = api.save('employees', input),
      rejection = expect(first).rejects.toThrow();
    const request = http.expectOne('/data/admin/employees');
    const key = request.request.headers.get('Idempotency-Key'),
      body = request.request.body;
    expect(body.temporaryPassword.length).toBeGreaterThanOrEqual(8);
    request.error(new ProgressEvent('error'));
    await rejection;
    expect(api.online()).toBe(true);
    const repeated = api.save('employees', input),
      replay = http.expectOne('/data/admin/employees');
    expect(replay.request.headers.get('Idempotency-Key')).toBe(key);
    expect(replay.request.body).toEqual(body);
    replay.flush({
      employee: { id: 'nv-new' },
      phone: input.phone,
      temporaryPassword: body.temporaryPassword,
    });
    await repeated;
  });
  it('rejects a disconnected read after an uncertain write', async () => {
    const saving = api.save('owners', { fullName: 'Owner' }),
      rejection = expect(saving).rejects.toThrow();
    http.expectOne('/data/admin/owners').error(new ProgressEvent('error'));
    await rejection;
    const read = api.list('owners'),
      failedRead = expect(read).rejects.toThrow();
    http.expectOne('/data/admin/owners').flush('', { status: 504, statusText: 'Gateway Timeout' });
    await failedRead;
    expect(api.online()).toBe(true);
  });
  it('filters and pages audit reads with credentials and encodes identifiers as one path segment', async () => {
    const read = api.audit({
      entityType: 'Room',
      actorId: 'admin',
      page: 2,
      limit: 20,
      from: '',
      to: '',
    });
    const request = http.expectOne('/audit-logs?entityType=Room&actorId=admin&page=2&limit=20');
    expect(request.request.withCredentials).toBe(true);
    request.flush({ items: [], page: 2, limit: 20, total: 0, pages: 1 });
    await read;
    const detail = api.detail('owners', 'a/b');
    http.expectOne('/data/admin/owners/a%2Fb').flush({ id: 'a/b' });
    await detail;
  });
});
