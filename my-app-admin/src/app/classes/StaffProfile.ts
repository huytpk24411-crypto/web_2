import { ApiTaskPart, TaskViewing } from './ShiftApi';

export type StaffStatus = 'ACTIVE' | 'ON_LEAVE' | 'INACTIVE';

export interface StaffProfile {
  accountId?: string;
  baseSalary?: number | null;
  archivedAt?: string;
  id: string;
  employeeCode: string;
  fullName: string;
  birthDate: string;
  gender: 'FEMALE' | 'MALE' | 'OTHER';
  phone: string;
  email: string;
  position: string;
  workLocationId: string;
  startDate: string;
  contractType: string;
  status: StaffStatus;
  avatar: string;
}

export interface WorkLocation {
  id: string;
  name: string;
  address: string;
}

export interface RegistrationPeriod {
  weekEnd?: string;
  shiftCount?: number;
  assignmentCount?: number;
  taskCount?: number;
  canDelete?: boolean;
  status?: 'DRAFT' | 'OPEN' | 'CLOSED' | 'FINALIZED';
  id: string;
  name: string;
  weekStart: string;
  opensAt: string;
  closesAt: string;
  maxEmployeesPerShift: number;
}

export interface StaffShift {
  startsAt?: string;
  endsAt?: string;
  status?: 'OPEN' | 'CANCELLED';
  vacanciesToReassign?: number;
  id: string;
  periodId: string;
  workLocationId: string;
  date: string;
  label: string;
  start: string;
  end: string;
  capacity: number;
  needsReassignment?: boolean;
}

export interface ShiftAssignment {
  source?: string;
  movedFromAssignmentId?: string;
  id: string;
  employeeId: string;
  shiftId: string;
  status: 'REGISTERED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'ABSENT';
}

export interface ShiftTask {
  transferCount?: number;
  kind?: 'GENERAL' | 'VIEWING';
  description?: string;
  viewingId?: string;
  scheduledAt?: string;
  scheduledEndAt?: string;
  viewing?: TaskViewing;
  currentAssignees?: ApiTaskPart[];
  transfers?: {
    fromShiftId: string;
    toShiftId: string;
    at: string;
    previousAssigneeIds: string[];
  }[];
  id: string;
  title: string;
  originShiftId: string;
  currentShiftId: string;
  assigneeIds: string[];
  doneBy: string[];
  status:
    | 'UNASSIGNED'
    | 'TODO'
    | 'IN_PROGRESS'
    | 'PENDING_CONFIRM'
    | 'DONE'
    | 'WAITING_ADMIN'
    | 'CANCELLED';
  needsReassignment?: boolean;
}

export interface StaffAttendance {
  id: string;
  assignmentId: string;
  checkInAt: string;
  checkOutAt?: string;
}
