import { Injectable, signal } from '@angular/core';
import {
  RegistrationPeriod,
  ShiftAssignment,
  StaffAttendance,
  StaffProfile,
  StaffShift,
  ShiftTask,
  StaffStatus,
  WorkLocation,
} from '../models/domain';
import { PROPERTIES } from '../data/properties';
import { ASSETS } from '../data/assets';
import { uid } from './demo-store.service';

export interface StaffDemoState {
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
}
const STORAGE_KEY = 'ihouzz-staff-demo-v1';
const POSITIONS = [
  'Chuyên viên tư vấn',
  'Chuyên viên môi giới',
  'Điều phối ca trực',
  'Hỗ trợ vận hành',
  'Kiểm tra phòng',
];
const NAMES = ['Mai An', 'Minh Khoa', 'Lan Chi', 'Gia Huy', 'Khánh Linh', 'Quốc Bảo'];

function dateOnly(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
function startOfWeek(date: Date): Date {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}
function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dateOnly(date);
}
function makeDemoState(): StaffDemoState {
  const locations: WorkLocation[] = PROPERTIES.slice(0, 5).map((property) => ({
    id: property.id,
    name: property.name,
    address: property.address,
  }));
  const weekStart = dateOnly(startOfWeek(new Date()));
  const previousWeek = addDays(weekStart, -7);
  const employees: StaffProfile[] = NAMES.map((fullName, index) => ({
    id: `staff-demo-${index + 1}`,
    employeeCode: `NV-DEMO-${String(index + 1).padStart(3, '0')}`,
    fullName,
    birthDate: `${1995 + (index % 6)}-${String((index % 12) + 1).padStart(2, '0')}-12`,
    gender: index % 2 ? 'MALE' : 'FEMALE',
    phone: `00000000${String(index + 1).padStart(2, '0')}`,
    email: `nhanvien${index + 1}@example.test`,
    position: POSITIONS[index % POSITIONS.length],
    workLocationId: locations[index % locations.length].id,
    startDate: addDays(weekStart, -(70 + index * 24)),
    contractType: index % 3 === 0 ? 'Hợp đồng dài hạn' : 'Hợp đồng thời hạn 12 tháng',
    status: index === 4 ? 'ON_LEAVE' : 'ACTIVE',
    avatar: ASSETS.staff[index] || ASSETS.avatar,
  }));
  const period: RegistrationPeriod = {
    id: 'period-demo-current',
    name: `Đợt đăng ký tuần ${weekStart}`,
    weekStart,
    opensAt: new Date(`${addDays(weekStart, -3)}T08:00:00`).toISOString(),
    closesAt: new Date(`${addDays(weekStart, 7)}T18:00:00`).toISOString(),
    maxEmployeesPerShift: 4,
  };
  const previousPeriod: RegistrationPeriod = {
    id: 'period-demo-previous',
    name: `Đợt đăng ký tuần ${previousWeek}`,
    weekStart: previousWeek,
    opensAt: new Date(`${addDays(previousWeek, -3)}T08:00:00`).toISOString(),
    closesAt: new Date(`${addDays(previousWeek, 1)}T18:00:00`).toISOString(),
    maxEmployeesPerShift: 4,
  };
  const shifts: StaffShift[] = [
    {
      id: `shift-demo-${previousWeek}-0-am`,
      periodId: previousPeriod.id,
      workLocationId: locations[0].id,
      date: previousWeek,
      label: 'Ca sáng',
      start: '08:30',
      end: '12:30',
      capacity: 4,
    },
    {
      id: `shift-demo-${previousWeek}-1-pm`,
      periodId: previousPeriod.id,
      workLocationId: locations[1].id,
      date: addDays(previousWeek, 1),
      label: 'Ca chiều',
      start: '13:30',
      end: '17:30',
      capacity: 4,
    },
  ];
  for (let day = 0; day < 7; day++) {
    for (const slot of [
      { label: 'Ca sáng', start: '08:30', end: '12:30' },
      { label: 'Ca chiều', start: '13:30', end: '17:30' },
    ]) {
      shifts.push({
        id: `shift-demo-${weekStart}-${day}-${slot.label === 'Ca sáng' ? 'am' : 'pm'}`,
        periodId: period.id,
        workLocationId:
          locations[(day + (slot.label === 'Ca chiều' ? 1 : 0)) % locations.length].id,
        date: addDays(weekStart, day),
        ...slot,
        capacity: period.maxEmployeesPerShift,
      });
    }
  }
  const assignments: ShiftAssignment[] = [];
  const assign = (shiftIndex: number, employeeIndexes: number[]) => {
    employeeIndexes.forEach((employeeIndex) =>
      assignments.push({
        id: `assignment-demo-${shiftIndex}-${employeeIndex}`,
        employeeId: employees[employeeIndex].id,
        shiftId: shifts[shiftIndex].id,
        status: shiftIndex < 2 ? 'COMPLETED' : 'REGISTERED',
      }),
    );
  };
  assign(0, [0, 1]);
  assign(1, [0]);
  const tasks: ShiftTask[] = shifts.slice(0, 2).flatMap((shift, shiftIndex) => {
    const assigned = assignments.filter((assignment) => assignment.shiftId === shift.id);
    if (!assigned.length) return [];
    const assigneeIds = [...new Set(assigned.map((assignment) => assignment.employeeId))];
    return [
      {
        id: `task-demo-${shiftIndex}-1`,
        title: 'Kiểm tra checklist bàn giao ca',
        originShiftId: shift.id,
        currentShiftId: shift.id,
        assigneeIds,
        doneBy: [...assigneeIds],
        status: 'DONE' as const,
      },
      {
        id: `task-demo-${shiftIndex}-2`,
        title: 'Cập nhật tình trạng phòng trong khu vực',
        originShiftId: shift.id,
        currentShiftId: shift.id,
        assigneeIds,
        doneBy: [...assigneeIds],
        status: 'DONE' as const,
      },
    ];
  });
  const attendance: StaffAttendance[] = assignments
    .filter((assignment) => assignment.status === 'COMPLETED')
    .map((assignment, index) => {
      const shift = shifts.find((item) => item.id === assignment.shiftId)!;
      const checkIn = new Date(`${shift.date}T${shift.start}:00`);
      checkIn.setMinutes(checkIn.getMinutes() + (index % 3 === 0 ? -2 : index % 3 === 1 ? 6 : 1));
      const checkOut = new Date(`${shift.date}T${shift.end}:00`);
      return {
        id: `attendance-demo-${index}`,
        assignmentId: assignment.id,
        checkInAt: checkIn.toISOString(),
        checkOutAt: checkOut.toISOString(),
      };
    });
  return {
    employees,
    locations,
    periods: [previousPeriod, period],
    shifts,
    assignments,
    tasks,
    attendance,
  };
}

@Injectable({ providedIn: 'root' })
export class StaffDemoRepository {
  readonly storageNotice = signal('');
  readonly state = signal<StaffDemoState>(this.read());

  private read(): StaffDemoState {
    try {
      const value = JSON.parse(
        localStorage.getItem(STORAGE_KEY) || 'null',
      ) as StaffDemoState | null;
      if (
        value &&
        ['employees', 'locations', 'periods', 'shifts', 'assignments', 'tasks', 'attendance'].every(
          (key) => Array.isArray(value[key as keyof StaffDemoState]),
        )
      )
        return value;
    } catch {
      this.storageNotice.set(
        'Không đọc được dữ liệu đã lưu; đang dùng lại bộ dữ liệu mẫu ban đầu.',
      );
      return makeDemoState();
    }
    this.storageNotice.set('Chưa có dữ liệu nhân sự đã lưu; đang dùng bộ dữ liệu mẫu ban đầu.');
    return makeDemoState();
  }
  update(change: (state: StaffDemoState) => void): void {
    const next = structuredClone(this.state());
    change(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      this.state.set(next);
      this.storageNotice.set('Bản demo lưu trên thiết bị này (localStorage), không phải máy chủ.');
    } catch {
      throw new Error(
        'Không thể lưu localStorage (bị chặn hoặc hết dung lượng). Thay đổi chưa được lưu; hãy giảm kích thước ảnh hoặc kiểm tra quyền lưu trữ.',
      );
    }
  }
  reset(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
      this.state.set(makeDemoState());
      this.storageNotice.set('Đã đặt lại dữ liệu minh họa.');
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Không thể đặt lại dữ liệu demo.');
    }
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
  createPeriod(input: {
    name: string;
    weekStart: string;
    opensAt: string;
    closesAt: string;
    capacity: number;
    locationId: string;
  }): void {
    if (
      !input.name.trim() ||
      !this.state().locations.some((location) => location.id === input.locationId) ||
      !Number.isInteger(input.capacity) ||
      input.capacity < 1
    )
      throw new Error('Vui lòng nhập tên đợt, địa điểm và số chỗ hợp lệ.');
    if (!input.weekStart || Number.isNaN(new Date(`${input.weekStart}T12:00:00`).getTime()))
      throw new Error('Ngày bắt đầu tuần không hợp lệ.');
    if (new Date(`${input.weekStart}T12:00:00`).getDay() !== 1)
      throw new Error('Ngày bắt đầu đợt phải là thứ Hai.');
    const opensAt = new Date(input.opensAt);
    const closesAt = new Date(input.closesAt);
    if (
      !Number.isFinite(opensAt.getTime()) ||
      !Number.isFinite(closesAt.getTime()) ||
      closesAt <= opensAt
    )
      throw new Error('Thời điểm đóng đăng ký phải sau thời điểm mở.');
    if (this.state().periods.some((period) => period.weekStart === input.weekStart))
      throw new Error('Đã có đợt đăng ký ca cho tuần này.');
    this.update((state) => {
      const id = uid('period');
      state.periods.push({
        id,
        name: input.name.trim(),
        weekStart: input.weekStart,
        opensAt: opensAt.toISOString(),
        closesAt: closesAt.toISOString(),
        maxEmployeesPerShift: input.capacity,
      });
      for (let day = 0; day < 7; day++) {
        for (const slot of [
          { label: 'Ca sáng', start: '08:30', end: '12:30' },
          { label: 'Ca chiều', start: '13:30', end: '17:30' },
        ]) {
          state.shifts.push({
            id: uid('shift'),
            periodId: id,
            workLocationId: input.locationId,
            date: addDays(input.weekStart, day),
            ...slot,
            capacity: input.capacity,
          });
        }
      }
    });
  }
  saveEmployee(input: Omit<StaffProfile, 'id' | 'employeeCode'>, id?: string): StaffProfile {
    const birthDate = new Date(`${input.birthDate}T12:00:00`);
    const startDate = new Date(`${input.startDate}T12:00:00`);
    if (
      !input.fullName.trim() ||
      !/^\+?[0-9 ()-]{9,18}$/.test(input.phone) ||
      !/^\d{9,15}$/.test(input.phone.replace(/\D/g, '')) ||
      !['FEMALE', 'MALE', 'OTHER'].includes(input.gender) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) ||
      !Number.isFinite(birthDate.getTime()) ||
      input.birthDate >= dateOnly(new Date()) ||
      !Number.isFinite(startDate.getTime()) ||
      input.startDate > dateOnly(new Date()) ||
      input.startDate < input.birthDate ||
      !input.position.trim() ||
      !input.contractType.trim() ||
      !this.location(input.workLocationId) ||
      !['ACTIVE', 'ON_LEAVE', 'INACTIVE'].includes(input.status)
    )
      throw new Error('Thông tin hồ sơ chưa hợp lệ.');
    if (input.status === 'INACTIVE' && this.employee(id || '')?.status !== 'INACTIVE')
      throw new Error(
        'Hãy dùng thao tác Ngừng hoạt động để hủy ca tương lai và đánh dấu công việc cần phân công lại.',
      );
    const duplicate = this.employees().find(
      (employee) =>
        employee.id !== id &&
        (employee.email.toLowerCase() === input.email.trim().toLowerCase() ||
          employee.phone.replace(/\D/g, '') === input.phone.replace(/\D/g, '')),
    );
    if (duplicate) throw new Error('Email hoặc số điện thoại đã được sử dụng trong dữ liệu demo.');
    const existing = id ? this.employee(id) : undefined;
    if (id && !existing) throw new Error('Không tìm thấy hồ sơ nhân sự cần chỉnh sửa.');
    if (existing?.archivedAt)
      throw new Error('Hồ sơ đã xóa khỏi danh sách vận hành; không thể sửa.');
    const saved: StaffProfile = {
      ...input,
      id: existing?.id || uid('staff'),
      employeeCode:
        existing?.employeeCode ||
        `NV-DEMO-${String(
          this.state().employees.reduce(
            (max, employee) =>
              Math.max(max, Number(employee.employeeCode.match(/(\d+)$/)?.[1] || 0)),
            0,
          ) + 1,
        ).padStart(3, '0')}`,
      fullName: input.fullName.trim(),
      phone: input.phone.trim(),
      email: input.email.trim().toLowerCase(),
    };
    this.update((state) => {
      const index = state.employees.findIndex((employee) => employee.id === saved.id);
      if (index < 0) state.employees.push(saved);
      else state.employees[index] = saved;
    });
    return saved;
  }
  register(employeeId: string, shiftId: string): void {
    const employee = this.employee(employeeId);
    const shift = this.state().shifts.find((item) => item.id === shiftId);
    const period = shift && this.state().periods.find((item) => item.id === shift.periodId);
    if (!employee || employee.status !== 'ACTIVE')
      throw new Error('Chỉ nhân viên đang hoạt động mới đăng ký ca được.');
    if (!shift || !period) throw new Error('Không tìm thấy ca hoặc đợt đăng ký.');
    if (new Date(`${shift.date}T${shift.start}:00`) <= new Date())
      throw new Error('Không thể đăng ký ca đã bắt đầu.');
    const now = Date.now();
    if (now < new Date(period.opensAt).getTime() || now > new Date(period.closesAt).getTime())
      throw new Error('Đợt đăng ký ca hiện chưa mở hoặc đã đóng.');
    if (!this.remaining(shift)) throw new Error('Ca này đã đủ chỗ.');
    if (this.activeAssignments(shiftId, employeeId).length)
      throw new Error('Nhân viên đã đăng ký ca này.');
    const time = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
    const collision = this.activeAssignments(undefined, employeeId).some((assignment) => {
      const other = this.state().shifts.find((item) => item.id === assignment.shiftId);
      return (
        !!other &&
        other.date === shift.date &&
        time(shift.start) < time(other.end) &&
        time(other.start) < time(shift.end)
      );
    });
    if (collision) throw new Error('Nhân viên đã có ca bị trùng giờ trong ngày này.');
    this.update((state) => {
      state.assignments.push({ id: uid('assignment'), employeeId, shiftId, status: 'REGISTERED' });
      const saved = state.shifts.find((item) => item.id === shiftId)!;
      saved.vacanciesToReassign = Math.max(
        0,
        (saved.vacanciesToReassign ?? (saved.needsReassignment ? 1 : 0)) - 1,
      );
      saved.needsReassignment = saved.vacanciesToReassign > 0;
    });
  }
  cancelAssignment(assignmentId: string): void {
    const assignment = this.state().assignments.find((item) => item.id === assignmentId);
    const shift = assignment && this.state().shifts.find((item) => item.id === assignment.shiftId);
    if (
      !assignment ||
      assignment.status !== 'REGISTERED' ||
      !shift ||
      new Date(`${shift.date}T${shift.start}:00`) <= new Date()
    )
      throw new Error('Chỉ có thể hủy ca chưa bắt đầu.');
    this.update((state) => {
      state.assignments.find((item) => item.id === assignmentId)!.status = 'CANCELLED';
      state.shifts.find((item) => item.id === shift.id)!.needsReassignment = true;
      const saved = state.shifts.find((item) => item.id === shift.id)!;
      saved.vacanciesToReassign = (saved.vacanciesToReassign || 0) + 1;
      state.tasks
        .filter(
          (task) =>
            task.currentShiftId === shift.id &&
            task.assigneeIds.includes(assignment.employeeId) &&
            !task.doneBy.includes(assignment.employeeId),
        )
        .forEach((task) => (task.needsReassignment = true));
    });
  }
  toggleTask(taskId: string, employeeId: string): void {
    this.update((state) => {
      const task = state.tasks.find((item) => item.id === taskId);
      if (!task || !task.assigneeIds.includes(employeeId))
        throw new Error('Công việc không được giao cho nhân viên này.');
      if (
        this.employee(employeeId)?.status !== 'ACTIVE' ||
        !this.activeAssignments(task.currentShiftId, employeeId).length
      )
        throw new Error(
          'Nhân viên không còn nhận ca hiện tại; hãy chuyển việc hoặc phân công lại.',
        );
      task.doneBy = task.doneBy.includes(employeeId)
        ? task.doneBy.filter((id) => id !== employeeId)
        : [...task.doneBy, employeeId];
      task.status =
        task.doneBy.length >= task.assigneeIds.length
          ? 'DONE'
          : task.doneBy.length
            ? 'IN_PROGRESS'
            : 'TODO';
    });
  }
  completeTask(taskId: string): void {
    this.update((state) => {
      const task = state.tasks.find((item) => item.id === taskId);
      if (!task) throw new Error('Không tìm thấy công việc.');
      if (
        task.assigneeIds.some(
          (id) =>
            this.employee(id)?.status !== 'ACTIVE' ||
            !this.activeAssignments(task.currentShiftId, id).length,
        )
      )
        throw new Error('Công việc cần phân công lại trước khi hoàn thành.');
      task.doneBy = [...task.assigneeIds];
      task.status = 'DONE';
    });
  }
  carryTask(taskId: string, nextShiftId: string): void {
    const task = this.state().tasks.find((item) => item.id === taskId);
    const nextShift = this.state().shifts.find((item) => item.id === nextShiftId);
    if (!task || task.status === 'DONE' || !nextShift)
      throw new Error('Chỉ có thể chuyển công việc chưa xong sang ca hợp lệ.');
    const current = this.state().shifts.find((item) => item.id === task.currentShiftId)!;
    if (
      `${nextShift.date}T${nextShift.start}` < `${current.date}T${current.end}` ||
      nextShift.id === current.id
    )
      throw new Error('Chỉ chuyển công việc sang ca sau khi ca hiện tại kết thúc.');
    const receivingIds = this.activeAssignments(nextShiftId)
      .filter((item) => this.employee(item.employeeId)?.status === 'ACTIVE')
      .map((item) => item.employeeId);
    if (!receivingIds.length)
      throw new Error('Ca tiếp theo cần có nhân viên đang hoạt động nhận ca.');
    if (receivingIds.every((id) => task.doneBy.includes(id)))
      throw new Error('Ca đích cần người tiếp nhận phần việc chưa hoàn thành.');
    this.update((state) => {
      const saved = state.tasks.find((item) => item.id === taskId)!;
      saved.transfers = [
        ...(saved.transfers || []),
        {
          fromShiftId: saved.currentShiftId,
          toShiftId: nextShiftId,
          at: new Date().toISOString(),
          previousAssigneeIds: [...saved.assigneeIds],
        },
      ];
      saved.currentShiftId = nextShiftId;
      // Keep completed contributions; give remaining work to the receiving shift's participants.
      saved.assigneeIds = [...new Set([...saved.doneBy, ...receivingIds])];
      saved.status =
        saved.doneBy.length === saved.assigneeIds.length
          ? 'DONE'
          : saved.doneBy.length
            ? 'IN_PROGRESS'
            : 'TODO';
      saved.needsReassignment = false;
    });
  }
  createTask(shiftId: string, title: string, assigneeIds: string[]): void {
    if (!title.trim() || !assigneeIds.length)
      throw new Error('Nhập tên công việc và chọn ít nhất một nhân viên.');
    if (assigneeIds.some((id) => !this.activeAssignments(shiftId, id).length))
      throw new Error('Chỉ có thể giao việc cho nhân viên đã đăng ký ca.');
    this.update((state) =>
      state.tasks.push({
        id: uid('task'),
        title: title.trim(),
        originShiftId: shiftId,
        currentShiftId: shiftId,
        assigneeIds: [...new Set(assigneeIds)],
        doneBy: [],
        status: 'TODO',
      }),
    );
  }
  createShift(input: {
    periodId: string;
    date: string;
    start: string;
    end: string;
    capacity: number;
    workLocationId: string;
    label: string;
  }): void {
    this.saveShift(input);
  }
  saveShift(
    input: {
      periodId: string;
      date: string;
      start: string;
      end: string;
      capacity: number;
      workLocationId: string;
      label: string;
    },
    id?: string,
  ): void {
    const period = this.state().periods.find((item) => item.id === input.periodId);
    const existing = id ? this.state().shifts.find((shift) => shift.id === id) : undefined;
    if (
      !period ||
      (id && !existing) ||
      !this.state().locations.some((location) => location.id === input.workLocationId) ||
      !input.date ||
      !Number.isFinite(new Date(`${input.date}T12:00:00`).getTime()) ||
      input.date < period.weekStart ||
      input.date > addDays(period.weekStart, 6) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.start) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.end) ||
      input.end <= input.start ||
      !Number.isInteger(input.capacity) ||
      input.capacity < 1 ||
      !input.label.trim() ||
      (existing && this.activeAssignments(id).length > input.capacity)
    )
      throw new Error('Thông tin điều chỉnh ca chưa hợp lệ.');
    if (
      new Date(`${input.date}T${input.start}`) <= new Date() ||
      (existing && new Date(`${existing.date}T${existing.start}`) <= new Date())
    )
      throw new Error('Chỉ thêm hoặc điều chỉnh ca chưa bắt đầu; lịch sử ca được giữ nguyên.');
    const assignedIds = existing
      ? this.activeAssignments(existing.id).map((item) => item.employeeId)
      : [];
    if (
      this.state().assignments.some((assignment) => {
        if (
          assignment.status === 'CANCELLED' ||
          assignment.shiftId === id ||
          !assignedIds.includes(assignment.employeeId)
        )
          return false;
        const other = this.state().shifts.find((item) => item.id === assignment.shiftId);
        return (
          other && other.date === input.date && input.start < other.end && other.start < input.end
        );
      })
    )
      throw new Error('Thay đổi này làm trùng giờ ca đã nhận của nhân viên.');
    this.update((state) => {
      if (id) {
        const shift = state.shifts.find((item) => item.id === id)!;
        Object.assign(shift, input);
      } else state.shifts.push({ id: uid('shift'), ...input });
    });
  }
  adjustmentError(assignmentId: string, targetShiftId: string): string {
    const assignment = this.state().assignments.find((a) => a.id === assignmentId);
    const source = this.state().shifts.find((s) => s.id === assignment?.shiftId);
    const target = this.state().shifts.find((s) => s.id === targetShiftId);
    const employee = this.employee(assignment?.employeeId || '');
    if (!assignment || !source || assignment.status !== 'REGISTERED')
      return 'Chọn đăng ký ca chưa bắt đầu để điều chỉnh.';
    if (!employee || employee.archivedAt || employee.status !== 'ACTIVE')
      return 'Nhân viên không còn hoạt động.';
    if (new Date(`${source.date}T${source.start}`) <= new Date())
      return 'Ca gốc đã bắt đầu; giữ nguyên lịch sử.';
    if (!target) return 'Chọn ca thay thế trong bảng bên dưới.';
    if (target.id === source.id) return 'Đây là ca hiện tại.';
    if (new Date(`${target.date}T${target.start}`) <= new Date()) return 'Ca này đã bắt đầu.';
    const period = this.state().periods.find((p) => p.id === target.periodId);
    if (
      !period ||
      Date.now() < new Date(period.opensAt).getTime() ||
      Date.now() > new Date(period.closesAt).getTime()
    )
      return 'Đợt đăng ký chưa mở hoặc đã đóng.';
    if (!this.remaining(target)) return 'Ca đã đủ người trực.';
    const others = this.activeAssignments(undefined, employee.id).filter(
      (a) => a.id !== assignmentId,
    );
    if (others.some((a) => a.shiftId === target.id)) return 'Nhân viên đã nhận ca này.';
    if (
      others.some((a) => {
        const s = this.state().shifts.find((s) => s.id === a.shiftId);
        return s && s.date === target.date && s.start < target.end && target.start < s.end;
      })
    )
      return 'Trùng giờ với ca khác của nhân viên.';
    return '';
  }
  moveAssignment(assignmentId: string, targetShiftId: string): void {
    const error = this.adjustmentError(assignmentId, targetShiftId);
    if (error) throw new Error(error);
    this.update((state) => {
      const old = state.assignments.find((a) => a.id === assignmentId)!;
      old.status = 'CANCELLED';
      const source = state.shifts.find((s) => s.id === old.shiftId)!;
      source.needsReassignment = true;
      source.vacanciesToReassign = (source.vacanciesToReassign || 0) + 1;
      state.tasks
        .filter(
          (t) =>
            t.currentShiftId === source.id &&
            t.assigneeIds.includes(old.employeeId) &&
            !t.doneBy.includes(old.employeeId),
        )
        .forEach((t) => (t.needsReassignment = true));
      const target = state.shifts.find((s) => s.id === targetShiftId)!;
      target.vacanciesToReassign = Math.max(0, (target.vacanciesToReassign || 0) - 1);
      target.needsReassignment = target.vacanciesToReassign > 0;
      state.assignments.push({
        id: uid('assignment'),
        employeeId: old.employeeId,
        shiftId: targetShiftId,
        status: 'REGISTERED',
        movedFromAssignmentId: old.id,
      });
    });
  }
  archiveEmployee(employeeId: string): void {
    this.deactivate(employeeId, true);
  }
  deactivate(employeeId: string, archive = false): void {
    if (!this.employee(employeeId)) throw new Error('Không tìm thấy nhân viên.');
    this.update((state) => {
      state.employees.find((employee) => employee.id === employeeId)!.status = 'INACTIVE';
      if (archive)
        state.employees.find((employee) => employee.id === employeeId)!.archivedAt =
          new Date().toISOString();
      const now = new Date();
      for (const assignment of state.assignments.filter(
        (item) => item.employeeId === employeeId && item.status === 'REGISTERED',
      )) {
        const shift = state.shifts.find((item) => item.id === assignment.shiftId);
        if (shift && new Date(`${shift.date}T${shift.start}:00`) > now) {
          assignment.status = 'CANCELLED';
          shift.needsReassignment = true;
          shift.vacanciesToReassign = (shift.vacanciesToReassign || 0) + 1;
          state.tasks
            .filter(
              (task) =>
                task.currentShiftId === shift.id &&
                task.assigneeIds.includes(employeeId) &&
                task.status !== 'DONE',
            )
            .forEach((task) => (task.needsReassignment = true));
        }
      }
    });
  }
  removeEmployee(employeeId: string): void {
    const related = this.state();
    const assignmentIds = related.assignments.filter((item) => item.employeeId === employeeId);
    if (
      assignmentIds.length ||
      related.tasks.some((task) => task.assigneeIds.includes(employeeId)) ||
      related.attendance.some((attendance) =>
        assignmentIds.some((item) => item.id === attendance.assignmentId),
      )
    )
      throw new Error(
        'Nhân viên còn liên kết ca, công việc hoặc chấm công; hãy ngừng hoạt động để giữ lịch sử.',
      );
    this.update((state) => {
      state.employees = state.employees.filter((employee) => employee.id !== employeeId);
    });
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
    const onTime = attendance.filter((item) => {
      const assignment = assignments.find((candidate) => candidate.id === item.assignmentId);
      const shift =
        assignment && this.state().shifts.find((candidate) => candidate.id === assignment.shiftId);
      return (
        shift &&
        new Date(item.checkInAt).getTime() <=
          new Date(`${shift.date}T${shift.start}:00`).getTime() + 5 * 60000
      );
    }).length;
    const completed = assignments.filter((assignment) => assignment.status === 'COMPLETED').length;
    const tasksDone = tasks.filter((task) => task.doneBy.includes(employeeId)).length;
    return {
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
  checkIn(assignmentId: string, at: string): void {
    const assignment = this.state().assignments.find((item) => item.id === assignmentId);
    if (!assignment || assignment.status !== 'REGISTERED')
      throw new Error('Không thể ghi nhận chấm công cho ca này.');
    const timestamp = new Date(at);
    if (!Number.isFinite(timestamp.getTime())) throw new Error('Thời gian chấm công không hợp lệ.');
    const shift = this.state().shifts.find((item) => item.id === assignment.shiftId);
    if (
      !shift ||
      dateOnly(timestamp) !== shift.date ||
      this.employee(assignment.employeeId)?.status !== 'ACTIVE'
    )
      throw new Error('Giờ demo phải thuộc ngày của ca và nhân viên phải đang hoạt động.');
    this.update((state) => {
      state.attendance.push({
        id: uid('attendance'),
        assignmentId,
        checkInAt: timestamp.toISOString(),
      });
      state.assignments.find((item) => item.id === assignmentId)!.status = 'IN_PROGRESS';
    });
  }
  checkOut(assignmentId: string, at: string): void {
    const assignment = this.state().assignments.find((item) => item.id === assignmentId);
    const attendance = this.attendanceFor(assignmentId);
    if (
      !assignment ||
      assignment.status !== 'IN_PROGRESS' ||
      !attendance ||
      !Number.isFinite(new Date(at).getTime()) ||
      new Date(at) <= new Date(attendance.checkInAt)
    )
      throw new Error('Giờ ra phải sau giờ vào của ca đang làm.');
    this.update((state) => {
      state.attendance.find((item) => item.assignmentId === assignmentId)!.checkOutAt = new Date(
        at,
      ).toISOString();
      state.assignments.find((item) => item.id === assignmentId)!.status = 'COMPLETED';
    });
  }
}

export const staffStatusLabel = (status: StaffStatus): string =>
  ({
    ACTIVE: 'Đang hoạt động',
    ON_LEAVE: 'Tạm nghỉ',
    INACTIVE: 'Ngừng hoạt động',
  })[status];
