import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { setupAdminHttp, settleAdminHttp, TEST_ROOM } from '../room-form/room-http-testing';
import { AdminRoomEditComponent } from './admin-room-edit';

describe('AdminRoomEditComponent', () => {
  let http: HttpTestingController;
  beforeEach(async () => {
    http = await setupAdminHttp();
  });
  afterEach(() => http.verify());
  it('renders using HTTP responses', async () => {
    const fixture = TestBed.createComponent(AdminRoomEditComponent);
    await settleAdminHttp(fixture, http);
    expect(fixture.nativeElement.children.length).toBeGreaterThan(0);
    expect(fixture.nativeElement.querySelector('.not-found')).toBeNull();
  });
});
