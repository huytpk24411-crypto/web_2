import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { StaffShiftAdjustmentComponent } from './staff-shift-adjustment';
import { StaffService } from '../../services/staff-service';
import {
  setupAdminHttp,
  settleAdminHttp,
  EMPTY_SHIFT_STATE,
  TEST_EMPLOYEE,
} from '../room-form/room-http-testing';

const shifts = ['source', 'target'].map((id, index) => ({
  id,
  periodId: 'period',
  workLocationId: 'location',
  date: '2099-01-05',
  startTime: index ? '13:00' : '07:00',
  endTime: index ? '17:00' : '11:00',
  startsAt: index ? '2099-01-05T06:00:00Z' : '2099-01-05T00:00:00Z',
  endsAt: index ? '2099-01-05T10:00:00Z' : '2099-01-05T04:00:00Z',
  capacity: 6,
  assignedCount: index ? 0 : 1,
  label: id,
  status: 'OPEN',
}));
describe('Staff shift adjustment over P4', () => {
  let http: HttpTestingController;
  beforeEach(async () => {
    http = await setupAdminHttp();
  });
  afterEach(() => http.verify());
  async function create() {
    const fixture = TestBed.createComponent(StaffShiftAdjustmentComponent);
    fixture.componentRef.setInput('shiftId', 'source');
    await settleAdminHttp(fixture, http);
    const repository = TestBed.inject(StaffService);
    const refresh = repository.shiftApi.refresh();
    http.expectOne('/data/admin/registration-periods').flush([]);
    http.expectOne('/data/admin/shift-state').flush({
      ...EMPTY_SHIFT_STATE,
      Shift: shifts,
      Employee: [TEST_EMPLOYEE],
      ShiftAssignment: [
        {
          id: 'assignment',
          employeeId: TEST_EMPLOYEE.id,
          shiftId: 'source',
          status: 'REGISTERED',
          registrationId: 'registration',
        },
      ],
    });
    await refresh;
    TestBed.tick();
    fixture.componentInstance.assignmentId = 'assignment';
    fixture.componentInstance.targetId = 'target';
    return fixture;
  }
  it('preserves the source assignment if the server rejects a full target', async () => {
    const fixture = await create();
    const save = fixture.componentInstance.save();
    const request = http.expectOne('/data/admin/shift-assignments/assignment/move');
    expect(request.request.body).toEqual({ toShiftId: 'target' });
    request.flush({ code: 'SHIFT_FULL' }, { status: 409, statusText: 'Conflict' });
    await save;
    expect(fixture.componentInstance.success).toBe(false);
    expect(TestBed.inject(StaffService).activeAssignments('source')).toHaveLength(1);
    expect(fixture.componentInstance.error).toBeTruthy();
  });
  it('accepts a move only after the P4 write and refresh return', async () => {
    const fixture = await create();
    const save = fixture.componentInstance.save();
    http.expectOne('/data/admin/shift-assignments/assignment/move').flush({ id: 'replacement' });
    for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(fixture.componentInstance.success).toBe(false);
    http.expectOne('/data/admin/registration-periods').flush([]);
    http.expectOne('/data/admin/shift-state').flush({
      ...EMPTY_SHIFT_STATE,
      Shift: shifts,
      ShiftAssignment: [
        { id: 'assignment', employeeId: TEST_EMPLOYEE.id, shiftId: 'source', status: 'CANCELLED' },
        {
          id: 'replacement',
          employeeId: TEST_EMPLOYEE.id,
          shiftId: 'target',
          status: 'REGISTERED',
          movedFromAssignmentId: 'assignment',
        },
      ],
    });
    await save;
    TestBed.tick();
    expect(fixture.componentInstance.success).toBe(true);
    expect(TestBed.inject(StaffService).activeAssignments('target')[0].movedFromAssignmentId).toBe(
      'assignment',
    );
  });
});
