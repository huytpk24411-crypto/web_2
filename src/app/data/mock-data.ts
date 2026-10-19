import { Account, Employee, PayrollSlip, Property, Shift, ShiftPeriod } from '../models/domain';
import { ASSETS } from './assets';
export const DEMO_ACCOUNTS: Account[] = [
  {
    id: 'customer1',
    username: 'customer123',
    name: 'Nguyễn Trần Anh Tú',
    role: 'CUSTOMER',
    phone: '0901234567',
  },
  {
    id: 'employee1',
    username: 'employee123',
    name: 'Tăng Khả Ái',
    role: 'EMPLOYEE',
    phone: '0909876543',
  },
  {
    id: 'admin1',
    username: 'admin123',
    name: 'Nguyễn Tuấn Kiệt',
    role: 'ADMIN',
    phone: '0901122334',
  },
];
// Demo credential only; never store user-entered passwords in browser storage.
export const DEMO_PASSWORD = '123';
export { PROPERTIES } from './properties';
export const SHIFT_PERIOD: ShiftPeriod = {
  id: 'week1',
  label: 'Tuần demo 12–18/10/2026',
  maxPerEmployee: 7,
};
export function createShifts(): Shift[] {
  // A fixed demo period keeps the meaning of shift IDs stable across reloads/weeks.
  // The production schedule must come from a versioned ShiftPeriod API.
  const today = new Date('2026-10-12T12:00:00+07:00');
  return Array.from({ length: 14 }, (_, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() + Math.floor(i / 2));
    return {
      id: `shift${i + 1}`,
      periodId: 'week1',
      date: date.toISOString().slice(0, 10),
      label: i % 2 ? 'Ca chiều' : 'Ca sáng',
      start: i % 2 ? '13:30' : '08:30',
      end: i % 2 ? '17:30' : '12:00',
      capacity: 4,
      occupied: i === 5 ? 4 : i % 3,
    };
  });
}
export const SHIFTS = createShifts();
export const STAFF: Employee[] = [
  'Tăng Khả Ái',
  'Trần Quốc Dũng',
  'Lê Hoàng Nam',
  'Nguyễn Thùy Linh',
  'Vũ Minh Khang',
  'Hoàng Thùy Dương',
].map((name, i) => ({
  id: `employee${i + 1}`,
  accountId: `employee${i + 1}`,
  name,
  position: i === 0 ? 'Chuyên viên tư vấn' : 'Chuyên viên môi giới',
  phone: `090123456${i}`,
  avatar: ASSETS.staff[i] || ASSETS.avatar,
}));
export const PAYROLL: PayrollSlip[] = [
  {
    id: 'pay1',
    employeeId: 'employee1',
    periodId: '2026-10',
    base: 5000000,
    allowance: 1500000,
    brokerageRevenue: 28300000,
    commissionRate: 0.4,
    bonus: 500000,
    deduction: 680000,
  },
  {
    id: 'pay2',
    employeeId: 'employee1',
    periodId: '2026-09',
    base: 5000000,
    allowance: 1500000,
    brokerageRevenue: 22400000,
    commissionRate: 0.35,
    bonus: 300000,
    deduction: 100000,
  },
];
