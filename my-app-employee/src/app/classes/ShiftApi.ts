export interface ApiPeriod {
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
  id: string;
  shiftId: string;
  employeeId: string;
  registrationId: string;
  status: 'REGISTERED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'ABSENT';
  movedFromAssignmentId?: string;
  shift?: ApiShift;
  attendance?: ApiAttendance;
  taskCount?: number;
  openTaskCount?: number;
  canCheckIn?: boolean;
}
export interface ApiTaskPart {
  id: string;
  assignmentId: string;
  employeeId: string;
  personalStatus: 'TODO' | 'DONE';
  waitingAdmin?: boolean;
  removed?: boolean;
  removeReason?: 'REASSIGN' | 'ADMIN_EDIT';
  transferredTo?: string;
  fromTaskAssignmentId?: string;
}
export interface ApiTask {
  id: string;
  title: string;
  kind?: 'GENERAL' | 'VIEWING';
  description?: string;
  viewingId?: string;
  scheduledAt?: string;
  scheduledEndAt?: string;
  mine?: { taskAssignmentId: string; personalStatus: 'TODO' | 'DONE'; current: boolean };
  editable?: boolean;
  viewing?: ApiTaskViewing;
  currentShiftId: string | null;
  status:
    | 'UNASSIGNED'
    | 'TODO'
    | 'IN_PROGRESS'
    | 'PENDING_CONFIRM'
    | 'DONE'
    | 'WAITING_ADMIN'
    | 'CANCELLED';
  shiftLinks: {
    id: string;
    shiftId: string;
    fromShiftId?: string;
    transferredAt?: string;
    reason?: string;
  }[];
  assignees: ApiTaskPart[];
  currentAssignees: ApiTaskPart[];
}
export interface ApiViewingRoom {
  detailId: string;
  roomId: string;
  code: string;
  name: string;
  address: string;
  viewStatus: 'CHUA_XEM' | 'DA_XEM';
  note: string;
}
export interface ApiTaskViewing {
  id: string;
  status: 'CHO_XAC_NHAN' | 'DA_XAC_NHAN' | 'DA_XEM' | 'DA_HUY';
  date: string;
  startTime: string;
  endTime: string;
  viewerName: string;
  viewerPhone: string;
  peopleCount: number;
  note: string;
  rooms: ApiViewingRoom[];
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
