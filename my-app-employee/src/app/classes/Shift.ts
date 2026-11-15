export interface ShiftPeriod {
  id: string;
  label: string;
  maxPerEmployee: number;
}

export interface Shift {
  id: string;
  periodId: string;
  date: string;
  label: string;
  start: string;
  end: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  occupied: number;
}

export interface EmployeeShift {
  id: string;
  employeeId: string;
  shiftId: string;
  status: 'REGISTERED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'ABSENT';
}
