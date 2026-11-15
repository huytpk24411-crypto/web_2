import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { setupAdminHttp, settleAdminHttp, TEST_EMPLOYEE } from '../room-form/room-http-testing';
import { StaffFormComponent } from './staff-form';
import { StaffService } from '../../services/staff-service';

describe('Staff contract selection', () => {
  let http: HttpTestingController;
  beforeEach(async () => {
    http = await setupAdminHttp();
  });
  afterEach(() => http.verify());

  it('renders exactly three fixed contract values with Vietnamese labels', async () => {
    const fixture = TestBed.createComponent(StaffFormComponent);
    await settleAdminHttp(fixture, http);
    const select = fixture.nativeElement.querySelector(
      'select[name="contractType"]',
    ) as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(
      Array.from(select.options)
        .filter((option) => option.value)
        .map((option) => [option.value, option.textContent?.trim()]),
    ).toEqual([
      ['FULL_TIME', 'Toàn thời gian'],
      ['PART_TIME', 'Bán thời gian'],
      ['INTERNSHIP', 'Thực tập'],
    ]);
    expect(fixture.nativeElement.querySelector('input[name="contractType"]')).toBeNull();
  });

  it('rejects unsupported values before sending employee data', async () => {
    const fixture = TestBed.createComponent(StaffFormComponent);
    await settleAdminHttp(fixture, http);
    const { id, employeeCode, ...profile } = TestBed.inject(StaffService).employee(
      TEST_EMPLOYEE.id,
    )!;
    fixture.componentInstance.form = { ...profile, contractType: 'OTHER' };
    await fixture.componentInstance.saveEmployee();
    expect(fixture.componentInstance.validContractType).toBe(false);
    expect(fixture.componentInstance.error).toContain('Vui lòng kiểm tra');
    http.expectNone((request) => request.method !== 'GET');
  });
});
