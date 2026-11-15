import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiTask, ApiTaskPart, TaskReject, TaskUpdate } from '../../classes/ShiftApi';
import { ShiftAssignment, StaffShift } from '../../classes/StaffProfile';
import { addDays, weekStart } from '../staff-page';
import { SchedulePeriods } from './schedule-periods';

type ScheduleTab = 'ca-truc' | 'cong-viec' | 'dot-dang-ky';
type TaskFilter = '' | 'UNASSIGNED' | 'ASSIGNED' | 'PENDING_CONFIRM' | 'WAITING_ADMIN' | 'DONE';
type MatrixSelection = { employeeId: string; shiftId: string; assignmentId: string };

@Component({
  selector: 'app-admin-staff-schedule',
  standalone: false,
  templateUrl: './admin-staff-schedule.html',
  styleUrls: ['./admin-staff-schedule.css', './schedule-tasks.css'],
})
export class AdminStaffScheduleComponent extends SchedulePeriods {
  private route = inject(ActivatedRoute);
  readonly tab = signal<ScheduleTab>('ca-truc');
  readonly weekdays = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
  readonly halves = ['Sáng', 'Chiều'] as const;
  readonly popover = signal<MatrixSelection | null>(null);
  readonly popoverPosition = signal({ top: 160, left: 240 });
  readonly confirmAssignment = signal<MatrixSelection | null>(null);
  readonly cellBusy = signal('');
  readonly tasks = signal<ApiTask[]>([]);
  readonly tasksLoading = signal(false);
  readonly tasksError = signal('');
  readonly taskFilter = signal<TaskFilter>('');
  readonly taskQuery = signal('');
  readonly taskPage = signal(1);
  readonly pageSize = 20;
  readonly editorOpen = signal(false);
  readonly editorStep = signal<1 | 2 | 3>(1);
  readonly editingTask = signal<ApiTask | null>(null);
  readonly viewingTask = signal<ApiTask | null>(null);
  readonly taskTitle = signal('');
  readonly taskDescription = signal('');
  readonly taskWeek = signal(weekStart(new Date()));
  readonly taskShiftId = signal('');
  readonly taskAssigneeIds = signal<string[]>([]);
  readonly taskFormError = signal('');
  readonly taskTitleError = signal('');
  readonly taskDescriptionError = signal('');
  readonly confirmTask = signal<ApiTask | null>(null);
  private readonly tasksLoaded = signal(false);
  readonly pendingConfirmTasks = computed(() =>
    (this.tasksLoaded() ? this.tasks() : this.api.state().tasks).filter(
      (task) => task.status === 'PENDING_CONFIRM',
    ),
  );
  readonly pendingConfirmCount = computed(() => this.pendingConfirmTasks().length);
  readonly pendingConfirmError = signal('');
  readonly rejectingTask = signal<ApiTask | null>(null);
  readonly rejectReason = signal('');
  readonly rejectShiftId = signal('');
  readonly rejectAssigneeIds = signal<string[]>([]);
  readonly rejectError = signal('');
  readonly rejectSubmitted = signal(false);
  readonly rejectReasonValid = computed(() => {
    const length = this.rejectReason().trim().length;
    return length >= 3 && length <= 500;
  });
  readonly rejectReasonError = computed(() =>
    (this.rejectSubmitted() || this.rejectReason().length > 0) && !this.rejectReasonValid()
      ? 'Lý do chưa đạt phải từ 3 đến 500 ký tự.'
      : '',
  );
  private taskRead = 0;

  constructor() {
    super();
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const value = params.get('tab');
      const tab: ScheduleTab = value === 'cong-viec' || value === 'dot-dang-ky' ? value : 'ca-truc';
      const changed = this.tab() !== tab;
      this.tab.set(tab);
      if (changed) this.popover.set(null);
      if (changed && tab === 'cong-viec') void this.loadTasks();
    });
  }
  selectTab(tab: ScheduleTab) {
    const changed = this.tab() !== tab;
    this.tab.set(tab);
    this.popover.set(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      queryParamsHandling: 'merge',
    });
    if (changed && tab === 'cong-viec') void this.loadTasks();
  }
  override viewSchedule() {
    this.selectTab('ca-truc');
  }
  createWeekPeriod() {
    this.selectTab('dot-dang-ky');
    this.resetPeriodForm(this.currentWeek);
  }
  get weekDates() {
    return Array.from({ length: 7 }, (_, i) => addDays(this.currentWeek, i));
  }
  get matrixEmployees() {
    return this.employees.filter((employee) => employee.status === 'ACTIVE');
  }
  previousWeek() {
    this.currentWeek = addDays(this.currentWeek, -7);
    this.popover.set(null);
  }
  nextWeek() {
    this.currentWeek = addDays(this.currentWeek, 7);
    this.popover.set(null);
  }
  matrixShift(date: string, half: 'Sáng' | 'Chiều') {
    return this.repository
      .state()
      .shifts.find(
        (shift) =>
          shift.date === date &&
          (half === 'Sáng' ? shift.start < '12:00' : shift.start >= '12:00') &&
          shift.status !== 'CANCELLED',
      );
  }
  assignmentFor(employeeId: string, shiftId: string) {
    return this.repository.activeAssignments(shiftId, employeeId)[0];
  }
  employeeWeekCount(employeeId: string) {
    return this.repository
      .week(this.currentWeek)
      .filter((shift) => !!this.assignmentFor(employeeId, shift.id)).length;
  }
  shiftStarted(shift: StaffShift) {
    return Date.parse(shift.startsAt || `${shift.date}T${shift.start}:00+07:00`) <= Date.now();
  }
  shiftEnded(shift: StaffShift) {
    return Date.parse(shift.endsAt || `${shift.date}T${shift.end}:00+07:00`) <= Date.now();
  }
  emptyReason(employeeId: string, shift?: StaffShift) {
    if (!shift) return 'Chưa có ca trực. Tạo đợt đăng ký cho tuần này trước.';
    if (this.shiftEnded(shift)) return 'Ca đã kết thúc hoặc đã qua.';
    if (shift.status === 'CANCELLED') return 'Ca đã đóng.';
    if (this.repository.remaining(shift) <= 0) return 'Ca đã đủ người.';
    if (this.employeeFor(employeeId)?.status !== 'ACTIVE') return 'Nhân viên không hoạt động.';
    return '';
  }
  async addMatrixAssignment(employeeId: string, shift?: StaffShift) {
    if (
      this.busy ||
      this.cellBusy() ||
      this.emptyReason(employeeId, shift) ||
      !shift ||
      this.assignmentFor(employeeId, shift.id)
    )
      return;
    this.cellBusy.set(`${employeeId}:${shift.id}`);
    this.busy = true;
    this.popover.set(null);
    try {
      await this.api.write('admin/shift-registrations', { employeeId, shiftId: shift.id });
      this.notify('Đã thêm ca trực cho nhân viên.');
    } catch (error) {
      this.error = (error as Error).message;
    } finally {
      this.cellBusy.set('');
      this.busy = false;
    }
  }
  openPopover(
    employeeId: string,
    shift: StaffShift,
    assignment: ShiftAssignment,
    event?: MouseEvent,
  ) {
    const rect = (event?.currentTarget as HTMLElement | undefined)?.getBoundingClientRect();
    if (rect)
      this.popoverPosition.set({
        top: Math.max(16, Math.min(rect.bottom + 8, window.innerHeight - 360)),
        left: Math.max(16, Math.min(rect.left, window.innerWidth - 356)),
      });
    this.popover.set({ employeeId, shiftId: shift.id, assignmentId: assignment.id });
  }
  assignmentStatus(id: string) {
    const status = this.repository.state().assignments.find((a) => a.id === id)?.status;
    return status
      ? {
          REGISTERED: 'Đã đăng ký',
          IN_PROGRESS: 'Đang trực',
          COMPLETED: 'Hoàn thành',
          ABSENT: 'Vắng mặt',
          CANCELLED: 'Đã hủy',
        }[status]
      : 'Chưa xác định';
  }
  assignmentTasks(id: string) {
    return this.repository
      .state()
      .tasks.filter(
        (task) =>
          task.status !== 'CANCELLED' &&
          task.currentAssignees?.some(
            (part) => part.assignmentId === id && !part.removed && !part.transferredTo,
          ),
      );
  }
  reassignmentCount(id: string) {
    return this.assignmentTasks(id).filter(
      (task) =>
        task.status !== 'DONE' &&
        task.currentAssignees?.some(
          (part) =>
            part.assignmentId === id &&
            !part.removed &&
            !part.transferredTo &&
            part.personalStatus !== 'DONE',
        ),
    ).length;
  }
  requestDeleteAssignment(employeeId: string, shift: StaffShift, assignment: ShiftAssignment) {
    if (this.busy || this.cellBusy() || this.shiftStarted(shift)) return;
    this.popover.set(null);
    this.confirmAssignment.set({ employeeId, shiftId: shift.id, assignmentId: assignment.id });
  }
  async deleteAssignment() {
    const selection = this.confirmAssignment();
    const shift = selection && this.shiftFor(selection.shiftId);
    if (!selection || !shift || this.shiftStarted(shift) || this.busy) return;
    this.busy = true;
    try {
      await this.repository.cancelAssignment(selection.assignmentId);
      this.confirmAssignment.set(null);
      this.notify('Đã xóa ca trực. Công việc chưa xong chuyển về Chờ giao lại.');
    } catch (error) {
      this.error = (error as Error).message;
    } finally {
      this.busy = false;
    }
  }
  @HostListener('document:keydown.escape') escape() {
    if (this.busy) return;
    if (this.rejectingTask()) this.closeTaskRejection();
    else if (this.confirmTask() || this.confirmPeriod || this.confirmAssignment())
      this.closeConfirmation();
    else if (this.editorOpen()) this.closeTaskForm();
    else if (this.viewingTask()) this.viewingTask.set(null);
    else this.popover.set(null);
  }
  @HostListener('document:click', ['$event']) outside(event: MouseEvent) {
    if (!(event.target as HTMLElement)?.closest?.('.assignment-slot, .assignment-popover'))
      this.popover.set(null);
  }
  async loadTasks() {
    const version = ++this.taskRead;
    this.tasksLoading.set(true);
    this.tasksError.set('');
    try {
      const tasks = await this.api.listTasks();
      if (version === this.taskRead) {
        this.tasks.set(tasks);
        this.tasksLoaded.set(true);
        this.taskPage.set(Math.min(this.taskPage(), this.taskPageCount));
      }
    } catch (error) {
      if (version === this.taskRead) this.tasksError.set((error as Error).message);
    } finally {
      if (version === this.taskRead) this.tasksLoading.set(false);
    }
  }
  taskStatus(task: { status: string }) {
    return (
      {
        UNASSIGNED: 'Chưa giao',
        TODO: 'Đã giao',
        IN_PROGRESS: 'Đã giao',
        PENDING_CONFIRM: 'Chờ xác nhận',
        DONE: 'Hoàn thành',
        WAITING_ADMIN: 'Chờ giao lại',
        CANCELLED: 'Đã hủy',
      }[task.status] || 'Chưa xác định'
    );
  }
  taskStatusClass(task: { status: string }) {
    return task.status === 'DONE'
      ? 'done'
      : task.status === 'WAITING_ADMIN' || task.status === 'PENDING_CONFIRM'
        ? 'waiting'
        : task.status === 'TODO' || task.status === 'IN_PROGRESS'
          ? 'assigned'
          : 'unassigned';
  }
  get filteredTasks() {
    const query = this.taskQuery().trim().toLocaleLowerCase('vi');
    const filter = this.taskFilter();
    return this.tasks().filter(
      (task) =>
        (!filter ||
          (filter === 'ASSIGNED'
            ? task.status === 'TODO' || task.status === 'IN_PROGRESS'
            : task.status === filter)) &&
        (!query || task.title.toLocaleLowerCase('vi').includes(query)),
    );
  }
  get pagedTasks() {
    return this.filteredTasks.slice(
      (this.taskPage() - 1) * this.pageSize,
      this.taskPage() * this.pageSize,
    );
  }
  get taskPageCount() {
    return Math.max(1, Math.ceil(this.filteredTasks.length / this.pageSize));
  }
  setTaskFilter(value: TaskFilter) {
    this.taskFilter.set(value);
    this.taskPage.set(1);
  }
  setTaskQuery(value: string) {
    this.taskQuery.set(value);
    this.taskPage.set(1);
  }
  taskShift(task: ApiTask) {
    if (task.currentShift) return task.currentShift;
    const shift = task.currentShiftId ? this.shiftFor(task.currentShiftId) : undefined;
    return shift
      ? {
          id: shift.id,
          date: shift.date,
          label: shift.label,
          startTime: shift.start,
          endTime: shift.end,
        }
      : null;
  }
  taskPeople(task: ApiTask): ApiTaskPart[] {
    return (task.currentAssignees || task.assignees || []).filter(
      (part) => !part.removed && !part.transferredTo,
    );
  }
  personName(part: ApiTaskPart) {
    return part.fullName || this.employeeFor(part.employeeId)?.fullName || 'Nhân viên';
  }
  personCode(part: ApiTaskPart) {
    return part.employeeCode || this.employeeFor(part.employeeId)?.employeeCode || '—';
  }
  taskEditable(task: ApiTask) {
    return !['DONE', 'CANCELLED', 'PENDING_CONFIRM'].includes(task.status);
  }
  taskDeleteReason(task: ApiTask) {
    if (task.status === 'PENDING_CONFIRM') return 'Đang chờ xác nhận hoàn thành';
    if (task.kind === 'VIEWING') return 'Việc dẫn khách chỉ hủy khi lịch xem bị hủy.';
    if (
      task.status === 'DONE' ||
      (task.assignees || [])
        .concat(task.currentAssignees || [])
        .some((part) => part.personalStatus === 'DONE')
    )
      return 'Không thể xóa công việc đã có phần hoàn thành.';
    if (task.status === 'CANCELLED') return 'Công việc đã hủy.';
    return '';
  }
  pendingShiftLabel(task: ApiTask) {
    const shift = task.pendingConfirm?.shift;
    if (!shift) return '—';
    const date = shift.date.slice(0, 10);
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    const weekday = day === 0 ? 'CN' : `T${day + 1}`;
    return `${shift.label} ${weekday} ${date.slice(8, 10)}/${date.slice(5, 7)}`;
  }
  async confirmPendingTask(task: ApiTask) {
    if (this.busy || task.status !== 'PENDING_CONFIRM') return;
    this.busy = true;
    this.pendingConfirmError.set('');
    try {
      await this.api.confirmTask(task.id);
      this.notify('Đã xác nhận hoàn thành công việc.');
      await this.loadTasks();
    } catch (error) {
      this.pendingConfirmError.set((error as Error).message);
    } finally {
      this.busy = false;
    }
  }
  openTaskRejection(task: ApiTask) {
    if (this.busy || task.status !== 'PENDING_CONFIRM') return;
    this.rejectReason.set('');
    this.rejectShiftId.set('');
    this.rejectAssigneeIds.set([]);
    this.rejectError.set('');
    this.rejectSubmitted.set(false);
    this.rejectingTask.set(task);
  }
  closeTaskRejection() {
    if (!this.busy) this.rejectingTask.set(null);
  }
  get rejectShifts() {
    return this.repository
      .state()
      .shifts.filter(
        (shift) =>
          shift.status !== 'CANCELLED' &&
          !this.shiftStarted(shift) &&
          this.eligibleAssignments(shift.id).length > 0,
      )
      .sort((a, b) => `${a.date}T${a.start}`.localeCompare(`${b.date}T${b.start}`));
  }
  get rejectAssignments() {
    return this.rejectShifts.some((shift) => shift.id === this.rejectShiftId())
      ? this.eligibleAssignments(this.rejectShiftId())
      : [];
  }
  get canRejectAndAssign() {
    const ids = this.rejectAssigneeIds();
    const assignments = this.rejectAssignments;
    return (
      this.rejectReasonValid() &&
      ids.length > 0 &&
      ids.every((id) => assignments.some((assignment) => assignment.id === id))
    );
  }
  changeRejectShift(id: string) {
    if (this.busy) return;
    this.rejectShiftId.set(id);
    this.rejectAssigneeIds.set([]);
    this.rejectError.set('');
  }
  setRejectAssignee(id: string, checked: boolean) {
    if (this.busy || !this.rejectAssignments.some((assignment) => assignment.id === id)) return;
    this.rejectAssigneeIds.update((ids) =>
      checked ? [...new Set([...ids, id])] : ids.filter((item) => item !== id),
    );
  }
  async submitTaskRejection(reassign: boolean) {
    const task = this.rejectingTask();
    if (!task || this.busy || task.status !== 'PENDING_CONFIRM') return;
    this.rejectSubmitted.set(true);
    this.rejectError.set('');
    if (!this.rejectReasonValid()) return;
    if (reassign && !this.canRejectAndAssign) {
      this.rejectError.set('Chọn ca chưa bắt đầu và ít nhất một nhân viên trong ca.');
      return;
    }
    const body: TaskReject = { reason: this.rejectReason().trim() };
    const names = reassign
      ? this.rejectAssignments
          .filter((assignment) => this.rejectAssigneeIds().includes(assignment.id))
          .map((assignment) => this.employeeFor(assignment.employeeId)?.fullName)
          .filter(Boolean)
          .join(', ')
      : '';
    if (reassign) {
      body.shiftId = this.rejectShiftId();
      body.assigneeAssignmentIds = [...this.rejectAssigneeIds()];
    }
    this.busy = true;
    try {
      await this.api.rejectTask(task.id, body);
      this.rejectingTask.set(null);
      this.notify(names ? `Đã trả lại công việc và giao cho ${names}.` : 'Đã trả lại công việc.');
      await this.loadTasks();
    } catch (error) {
      this.rejectError.set((error as Error).message);
    } finally {
      this.busy = false;
    }
  }
  openTaskForm() {
    if (this.busy || this.tasksLoading()) return;
    this.resetTaskForm();
    this.editorOpen.set(true);
  }
  private resetTaskForm() {
    this.editingTask.set(null);
    this.editorStep.set(1);
    this.taskTitle.set('');
    this.taskDescription.set('');
    this.taskShiftId.set('');
    this.taskAssigneeIds.set([]);
    this.taskWeek.set(this.currentWeek);
    this.taskFormError.set('');
    this.taskTitleError.set('');
    this.taskDescriptionError.set('');
  }
  closeTaskForm() {
    if (!this.busy) this.editorOpen.set(false);
  }
  editTask(task: ApiTask, assign = false) {
    if (this.busy || !this.taskEditable(task)) return;
    this.resetTaskForm();
    this.editingTask.set(task);
    this.taskTitle.set(task.title);
    this.taskDescription.set(task.description || '');
    const shift =
      this.taskShift(task) ||
      (task.kind === 'VIEWING'
        ? this.repository.state().shifts.find((s) => this.viewingContains(task, s))
        : undefined);
    this.taskShiftId.set(shift?.id || '');
    const viewingDate =
      task.viewing?.date?.slice(0, 10) ||
      (task.scheduledAt
        ? new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Ho_Chi_Minh',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(new Date(task.scheduledAt))
        : '');
    this.taskWeek.set(
      shift
        ? weekStart(new Date(`${shift.date}T12:00:00`))
        : viewingDate
          ? weekStart(new Date(`${viewingDate}T12:00:00`))
          : this.currentWeek,
    );
    this.taskAssigneeIds.set(
      this.taskPeople(task)
        .filter((part) => !part.waitingAdmin)
        .map((part) => part.assignmentId),
    );
    this.editorStep.set(assign ? 2 : 1);
    this.editorOpen.set(true);
  }
  eligibleAssignments(shiftId: string) {
    return this.repository
      .activeAssignments(shiftId)
      .filter(
        (assignment) =>
          ['REGISTERED', 'IN_PROGRESS'].includes(assignment.status) &&
          this.employeeFor(assignment.employeeId)?.status === 'ACTIVE',
      );
  }
  get taskShifts() {
    const task = this.editingTask();
    return this.repository
      .week(this.taskWeek())
      .filter(
        (shift) =>
          shift.status !== 'CANCELLED' &&
          !this.shiftEnded(shift) &&
          (task?.kind !== 'VIEWING' || this.viewingContains(task, shift)),
      )
      .sort((a, b) => `${a.date}T${a.start}`.localeCompare(`${b.date}T${b.start}`));
  }
  viewingContains(task: ApiTask, shift: StaffShift) {
    const start =
      task.scheduledAt ||
      (task.viewing &&
        `${task.viewing.date.slice(0, 10)}T${task.viewing.startTime.slice(0, 5)}:00+07:00`);
    const end =
      task.scheduledEndAt ||
      (task.viewing &&
        `${task.viewing.date.slice(0, 10)}T${task.viewing.endTime.slice(0, 5)}:00+07:00`);
    if (!start || !end) return task.currentShiftId === shift.id;
    return (
      Date.parse(shift.startsAt || `${shift.date}T${shift.start}:00+07:00`) <= Date.parse(start) &&
      Date.parse(shift.endsAt || `${shift.date}T${shift.end}:00+07:00`) >= Date.parse(end)
    );
  }
  get taskFormAssignments(): ShiftAssignment[] {
    const items = this.eligibleAssignments(this.taskShiftId());
    const task = this.editingTask();
    if (task?.currentShiftId === this.taskShiftId()) {
      for (const part of this.taskPeople(task)) {
        if (part.personalStatus === 'DONE' && !items.some((a) => a.id === part.assignmentId))
          items.push({
            id: part.assignmentId,
            employeeId: part.employeeId,
            shiftId: this.taskShiftId(),
            status: 'COMPLETED',
          });
      }
    }
    return items;
  }
  assigneeDone(id: string) {
    const task = this.editingTask();
    return (
      !!task &&
      task.currentShiftId === this.taskShiftId() &&
      this.taskPeople(task).some(
        (part) => part.assignmentId === id && part.personalStatus === 'DONE',
      )
    );
  }
  changeTaskWeek(value: string) {
    if (!value) return;
    this.taskWeek.set(weekStart(new Date(`${value}T12:00:00`)));
    this.changeTaskShift('');
  }
  changeTaskShift(id: string) {
    if (this.busy) return;
    this.taskShiftId.set(id);
    const task = this.editingTask();
    this.taskAssigneeIds.set(
      task?.currentShiftId === id
        ? this.taskPeople(task)
            .filter((part) => part.personalStatus === 'DONE')
            .map((part) => part.assignmentId)
        : [],
    );
    this.taskFormError.set('');
  }
  setTaskAssignee(id: string, checked: boolean) {
    if (this.busy || this.assigneeDone(id)) return;
    this.taskAssigneeIds.update((ids) =>
      this.editingTask()?.kind === 'VIEWING'
        ? checked
          ? [id]
          : []
        : checked
          ? [...new Set([...ids, id])]
          : ids.filter((item) => item !== id),
    );
  }
  validateTaskDetails() {
    this.taskTitleError.set(!this.taskTitle().trim() ? 'Vui lòng nhập tên công việc.' : '');
    this.taskDescriptionError.set(
      this.taskDescription().trim().length > 2000 ? 'Mô tả tối đa 2000 ký tự.' : '',
    );
    return !this.taskTitleError() && !this.taskDescriptionError();
  }
  nextTaskStep() {
    if (this.busy) return;
    this.taskFormError.set('');
    if (this.editorStep() === 1 && this.validateTaskDetails()) this.editorStep.set(2);
    else if (this.editorStep() === 2) {
      const shift = this.taskShifts.find((s) => s.id === this.taskShiftId());
      if (!shift) this.taskFormError.set('Chọn ca chưa kết thúc.');
      else if (!this.eligibleAssignments(shift.id).length)
        this.taskFormError.set('Ca chưa có nhân viên trực.');
      else this.editorStep.set(3);
    }
  }
  async saveTask(unassigned = false, detailsOnly = false) {
    const task = this.editingTask();
    if (
      this.busy ||
      !this.editorOpen() ||
      !this.validateTaskDetails() ||
      (task && !this.taskEditable(task))
    )
      return;
    this.taskFormError.set('');
    if (unassigned && task && task.status !== 'UNASSIGNED') return;
    if (detailsOnly && !task) return;
    if (!unassigned && !detailsOnly) {
      const shift = this.taskShifts.find((s) => s.id === this.taskShiftId());
      if (!shift) {
        this.taskFormError.set('Chọn ca chưa kết thúc.');
        return;
      }
      const ids = this.taskAssigneeIds();
      if (!ids.length) {
        this.taskFormError.set('Chọn ít nhất một nhân viên trong ca.');
        return;
      }
      if (task?.kind === 'VIEWING' && ids.length !== 1) {
        this.taskFormError.set('Việc dẫn khách xem phòng cần đúng một người phụ trách.');
        return;
      }
      if (ids.some((id) => !this.taskFormAssignments.some((a) => a.id === id))) {
        this.taskFormError.set('Nhân viên được chọn không trực ca này.');
        return;
      }
      if (
        task &&
        this.taskPeople(task).some(
          (part) => part.personalStatus === 'DONE' && !ids.includes(part.assignmentId),
        )
      ) {
        this.taskFormError.set('Không thể bỏ nhân viên đã hoàn thành phần việc.');
        return;
      }
    }
    const body: TaskUpdate = { description: this.taskDescription().trim() };
    if (task?.kind !== 'VIEWING') body.title = this.taskTitle().trim();
    if (!unassigned && !detailsOnly) {
      body.shiftId = this.taskShiftId();
      body.assigneeAssignmentIds = [...this.taskAssigneeIds()];
    }
    this.busy = true;
    try {
      if (task) await this.api.updateTask(task.id, body);
      else await this.api.createTask({ ...body, title: this.taskTitle().trim() });
      this.editorOpen.set(false);
      this.notify(
        unassigned
          ? 'Đã lưu công việc chưa giao.'
          : detailsOnly
            ? 'Đã cập nhật công việc.'
            : 'Đã lưu và giao công việc.',
      );
      await this.loadTasks();
    } catch (error) {
      this.taskFormError.set((error as Error).message);
    } finally {
      this.busy = false;
    }
  }
  requestDeleteTask(task: ApiTask) {
    if (!this.busy && !this.taskDeleteReason(task)) this.confirmTask.set(task);
  }
  async deleteTask() {
    const task = this.confirmTask();
    if (!task || this.busy || this.taskDeleteReason(task)) return;
    this.busy = true;
    try {
      await this.api.cancelTask(task.id);
      this.confirmTask.set(null);
      this.notify('Đã xóa hẳn công việc.');
      await this.loadTasks();
    } catch (error) {
      this.error = (error as Error).message;
    } finally {
      this.busy = false;
    }
  }
  closeConfirmation() {
    if (this.busy) return;
    this.confirmTask.set(null);
    this.confirmAssignment.set(null);
    this.confirmPeriod = undefined;
  }
}
