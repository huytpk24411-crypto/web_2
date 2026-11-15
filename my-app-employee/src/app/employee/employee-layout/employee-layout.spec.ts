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
});
