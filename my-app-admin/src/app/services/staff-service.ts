import { Injectable, signal, inject, effect, untracked } from '@angular/core';
import {
  RegistrationPeriod,
  ShiftAssignment,
  ShiftTask,
  StaffAttendance,
  StaffProfile,
  StaffShift,
  StaffStatus,
  WorkLocation,
} from '../classes/StaffProfile';
import { firstValueFrom } from 'rxjs';
import { UploadAPIService } from './upload-apiservice';
import { ShiftAPIService } from './shift-apiservice';
import { AdminCatalogAPIService } from './admin-catalog-apiservice';

export const STAFF_CONTRACT_TYPES = [
  { value: 'FULL_TIME', label: 'Toàn thời gian' },
  { value: 'PART_TIME', label: 'Bán thời gian' },
  { value: 'INTERNSHIP', label: 'Thực tập' },
] as const;

export interface StaffState {
  employees: StaffProfile[];
  locations: WorkLocation[];
  periods: RegistrationPeriod[];
  shifts: StaffShift[];
  assignments: ShiftAssignment[];
  tasks: ShiftTask[];
  attendance: StaffAttendance[];
}
export interface StaffMetrics {
  assigned: number;
  completed: number;
  onTime: number;
  attendanceCount: number;
  tasksTotal: number;
  tasksDone: number;
  taskRate: number;
  onTimeRate: number;
  completionRate: number;
  lateMinutes: number;
  penalizedLate: number;
}
const emptyState = (): StaffState => ({
  employees: [],
  locations: [],
  periods: [],
  shifts: [],
  assignments: [],
  tasks: [],
  attendance: [],
});
function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
@Injectable({ providedIn: 'root' })
export class StaffService {
  contractTypeLabel(value: string): string {
    return STAFF_CONTRACT_TYPES.find((type) => type.value === value)?.label || 'Chưa xác định';
  }
  readonly shiftApi = inject(ShiftAPIService);
  readonly catalogApi = inject(AdminCatalogAPIService);
  private uploads = inject(UploadAPIService);
  readonly temporaryPassword = signal<{
    employeeId: string;
    phone: string;
    password: string;
  } | null>(null);
  readonly state = signal<StaffState>(emptyState());
  readonly loading = signal(false);
  readonly error = signal('');
  private generation = 0;
  constructor() {
    effect(() => {
      const authenticated = this.catalogApi.authenticated;
      untracked(() => {
        this.generation++;
        this.temporaryPassword.set(null);
        this.state.set(emptyState());
        if (authenticated) void this.refreshEmployees().catch(() => {});
      });
    });
    effect(() => {
      const data = this.shiftApi.state();
      untracked(() =>
        this.state.update((state) => ({
          ...state,
          periods: data.periods.map((p) => ({ ...p, maxEmployeesPerShift: 6 })),
          shifts: data.shifts.map((s) => ({ ...s, start: s.startTime, end: s.endTime })),
          assignments: data.assignments,
          attendance: data.admin?.Attendance || [],
          tasks: data.tasks.map((t) => ({
            ...t,
            kind: t.kind || 'GENERAL',
            description: t.description || '',
            originShiftId: t.shiftLinks[0]?.shiftId || '',
            currentShiftId: t.currentShiftId || '',
            assigneeIds: [...new Set(t.currentAssignees.map((a) => a.employeeId))],
            doneBy: [
              ...new Set(
                t.currentAssignees
                  .filter((a) => a.personalStatus === 'DONE')
                  .map((a) => a.employeeId),
              ),
            ],
            transferCount: t.shiftLinks.filter((link) => !!link.fromShiftId).length,
            needsReassignment: t.status === 'WAITING_ADMIN',
          })),
        })),
      );
    });
  }
  async refreshEmployees(): Promise<void> {
    const generation = this.generation;
    this.loading.set(true);
    this.error.set('');
    try {
      const [employees, locations] = await Promise.all([
        this.catalogApi.list<StaffProfile>('employees'),
        this.catalogApi.list<WorkLocation>('work-locations'),
      ]);
      if (generation !== this.generation) return;
      this.state.update((state) => ({ ...state, employees, locations }));
    } catch (error) {
      if (generation === this.generation) {
        this.state.update((state) => ({ ...state, employees: [], locations: [] }));
        this.error.set(this.catalogApi.message(error));
      }
      throw error;
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }
  async loadEmployee(id: string): Promise<StaffProfile> {
    const employee = await this.catalogApi.detail<StaffProfile>('employees', id);
    this.acceptEmployee(employee);
    return employee;
  }
  async saveEmployeeRecord(
    input: Omit<StaffProfile, 'id' | 'employeeCode'>,
    id?: string,
  ): Promise<StaffProfile> {
    if (id) {
      const saved = await this.catalogApi.save<StaffProfile>('employees', input, id);
      this.acceptEmployee(saved);
      return saved;
    }
    const result = await this.catalogApi.save<{
      employee: StaffProfile;
      phone: string;
      temporaryPassword: string;
    }>('employees', input);
    this.temporaryPassword.set({
      employeeId: result.employee.id,
      phone: result.phone,
      password: result.temporaryPassword,
    });
    this.acceptEmployee(result.employee);
    return result.employee;
  }
  private acceptEmployee(employee: StaffProfile) {
    this.state.update((state) => ({
      ...state,
      employees: [...state.employees.filter((e) => e.id !== employee.id), employee],
    }));
  }
  async deactivateRecord(id: string): Promise<void> {
    const saved = await this.catalogApi.deactivate<StaffProfile>('employees', id);
    this.acceptEmployee(saved);
    await this.shiftApi.refresh();
  }
  async uploadAvatar(file: File): Promise<string> {
    return (await firstValueFrom(this.uploads.uploadEmployee(file))).url;
  }
  async cancelAssignment(id: string): Promise<void> {
    await this.shiftApi.write(`admin/shift-assignments/${encodeURIComponent(id)}`, {}, 'DELETE');
  }
  adjustmentError(assignmentId: string, targetShiftId: string): string {
    const assignment = this.state().assignments.find((a) => a.id === assignmentId);
    const source = this.shiftApi.state().shifts.find((s) => s.id === assignment?.shiftId);
    const target = this.shiftApi.state().shifts.find((s) => s.id === targetShiftId);
    if (
      !assignment ||
      assignment.status !== 'REGISTERED' ||
      !source ||
      Date.parse(source.startsAt) <= Date.now()
    )
      return 'Chọn phân ca chưa bắt đầu.';
    if (this.employee(assignment.employeeId)?.status !== 'ACTIVE')
      return 'Nhân viên không còn hoạt động.';
    if (!target || target.id === source.id) return 'Chọn ca thay thế.';
    if (target.status !== 'OPEN' || Date.parse(target.startsAt) <= Date.now())
      return 'Ca này đã đóng hoặc đã bắt đầu.';
    if (target.assignedCount >= target.capacity) return 'Ca đã đủ người trực.';
    const other = this.activeAssignments(undefined, assignment.employeeId).filter(
      (a) => a.id !== assignmentId,
    );
    if (
      other.some((a) => {
        const s = this.shiftApi.state().shifts.find((s) => s.id === a.shiftId);
        return (
          s &&
          Date.parse(s.startsAt) < Date.parse(target.endsAt) &&
          Date.parse(target.startsAt) < Date.parse(s.endsAt)
        );
      })
    )
      return 'Trùng giờ với ca khác của nhân viên.';
    return '';
  }
  employees(): StaffProfile[] {
    return this.state().employees.filter((employee) => !employee.archivedAt);
  }
  employee(id: string): StaffProfile | undefined {
    return this.state().employees.find((employee) => employee.id === id);
  }
  location(id: string): WorkLocation | undefined {
    return this.state().locations.find((location) => location.id === id);
  }
  activeAssignments(shiftId?: string, employeeId?: string): ShiftAssignment[] {
    return this.state().assignments.filter(
      (assignment) =>
        assignment.status !== 'CANCELLED' &&
        (!shiftId || assignment.shiftId === shiftId) &&
        (!employeeId || assignment.employeeId === employeeId),
    );
  }
  remaining(shift: StaffShift): number {
    return Math.max(0, shift.capacity - this.activeAssignments(shift.id).length);
  }
  week(weekStart: string): StaffShift[] {
    return this.state().shifts.filter(
      (shift) => shift.date >= weekStart && shift.date <= addDays(weekStart, 6),
    );
  }
  futureAssignments(employeeId: string): ShiftAssignment[] {
    const now = new Date();
    return this.activeAssignments(undefined, employeeId).filter((assignment) => {
      if (assignment.status !== 'REGISTERED') return false;
      const shift = this.state().shifts.find((item) => item.id === assignment.shiftId);
      return shift && new Date(`${shift.date}T${shift.start}:00`) > now;
    });
  }
  metrics(employeeId: string, periodId?: string): StaffMetrics {
    const assignments = this.activeAssignments(undefined, employeeId).filter((assignment) => {
      const shift = this.state().shifts.find((item) => item.id === assignment.shiftId);
      return !periodId || shift?.periodId === periodId;
    });
    const attendance = this.state().attendance.filter((item) =>
      assignments.some((assignment) => assignment.id === item.assignmentId),
    );
    const tasks = this.state().tasks.filter(
      (task) =>
        task.assigneeIds.includes(employeeId) &&
        (!periodId ||
          this.state().shifts.find((shift) => shift.id === task.originShiftId)?.periodId ===
            periodId),
    );
    const minutes = attendance.map((item) => {
      const assignment = assignments.find((a) => a.id === item.assignmentId);
      const shift = this.shiftApi.state().shifts.find((s) => s.id === assignment?.shiftId);
      return shift
        ? Math.max(0, Math.ceil((Date.parse(item.checkInAt) - Date.parse(shift.startsAt)) / 60000))
        : 0;
    });
    const onTime = minutes.filter((value) => value === 0).length;
    const admin = this.shiftApi.state().admin;
    const penalizedLate = attendance.filter((item, index) => {
      if (!minutes[index]) return false;
      const policy = admin?.Policy.filter(
        (p) =>
          p.type === 'PHAT_TRE' &&
          p.status === 'ACTIVE' &&
          Date.parse(p.effectiveFrom) <= Date.parse(item.checkInAt) &&
          (!p.effectiveTo || Date.parse(item.checkInAt) < Date.parse(p.effectiveTo)),
      ).sort((a, b) => Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom))[0];
      return admin?.PolicyLevel.some(
        (level) =>
          level.policyId === policy?.id &&
          minutes[index] >= level.from &&
          (level.to === null || minutes[index] < level.to) &&
          level.amount > 0,
      );
    }).length;
    const completed = assignments.filter((assignment) => assignment.status === 'COMPLETED').length;
    const tasksDone = tasks.filter((task) => task.doneBy.includes(employeeId)).length;
    return {
      lateMinutes: minutes.reduce((total, value) => total + value, 0),
      penalizedLate,
      assigned: assignments.length,
      completed,
      onTime,
      attendanceCount: attendance.length,
      tasksTotal: tasks.length,
      tasksDone,
      taskRate: tasks.length ? Math.round((tasksDone / tasks.length) * 100) : 0,
      onTimeRate: attendance.length ? Math.round((onTime / attendance.length) * 100) : 0,
      completionRate: assignments.length ? Math.round((completed / assignments.length) * 100) : 0,
    };
  }
  assignmentsFor(employeeId: string, periodId?: string): ShiftAssignment[] {
    return this.activeAssignments(undefined, employeeId).filter((assignment) => {
      const shift = this.state().shifts.find((item) => item.id === assignment.shiftId);
      return !periodId || shift?.periodId === periodId;
    });
  }
  tasksFor(employeeId: string): ShiftTask[] {
    return this.state().tasks.filter((task) => task.assigneeIds.includes(employeeId));
  }
  attendanceFor(assignmentId: string): StaffAttendance | undefined {
    return this.state().attendance.find((item) => item.assignmentId === assignmentId);
  }
}

export const staffStatusLabel = (status: StaffStatus): string =>
  ({
    ACTIVE: 'Đang hoạt động',
    ON_LEAVE: 'Tạm nghỉ',
    INACTIVE: 'Ngừng hoạt động',
  })[status];
