import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { setupAdminHttp, settleAdminHttp, TEST_ROOM } from '../room-form/room-http-testing';
import { AdminRoomListComponent } from './admin-room-list';
import { AdminRoomService } from '../../services/admin-room-service';

describe('AdminRoomListComponent', () => {
  let http: HttpTestingController;
  beforeEach(async () => {
    http = await setupAdminHttp();
  });
  afterEach(() => http.verify());
  it('updates an open dialog after a concurrent business reference blocks deletion', async () => {
    const fixture = TestBed.createComponent(AdminRoomListComponent);
    await settleAdminHttp(fixture, http);
    fixture.componentInstance.selected = TEST_ROOM;
    const remove = fixture.componentInstance.handle({ action: 'delete', room: TEST_ROOM });
    http
      .expectOne('/data/rooms/' + TEST_ROOM.id)
      .flush({ code: 'ROOM_HAS_ACTIVE_FLOW' }, { status: 409, statusText: 'Conflict' });
    await remove;
    expect(fixture.componentInstance.selected?.hasActiveFlow).toBe(true);
    expect(TestBed.inject(AdminRoomService).get(TEST_ROOM.id)?.hasActiveFlow).toBe(true);
    expect(fixture.componentInstance.error).toContain('kết thúc hồ sơ');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.delete-option')).toBeNull();
  });
  it('renders using HTTP responses', async () => {
    const fixture = TestBed.createComponent(AdminRoomListComponent);
    await settleAdminHttp(fixture, http);
    expect(fixture.nativeElement.children.length).toBeGreaterThan(0);
    expect(fixture.nativeElement.querySelector('.not-found')).toBeNull();
  });
});
