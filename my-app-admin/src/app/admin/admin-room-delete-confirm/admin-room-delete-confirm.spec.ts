import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { setupAdminHttp, settleAdminHttp, TEST_ROOM } from '../room-form/room-http-testing';
import { AdminRoomDeleteConfirmComponent } from './admin-room-delete-confirm';

describe('AdminRoomDeleteConfirmComponent', () => {
  let http: HttpTestingController;
  beforeEach(async () => {
    http = await setupAdminHttp();
  });
  afterEach(() => http.verify());
  it('blocks deletion only while the server flags an active flow', async () => {
    const fixture = TestBed.createComponent(AdminRoomDeleteConfirmComponent);
    fixture.componentRef.setInput('room', TEST_ROOM);
    await settleAdminHttp(fixture, http);
    fixture.componentInstance.choice = 'delete';
    fixture.componentRef.setInput('room', { ...TEST_ROOM, hasActiveFlow: true });
    fixture.detectChanges();
    expect(fixture.componentInstance.choice).toBe('hide');
    expect(fixture.nativeElement.querySelector('.delete-option')).toBeNull();
    expect(fixture.nativeElement.querySelector('.history-note').textContent).toContain(
      'Hãy kết thúc hồ sơ',
    );
    const confirmed = vi.fn();
    fixture.componentInstance.confirmed.subscribe(confirmed);
    fixture.componentInstance.confirm('delete');
    expect(confirmed).not.toHaveBeenCalled();
    fixture.componentInstance.confirm('hide');
    expect(confirmed).toHaveBeenCalledWith({
      action: 'hide',
      room: expect.objectContaining({ hasActiveFlow: true }),
    });
  });
  it('allows deletion when only ended history remains', async () => {
    const fixture = TestBed.createComponent(AdminRoomDeleteConfirmComponent);
    fixture.componentRef.setInput('room', { ...TEST_ROOM, hasHistory: true, hasActiveFlow: false });
    await settleAdminHttp(fixture, http);
    expect(fixture.nativeElement.querySelector('.delete-option')).not.toBeNull();
    const confirmed = vi.fn();
    fixture.componentInstance.confirmed.subscribe(confirmed);
    fixture.componentInstance.confirm('delete');
    expect(confirmed).toHaveBeenCalledWith({
      action: 'delete',
      room: expect.objectContaining({ hasHistory: true }),
    });
  });
  it('renders using HTTP responses', async () => {
    const fixture = TestBed.createComponent(AdminRoomDeleteConfirmComponent);
    fixture.componentRef.setInput('room', TEST_ROOM);
    await settleAdminHttp(fixture, http);
    expect(fixture.nativeElement.children.length).toBeGreaterThan(0);
    expect(fixture.nativeElement.querySelector('.not-found')).toBeNull();
  });
});
