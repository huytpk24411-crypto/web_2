export interface ApiPeriod {
  shiftCount?: number;
  assignmentCount?: number;
  taskCount?: number;
  canDelete?: boolean;
  id: string;
  name: string;
  weekStart: string;
  weekEnd: string;
  opensAt: string;
  closesAt: string;
  minShifts: number;
  maxShifts: number;
  status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'FINALIZED';
}
export interface ApiShift {
  id: string;
  periodId: string;
  workLocationId: string;
  date: string;
  label: string;
  startTime: string;
  endTime: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  assignedCount: number;
  status: 'OPEN' | 'CANCELLED';
}
export interface ApiAttendance {
  id: string;
  assignmentId: string;
  checkInAt: string;
  checkOutAt?: string;
  workedMinutes?: number;
  note?: string;
  evidence: { url: string; kind: 'CHECK_IN' | 'CHECK_OUT' }[];
}
export interface ApiAssignment {
  source?: string;
  id: string;
  shiftId: string;
  employeeId: string;
  registrationId: string;
  status: 'REGISTERED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'ABSENT';
  movedFromAssignmentId?: string;
  shift?: ApiShift;
  attendance?: ApiAttendance;
}
export interface ApiTaskPart {
  employeeCode?: string;
  fullName?: string;
  removed?: boolean;
  removedAt?: string;
  removedBy?: string;
  removeReason?: string;
  id: string;
  assignmentId: string;
  employeeId: string;
  personalStatus: 'TODO' | 'DONE';
  waitingAdmin?: boolean;
  transferredTo?: string;
  fromTaskAssignmentId?: string;
}
export interface TaskViewing {
  id: string;
  status: 'CHO_XAC_NHAN' | 'DA_XAC_NHAN' | 'DA_XEM' | 'DA_HUY';
  date: string;
  startTime: string;
  endTime: string;
  viewerName: string;
  peopleCount: number;
  rooms: { roomId: string; code: string; name: string }[];
}
export interface TaskUpdate {
  shiftId?: string;
  title?: string;
  description?: string;
  assigneeAssignmentIds?: string[];
}
export interface TaskCreate {
  title: string;
  description?: string;
  kind?: 'GENERAL';
  shiftId?: string;
  assigneeAssignmentIds?: string[];
}
export interface TaskReject {
  reason: string;
  viewingStartTime?: string;
  shiftId?: string;
  assigneeAssignmentIds?: string[];
}
export interface ApiTask {
  pendingConfirm?: {
    at: string;
    shift: { id: string; date: string; label: string; startsAt: string };
    employees: {
      employeeId: string;
      fullName: string;
      employeeCode: string;
      checkOutAt: string | null;
      doneAt?: string | null;
    }[];
  } | null;
  currentShift?: {
    id: string;
    date: string;
    label: string;
    startTime: string;
    endTime: string;
  } | null;
  kind?: 'GENERAL' | 'VIEWING';
  description?: string;
  viewingId?: string;
  scheduledAt?: string;
  scheduledEndAt?: string;
  viewing?: TaskViewing;
  cancelledAt?: string;
  cancelledBy?: string;
  cancelReason?: string;
  updatedAt?: string;
  updatedBy?: string;
  id: string;
  title: string;
  currentShiftId: string | null;
  status:
    | 'UNASSIGNED'
    | 'TODO'
    | 'IN_PROGRESS'
    | 'PENDING_CONFIRM'
    | 'DONE'
    | 'WAITING_ADMIN'
    | 'CANCELLED';
  shiftLinks: { id: string; shiftId: string; fromShiftId?: string; transferredAt?: string }[];
  assignees: ApiTaskPart[];
  currentAssignees: ApiTaskPart[];
}
export interface ApiShiftState {
  Shift: ApiShift[];
  ShiftAssignment: ApiAssignment[];
  Attendance: ApiAttendance[];
  WorkLocation: { id: string; name: string; address: string }[];
  Employee: {
    id: string;
    fullName: string;
    name?: string;
    employeeCode: string;
    status: 'ACTIVE' | 'ON_LEAVE' | 'INACTIVE';
  }[];
  Task: ApiTask[];
  Policy: {
    id: string;
    type: string;
    version: number;
    status: string;
    effectiveFrom: string;
    effectiveTo?: string;
  }[];
  PolicyLevel: { id: string; policyId: string; from: number; to: number | null; amount: number }[];
}
