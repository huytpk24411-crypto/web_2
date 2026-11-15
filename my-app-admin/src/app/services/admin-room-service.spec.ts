import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { AdminRoomService } from './admin-room-service';
import { setupAdminHttp, TEST_ROOM, TEST_PROPERTY } from '../admin/room-form/room-http-testing';

describe('AdminRoomService API operations', () => {
  let rooms: AdminRoomService;
  let http: HttpTestingController;
  beforeEach(async () => {
    http = await setupAdminHttp();
    rooms = TestBed.inject(AdminRoomService);
    TestBed.tick();
    const properties = rooms.loadProperties();
    http.expectOne('/data/admin/owners').flush([]);
    http.expectOne('/data/admin/properties').flush([TEST_PROPERTY]);
    await properties;
    const refresh = rooms.refresh();
    http.expectOne('/data/rooms').flush([TEST_ROOM]);
    await refresh;
  });
  afterEach(() => http.verify());
  it('retains the room and marks business history after a conflicting delete', async () => {
    const remove = rooms.remove(TEST_ROOM.id);
    const failed = expect(remove).rejects.toThrow('kết thúc hồ sơ');
    http
      .expectOne('/data/rooms/' + TEST_ROOM.id)
      .flush({ code: 'ROOM_HAS_ACTIVE_FLOW' }, { status: 409, statusText: 'Conflict' });
    await failed;
    expect(rooms.get(TEST_ROOM.id)?.hasActiveFlow).toBe(true);
    await expect(rooms.remove(TEST_ROOM.id)).rejects.toThrow('kết thúc hồ sơ');
    http.expectNone((request) => request.method === 'DELETE');
  });
  it('accepts server history flags and deletes rooms with only owned data', async () => {
    const detail = rooms.getFromApi(TEST_ROOM.id);
    http.expectOne('/data/rooms/' + TEST_ROOM.id).flush({ ...TEST_ROOM, hasActiveFlow: true });
    expect((await detail).hasActiveFlow).toBe(true);
    const refreshed = rooms.getFromApi(TEST_ROOM.id);
    http
      .expectOne('/data/rooms/' + TEST_ROOM.id)
      .flush({ ...TEST_ROOM, hasHistory: true, hasActiveFlow: false });
    await refreshed;
    const remove = rooms.remove(TEST_ROOM.id);
    http.expectOne('/data/rooms/' + TEST_ROOM.id).flush(TEST_ROOM);
    await remove;
    expect(rooms.get(TEST_ROOM.id)).toBeUndefined();
  });
  it('retains server records after failed edits and deletes', async () => {
    const save = rooms.save({ ...TEST_ROOM, name: 'Đổi tên' }, TEST_ROOM.id);
    const failed = expect(save).rejects.toThrow();
    await Promise.resolve();
    http.expectOne('/data/rooms').error(new ProgressEvent('error'));
    await failed;
    expect(rooms.get(TEST_ROOM.id)?.name).toBe(TEST_ROOM.name);
    const remove = rooms.remove(TEST_ROOM.id);
    const failedDelete = expect(remove).rejects.toThrow();
    http
      .expectOne('/data/rooms/' + TEST_ROOM.id)
      .flush({}, { status: 409, statusText: 'Conflict' });
    await failedDelete;
    expect(rooms.all()).toHaveLength(1);
  });
  it('uses the returned record and server ID for new rooms', async () => {
    const save = rooms.save({ ...TEST_ROOM, code: 'ROOM_102', number: '102' });
    await Promise.resolve();
    const request = http.expectOne('/data/rooms');
    expect(request.request.method).toBe('POST');
    request.flush({ ...request.request.body, id: 'server-id', version: 1 });
    expect((await save).id).toBe('server-id');
    expect(rooms.get('server-id')).toBeTruthy();
  });
  it('clears failed reads and returns the shared connection error', async () => {
    const refresh = rooms.refresh();
    const failed = expect(refresh).rejects.toThrow('Không kết nối được máy chủ');
    http.expectOne('/data/rooms').flush({}, { status: 500, statusText: 'Failure' });
    await failed;
    expect(rooms.list()).toEqual([]);
    expect(rooms.total()).toBe(0);
  });
  it('persists cover and order and retains them if the next save fails', async () => {
    const urls = [...TEST_ROOM.images].reverse();
    const save = rooms.saveImages(TEST_ROOM.id, urls);
    const request = http.expectOne('/data/rooms');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body.images).toEqual(urls);
    request.flush({ ...TEST_ROOM, images: urls, version: 2 });
    await save;
    expect((await rooms.getImages(TEST_ROOM.id))[0]).toMatchObject({ cover: true, url: urls[0] });
    const second = rooms.saveImages(TEST_ROOM.id, TEST_ROOM.images);
    const failed = expect(second).rejects.toThrow();
    http.expectOne('/data/rooms').error(new ProgressEvent('error'));
    await failed;
    expect(rooms.get(TEST_ROOM.id)?.images).toEqual(urls);
  });
  it('loads price history only from its API', async () => {
    const history = rooms.priceHistory(TEST_ROOM.id);
    http.expectOne('/data/rooms/' + TEST_ROOM.id + '/price-history').flush([]);
    expect(await history).toEqual([]);
  });
  it('uses server errors for forbidden history deletion and publishes through PUT', async () => {
    const publish = rooms.publish(TEST_ROOM.id);
    const request = http.expectOne('/data/rooms');
    expect(request.request.body.publicationStatus).toBe('PUBLISHED');
    request.flush({ ...TEST_ROOM, publicationStatus: 'PUBLISHED' });
    await publish;
    const hide = rooms.hide(TEST_ROOM.id);
    http.expectOne('/data/rooms').flush({ ...TEST_ROOM, publicationStatus: 'HIDDEN' });
    await hide;
    expect(rooms.get(TEST_ROOM.id)?.publicationStatus).toBe('HIDDEN');
  });
});
