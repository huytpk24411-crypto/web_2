import { TestBed } from '@angular/core/testing';
import { AuthService } from '../services/auth.service';
import { DemoStore } from '../services/demo-store.service';

/** Fixtures exercise the real frame content, including protected/receipt states. */
export function seedFrameFixture(feature: string, frame: string): void {
  const auth = TestBed.inject(AuthService);
  auth.login(
    feature === 'admin' ? 'admin123' : feature === 'employee' ? 'employee123' : 'customer123',
    '123',
  );
  const employeeId = auth.account()!.id;
  const now = new Date().toISOString();
  TestBed.inject(DemoStore).update((state) => {
    state.employeeShifts.push({
      id: 'r1',
      employeeId,
      shiftId: 'shift1',
      status: frame.includes('check-in')
        ? 'REGISTERED'
        : frame.includes('check-out')
          ? 'COMPLETED'
          : 'IN_PROGRESS',
    });
    state.attendances.push({
      id: 'attendance-test',
      employeeShiftId: 'r1',
      checkInAt: now,
      checkOutAt: frame.includes('check-out') ? now : undefined,
      evidence: '/assets/room-placeholder.svg',
      note: 'Kiểm thử',
      handover: 'Bàn giao công việc cho ca tiếp theo.',
    });
    state.tasks.push({
      id: 'task-test',
      title: 'Xác nhận lịch xem phòng',
      employeeShiftIds: ['r1'],
      assigneeIds: [employeeId, 'employee2'],
      doneBy: [],
      status: 'TODO',
    });
    state.bookings.push({
      id: 'r1',
      customerId: employeeId,
      roomId: 'r1',
      name: 'Khách kiểm thử',
      phone: '0901234567',
      amount: 1000000,
      status: 'CONFIRMED',
      paymentId: 'booking-payment',
      createdAt: now,
      expiresAt: new Date(Date.now() + 48 * 3600000).toISOString(),
    });
    state.payments.push({
      id: 'booking-payment',
      referenceId: 'r1',
      amount: 1000000,
      method: 'QR',
      status: 'CONFIRMED_DEMO',
      confirmedAt: now,
    });
    state.deposits.push({
      id: 'r1',
      roomId: 'r1',
      customerName: 'Khách kiểm thử',
      phone: '0901234567',
      total: 1800000,
      holdCredit: 0,
      due: 1800000,
      method: 'QR',
      status: 'CONFIRMED',
      paymentId: 'deposit-payment',
      createdBy: employeeId,
    });
    state.payments.push({
      id: 'deposit-payment',
      referenceId: 'r1',
      amount: 1800000,
      method: 'QR',
      status: 'CONFIRMED_DEMO',
      confirmedAt: now,
    });
    state.deals.push({
      id: 'r1',
      depositId: 'r1',
      roomId: 'r1',
      customerName: 'Khách kiểm thử',
      brokerageFee: 4200000,
      status: 'PENDING',
    });
  });
}
