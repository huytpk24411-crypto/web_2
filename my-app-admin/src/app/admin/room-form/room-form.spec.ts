import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { setupAdminHttp, settleAdminHttp, TEST_ROOM } from './room-http-testing';
import { RoomFormComponent } from './room-form';

describe('RoomFormComponent', () => {
  let http: HttpTestingController;
  beforeEach(async () => {
    http = await setupAdminHttp();
  });
  afterEach(() => http.verify());
  it('renders using HTTP responses', async () => {
    const fixture = TestBed.createComponent(RoomFormComponent);
    await settleAdminHttp(fixture, http);
    expect(fixture.nativeElement.children.length).toBeGreaterThan(0);
    expect(fixture.nativeElement.querySelector('.not-found')).toBeNull();
    const option = fixture.nativeElement.querySelector(
      'select[formControlName="type"] option[value="CAN_HO"]',
    );
    expect(option.textContent.trim()).toBe('Căn hộ');
    expect(option.value).toBe('CAN_HO');
  });
  it('defaults the deposit to one month rent until the admin edits it', async () => {
    const fixture = TestBed.createComponent(RoomFormComponent);
    await settleAdminHttp(fixture, http);
    const form = fixture.componentInstance.form;
    expect(form.controls.management.value).toBe(150000);
    form.controls.price.setValue(5000000);
    expect(form.controls.deposit.value).toBe(5000000);
    form.controls.deposit.markAsDirty();
    form.controls.deposit.setValue(3000000);
    form.controls.price.setValue(6000000);
    expect(form.controls.deposit.value).toBe(3000000);
    expect(fixture.componentInstance.amenities).toContain('Wifi');
    expect(fixture.componentInstance.types).toContain('PHONG_TRO');
  });
});
