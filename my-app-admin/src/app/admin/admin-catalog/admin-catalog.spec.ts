import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { setupAdminHttp, settleAdminHttp } from '../room-form/room-http-testing';
import { AdminCatalogComponent } from './admin-catalog';

describe('Admin catalog API writes', () => {
  let http: HttpTestingController;
  beforeEach(async () => {
    http = await setupAdminHttp({ section: 'owners' });
  });
  afterEach(() => http.verify());
  it('retains the form after a failed save without adding a record', async () => {
    const fixture = TestBed.createComponent(AdminCatalogComponent);
    await settleAdminHttp(fixture, http);
    await fixture.componentInstance.edit();
    fixture.componentInstance.form.patchValue({
      fullName: 'Chủ phòng kiểm thử',
      phone: '0901234567',
    });
    const save = fixture.componentInstance.save();
    http.expectOne('/data/admin/owners').error(new ProgressEvent('error'));
    await save;
    expect(fixture.componentInstance.editing).toBeNull();
    expect(fixture.componentInstance.rows()).toEqual([]);
    expect(fixture.componentInstance.toast()).toBe('');
    expect(fixture.componentInstance.error()).toContain('Không kết nối được máy chủ');
  });
  it('does not remove a referenced record after an API rejection', async () => {
    const fixture = TestBed.createComponent(AdminCatalogComponent);
    await settleAdminHttp(fixture, http);
    const owner = { id: 'owner-test', fullName: 'Chủ phòng kiểm thử' };
    fixture.componentInstance.rows.set([owner]);
    fixture.componentInstance.confirm('delete', owner);
    const remove = fixture.componentInstance.performAction();
    http
      .expectOne('/data/admin/owners/owner-test')
      .flush({ code: 'RECORD_REFERENCED' }, { status: 409, statusText: 'Conflict' });
    await remove;
    expect(fixture.componentInstance.rows()).toEqual([owner]);
    expect(fixture.componentInstance.action?.record.id).toBe(owner.id);
  });
  it('shows work locations without active flags as active and honors P6 deactivation', async () => {
    const fixture = TestBed.createComponent(AdminCatalogComponent);
    await settleAdminHttp(fixture, http);
    const component = fixture.componentInstance;
    component.section = 'work-locations';
    expect(component.status({ id: 'office' })).toBe('Hoạt động');
    expect(component.status({ id: 'office', active: false })).toBe('Ngừng hoạt động');
  });
});
