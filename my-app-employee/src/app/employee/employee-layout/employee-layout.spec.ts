import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../services/auth-service';
import { EmployeeLayoutComponent } from './employee-layout';
import { employeeHttpTest } from '../employee-http-testing';

describe('EmployeeLayoutComponent profile and notifications', () => {
  it('reads its own profile and uses server notification counts', async () => {
    const { fixture, http } = await employeeHttpTest(EmployeeLayoutComponent);
    expect(fixture.componentInstance.employee?.position).toBe('Tư vấn');
    expect(fixture.nativeElement.querySelector('.employee-footer a')).toBeNull();
    expect(fixture.nativeElement.querySelector('.employee-footer').textContent).toContain(
      'Bảo lưu mọi quyền.',
    );
    expect(fixture.componentInstance.notifications.unread()).toBe(0);
    const loading = fixture.componentInstance.notifications.refresh();
    http
      .expectOne('/notifications')
      .flush(
        JSON.stringify([{ id: 'notice-a', title: 'Lịch ca', body: 'Đã cập nhật', read: false }]),
      );
    await loading;
    expect(fixture.componentInstance.notifications.unread()).toBe(1);
    http.verify();
    fixture.destroy();
  });
  it('hides the previous profile when the account changes', async () => {
    const { fixture, http } = await employeeHttpTest(EmployeeLayoutComponent);
    const auth = TestBed.inject(AuthService);
    (auth.account as unknown as { set(value: unknown): void }).set({
      id: 'account-b',
      role: 'EMPLOYEE',
    });
    expect(fixture.componentInstance.employee).toBeNull();
    http.verify();
    fixture.destroy();
  });
  it('opens notification cards under the bell and closes on Escape or outside click', async () => {
    const { fixture, http } = await employeeHttpTest(EmployeeLayoutComponent);
    const bell = fixture.nativeElement.querySelector('.employee-notification') as HTMLButtonElement;
    bell.click();
    fixture.detectChanges();
    http.expectOne('/notifications').flush(
      JSON.stringify([
        {
          id: 'notice-a',
          type: 'P3_ACTIVE',
          entityType: 'Hold',
          title: 'Hold: ACTIVE',
          body: 'Hold internal-id: ACTIVE',
          read: false,
          createdAt: '2026-11-17T01:00:00Z',
        },
      ]),
    );
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    const panel = fixture.nativeElement.querySelector(
      '.employee-notifications .notification-panel',
    );
    expect(panel).not.toBeNull();
    expect(fixture.nativeElement.querySelector('main .notification-panel')).toBeNull();
    expect(panel.textContent).toContain('Giữ chỗ phòng');
    expect(panel.textContent).not.toContain('internal-id');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.notificationOpen()).toBe(false);
    bell.click();
    http.expectOne('/notifications').flush('[]');
    document.body.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.notificationOpen()).toBe(false);
    http.verify();
    fixture.destroy();
  });
});
