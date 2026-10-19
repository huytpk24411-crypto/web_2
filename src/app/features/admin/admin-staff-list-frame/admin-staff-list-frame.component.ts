import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, inject, OnInit, OnDestroy, DestroyRef, HostListener } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { RegistrationPeriod, StaffProfile, StaffShift, StaffStatus } from '../../../models/domain';
import { StaffDemoRepository, staffStatusLabel } from '../../../services/staff-demo.repository';

type StaffView = 'list' | 'form' | 'success' | 'detail' | 'schedule' | 'performance';
type DetailTab = 'profile' | 'schedule' | 'tasks' | 'performance';
const EMPTY_FORM = (): Omit<StaffProfile, 'id' | 'employeeCode'> => ({
  fullName: '',
  birthDate: '',
  gender: 'OTHER',
  phone: '',
  email: '',
  position: '',
  workLocationId: '',
  startDate: '',
  contractType: '',
  status: 'ACTIVE',
  avatar: '/assets/asset-002.jpg',
});
const dateString = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
const weekStart = (date: Date) => {
  const monday = new Date(date);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return dateString(monday);
};
const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return dateString(value);
};

@Component({
  selector: 'app-admin-staff-list-frame',
  standalone: false,
  templateUrl: './admin-staff-list-frame.component.html',
  styleUrls: [],
})
export class AdminStaffListFrameComponent implements OnInit, OnDestroy {
  private destroyRef = inject(DestroyRef);
  attendanceTimes: Record<string, string> = {};
  readonly repository = inject(StaffDemoRepository);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  readonly positions = [
    'Chuyên viên tư vấn',
    'Chuyên viên môi giới',
    'Điều phối ca trực',
    'Hỗ trợ vận hành',
    'Kiểm tra phòng',
  ];
  view: StaffView = 'list';
  detailTab: DetailTab = 'profile';
  employeeId = '';
  employee?: StaffProfile;
  query = '';
  positionFilter = '';
  locationFilter = '';
  statusFilter = '';
  sortBy = 'name';
  page = 1;
  pageSize = 6;
  toast = '';
  error = '';
  attempted = false;
  form: Omit<StaffProfile, 'id' | 'employeeCode'> = EMPTY_FORM();
  avatarUrl = '';
  selectedEmployeeId = '';
  selectedShiftId = '';
  currentWeek = weekStart(new Date());
  scheduleLocation = '';
  scheduleEmployee = '';
  performancePeriod = '';
  showPeriodForm = false;
  showShiftForm = false;
  showTaskForm = false;
  showDeactivate = false;
  adjustmentShiftId = '';
  deleteMode = false;
  performanceQuery = '';
  editingShiftId = '';
  taskTitle = '';
  taskAssigneeIds: string[] = [];
  taskCarryTargets: Record<string, string> = {};
  periodForm = {
    name: '',
    weekStart: '',
    opensAt: '',
    closesAt: '',
    capacity: 4,
    locationId: '',
  };
  shiftForm = {
    date: '',
    start: '08:30',
    end: '12:30',
    capacity: 4,
    workLocationId: '',
    label: 'Ca sáng',
  };
  assignmentEmployeeId = '';
  readonly dateNow = dateString(new Date());
  private toastTimer?: ReturnType<typeof setTimeout>;
  selectedIds = new Set<string>();
  get allSelected() {
    return (
      this.pagedEmployees.length > 0 && this.pagedEmployees.every((p) => this.selectedIds.has(p.id))
    );
  }
  toggleSelection(id: string) {
    this.selectedIds.has(id) ? this.selectedIds.delete(id) : this.selectedIds.add(id);
  }
  selectPage() {
    const all = this.allSelected;
    this.pagedEmployees.forEach((p) =>
      all ? this.selectedIds.delete(p.id) : this.selectedIds.add(p.id),
    );
  }
  get pageNumbers() {
    return Array.from({ length: this.pages }, (_, i) => i + 1);
  }
  get weekSummary() {
    const shifts = this.visibleShifts;
    const count = (items: StaffShift[]) =>
      items.reduce((n, s) => n + this.repository.activeAssignments(s.id).length, 0);
    return {
      total: count(shifts),
      morning: count(shifts.filter((s) => s.start < '12:00')),
      afternoon: count(shifts.filter((s) => s.start >= '12:00' && s.start < '18:00')),
      capacity: shifts.reduce((n, s) => n + s.capacity, 0),
    };
  }
  get matrixEmployees() {
    return this.employees.filter(
      (p) =>
        (!this.scheduleEmployee || p.id === this.scheduleEmployee) &&
        (!this.scheduleLocation ||
          p.workLocationId === this.scheduleLocation ||
          this.visibleShifts.some((s) => !!this.assignmentFor(p.id, s.id))),
    );
  }
  employeeDayShifts(id: string, date: string) {
    return this.shiftsForDay(date).filter((s) => !!this.assignmentFor(id, s.id));
  }
  employeeWeekCount(id: string) {
    return this.visibleShifts.filter((s) => !!this.assignmentFor(id, s.id)).length;
  }
  employeeCompletedWeekCount(id: string) {
    return this.repository
      .week(this.currentWeek)
      .filter((s) => this.assignmentFor(id, s.id)?.status === 'COMPLETED').length;
  }
  get nextShift() {
    return this.repository
      .week(this.currentWeek)
      .filter((s) => new Date(`${s.date}T${s.start}`) > new Date())
      .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`))[0];
  }
  get taskCompletion() {
    const t = this.performanceTotals;
    return t.tasksTotal ? Math.round((t.tasksDone / t.tasksTotal) * 100) : 0;
  }
  get chartPeriods() {
    return (
      this.performancePeriod
        ? this.periods.filter((p) => p.id === this.performancePeriod)
        : this.periods.slice(-4)
    ).map((p) => {
      const totals = this.employees.reduce(
        (sum, person) => {
          const m = this.repository.metrics(person.id, p.id);
          return { completed: sum.completed + m.completed, onTime: sum.onTime + m.onTime };
        },
        { completed: 0, onTime: 0 },
      );
      return { label: p.weekStart, ...totals };
    });
  }
  get chartMax() {
    return Math.max(1, ...this.chartPeriods.map((p) => Math.max(p.completed, p.onTime)));
  }
  get detailBars() {
    const shifts = this.currentEmployeeAssignments
      .map((a) => this.shiftFor(a.shiftId)!)
      .filter(Boolean);
    const latest =
      shifts
        .map((s) => s.date)
        .sort()
        .at(-1) || this.currentWeek;
    const start = weekStart(new Date(`${latest}T12:00`));
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, i);
      const assignments = this.currentEmployeeAssignments.filter(
        (a) => this.shiftFor(a.shiftId)?.date === date,
      );
      return {
        label: i === 6 ? 'CN' : `T${i + 2}`,
        assigned: assignments.length,
        completed: assignments.filter((a) => a.status === 'COMPLETED').length,
      };
    });
  }
  get detailBarMax() {
    return Math.max(1, ...this.detailBars.map((b) => b.assigned));
  }
  focusInvalid() {
    document
      .querySelector<HTMLElement>('.field:has(.field-error) input, .field:has(.field-error) select')
      ?.focus();
  }

  ngOnInit(): void {
    this.route.data.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((data) => {
      this.view = (data['staffView'] || 'list') as StaffView;
      this.attempted = false;
      this.error = '';
      if (this.view === 'schedule') {
        this.selectFirstShift();
      }
      if (this.view === 'detail') {
        const tab = this.route.snapshot.queryParamMap.get('tab');
        if (tab === 'schedule' || tab === 'tasks' || tab === 'performance') this.detailTab = tab;
        else this.detailTab = 'profile';
      }
      if (this.view === 'form') this.loadForm();
    });
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.employeeId = params.get('id') || '';
      this.employee = this.repository.employee(this.employeeId);
      if (this.view === 'form') this.loadForm();
    });
  }
  get employees() {
    return this.repository.employees();
  }
  get locations() {
    return this.repository.state().locations;
  }
  get periods() {
    return this.repository.state().periods;
  }
  get selectedEmployee() {
    return this.repository.employee(this.employeeId);
  }
  get activeCount() {
    return this.employees.filter((employee) => employee.status === 'ACTIVE').length;
  }
  get filteredEmployees() {
    const filtered = this.employees.filter((employee) => {
      const location = this.repository.location(employee.workLocationId);
      const text =
        `${employee.employeeCode} ${employee.fullName} ${employee.phone} ${employee.email}`.toLocaleLowerCase(
          'vi',
        );
      return (
        (!this.query || text.includes(this.query.toLocaleLowerCase('vi'))) &&
        (!this.positionFilter || employee.position === this.positionFilter) &&
        (!this.locationFilter || employee.workLocationId === this.locationFilter) &&
        (!this.statusFilter || employee.status === this.statusFilter) &&
        (!!location || !this.locationFilter)
      );
    });
    return filtered.sort((a, b) =>
      this.sortBy === 'code'
        ? a.employeeCode.localeCompare(b.employeeCode)
        : this.sortBy === 'position'
          ? a.position.localeCompare(b.position)
          : a.fullName.localeCompare(b.fullName, 'vi'),
    );
  }
  get pages() {
    return Math.max(1, Math.ceil(this.filteredEmployees.length / this.pageSize));
  }
  get pageEnd() {
    return Math.min(this.page * this.pageSize, this.filteredEmployees.length);
  }
  get duplicatePhone() {
    return this.employees.some(
      (employee) =>
        employee.id !== this.employeeId &&
        employee.phone.replace(/\D/g, '') === this.form.phone.replace(/\D/g, '') &&
        !!this.form.phone,
    );
  }
  get duplicateEmail() {
    return this.employees.some(
      (employee) =>
        employee.id !== this.employeeId &&
        employee.email.toLowerCase() === this.form.email.trim().toLowerCase() &&
        !!this.form.email,
    );
  }
  get pagedEmployees() {
    return this.filteredEmployees.slice((this.page - 1) * this.pageSize, this.page * this.pageSize);
  }
  get weekDates() {
    return Array.from({ length: 7 }, (_, index) => addDays(this.currentWeek, index));
  }
  get visibleShifts() {
    return this.repository.week(this.currentWeek).filter((shift) => {
      const assignments = this.repository.activeAssignments(shift.id);
      return (
        (!this.scheduleLocation || shift.workLocationId === this.scheduleLocation) &&
        (!this.scheduleEmployee ||
          assignments.some((assignment) => assignment.employeeId === this.scheduleEmployee))
      );
    });
  }
  get selectedShift(): StaffShift | undefined {
    return this.repository.state().shifts.find((shift) => shift.id === this.selectedShiftId);
  }
  get selectedShiftAssignments() {
    return this.selectedShift ? this.repository.activeAssignments(this.selectedShift.id) : [];
  }
  get selectedShiftTasks() {
    return this.selectedShift
      ? this.repository
          .state()
          .tasks.filter((task) => task.currentShiftId === this.selectedShift!.id)
      : [];
  }
  get currentEmployeeAssignments() {
    return this.employee ? this.repository.assignmentsFor(this.employee.id) : [];
  }
  get currentEmployeeTasks() {
    return this.employee ? this.repository.tasksFor(this.employee.id) : [];
  }
  get candidateCarryShifts() {
    const origin = this.selectedShift;
    if (!origin) return [];
    return this.repository
      .state()
      .shifts.filter(
        (shift) =>
          `${shift.date}T${shift.start}` >= `${origin.date}T${origin.end}` &&
          shift.id !== origin.id &&
          this.repository.activeAssignments(shift.id).length > 0,
      );
  }
  get performanceRows() {
    return this.employees
      .filter(
        (employee) =>
          !this.performancePeriod ||
          this.repository.assignmentsFor(employee.id, this.performancePeriod).length > 0,
      )
      .map((employee) => ({
        employee,
        metrics: this.repository.metrics(employee.id, this.performancePeriod),
      }))
      .sort(
        (a, b) =>
          b.metrics.taskRate - a.metrics.taskRate || b.metrics.completed - a.metrics.completed,
      );
  }
  get performanceTotals() {
    return this.performanceRows.reduce(
      (total, row) => ({
        assigned: total.assigned + row.metrics.assigned,
        completed: total.completed + row.metrics.completed,
        onTime: total.onTime + row.metrics.onTime,
        attendanceCount: total.attendanceCount + row.metrics.attendanceCount,
        tasksTotal: total.tasksTotal + row.metrics.tasksTotal,
        tasksDone: total.tasksDone + row.metrics.tasksDone,
      }),
      { assigned: 0, completed: 0, onTime: 0, attendanceCount: 0, tasksTotal: 0, tasksDone: 0 },
    );
  }
  get rankedEmployees() {
    const query = this.performanceQuery.trim().toLocaleLowerCase('vi');
    return this.performanceRows.filter((row) =>
      `${row.employee.fullName} ${row.employee.employeeCode}`
        .toLocaleLowerCase('vi')
        .includes(query),
    );
  }
  openAdjustment(): void {
    this.toast = '';
    if (this.selectedShift) this.adjustmentShiftId = this.selectedShift.id;
  }
  adjusted(shiftId: string): void {
    this.selectedShiftId = shiftId;
    this.error = '';
  }
  get currentPeriod(): RegistrationPeriod | undefined {
    return this.periods.find((period) => period.weekStart === this.currentWeek);
  }
  get periodStatus() {
    const period = this.currentPeriod;
    if (!period) return 'Không có đợt đăng ký cho tuần này';
    const now = Date.now();
    if (now < new Date(period.opensAt).getTime()) return 'Chưa mở đăng ký';
    if (now > new Date(period.closesAt).getTime()) return 'Đã đóng đăng ký';
    return 'Đang mở đăng ký · nhận chỗ trước, không cần duyệt';
  }
  ngLocation(id: string) {
    return this.repository.location(id)?.name || 'Chưa phân cơ sở';
  }
  statusLabel(status: StaffStatus) {
    return staffStatusLabel(status);
  }
  shiftDate(date: string) {
    return new Date(`${date}T12:00:00`);
  }
  shiftFor(id: string) {
    return this.repository.state().shifts.find((shift) => shift.id === id);
  }
  employeeFor(id: string) {
    return this.repository.employee(id);
  }
  assignmentsForShift(shiftId: string) {
    return this.repository.activeAssignments(shiftId);
  }
  shiftsForDay(date: string) {
    return this.visibleShifts.filter((shift) => shift.date === date);
  }
  validPhone() {
    return (
      /^\+?[0-9 ()-]{9,18}$/.test(this.form.phone) &&
      /^\d{9,15}$/.test(this.form.phone.replace(/\D/g, ''))
    );
  }
  validEmail() {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.form.email);
  }
  openDeactivate(employee: StaffProfile, deleteMode = false) {
    this.toast = '';
    this.deleteMode = deleteMode;
    this.employee = employee;
    this.employeeId = employee.id;
    this.showDeactivate = true;
    setTimeout(() =>
      document.querySelector<HTMLButtonElement>('.staff-confirm-modal button')?.focus(),
    );
  }
  shiftFill(shift: StaffShift) {
    return this.repository.activeAssignments(shift.id).length;
  }
  registrationWindow(period: RegistrationPeriod) {
    const now = Date.now();
    return now >= new Date(period.opensAt).getTime() && now <= new Date(period.closesAt).getTime();
  }
  shiftRegistrationOpen(shift: StaffShift, period?: RegistrationPeriod) {
    return (
      !!period &&
      this.registrationWindow(period) &&
      new Date(`${shift.date}T${shift.start}:00`) > new Date()
    );
  }
  shiftHasEnded(shift: StaffShift) {
    return new Date(`${shift.date}T${shift.end}:00`) <= new Date();
  }
  navigate(view: string) {
    const targets: Record<string, string> = {
      list: '/admin/staff',
      schedule: '/admin/staff/schedule',
      performance: '/admin/staff/performance',
      new: '/admin/staff/new',
    };
    void this.router.navigateByUrl(targets[view] || targets['list']);
  }
  openDetails(employee: StaffProfile, tab: DetailTab = 'profile') {
    this.detailTab = tab;
    void this.router.navigate(['/admin/staff', employee.id], { queryParams: { tab } });
  }
  editEmployee(employee: StaffProfile) {
    void this.router.navigate(['/admin/staff', employee.id, 'edit']);
  }
  private loadForm(): void {
    const existing = this.employeeId ? this.repository.employee(this.employeeId) : undefined;
    if (existing) {
      const { id: _id, employeeCode: _code, ...form } = existing;
      this.form = { ...form };
    } else if (!this.employeeId) {
      this.form = EMPTY_FORM();
    }
  }
  saveEmployee(): void {
    this.attempted = true;
    if (!this.validateForm()) {
      this.error = 'Vui lòng kiểm tra các trường bắt buộc và thông tin chưa hợp lệ.';
      return;
    }
    try {
      const saved = this.repository.saveEmployee(this.form, this.employeeId || undefined);
      this.error = '';
      if (this.employeeId) {
        this.notify(`Đã lưu hồ sơ minh họa ${saved.employeeCode}.`);
        void this.router.navigate(['/admin/staff', saved.id]);
      } else {
        void this.router.navigate(['/admin/staff', saved.id, 'success']);
      }
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Không thể lưu hồ sơ demo.';
    }
  }
  private validateForm(): boolean {
    const form = this.form;
    const birthDate = new Date(`${form.birthDate}T12:00:00`);
    const startDate = new Date(`${form.startDate}T12:00:00`);
    return (
      !!form.fullName.trim() &&
      this.validPhone() &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) &&
      !!form.position &&
      !!this.repository.location(form.workLocationId) &&
      !!form.contractType &&
      Number.isFinite(birthDate.getTime()) &&
      form.birthDate < this.dateNow &&
      Number.isFinite(startDate.getTime()) &&
      form.startDate <= this.dateNow &&
      form.startDate >= form.birthDate &&
      !!form.status &&
      !!form.gender
    );
  }
  async readAvatar(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      this.error = 'Ảnh đại diện cần là JPG, PNG hoặc WebP, tối đa 2 MB.';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        this.form.avatar = reader.result;
        this.error = '';
      } else this.error = 'Không đọc được ảnh đã chọn.';
    };
    reader.onerror = () => (this.error = 'Không đọc được ảnh đã chọn.');
    reader.readAsDataURL(file);
  }
  async copyEmail(): Promise<void> {
    if (!this.selectedEmployee?.email) return;
    try {
      await navigator.clipboard.writeText(this.selectedEmployee.email);
      this.notify('Đã sao chép email.');
    } catch {
      this.error = 'Trình duyệt không cho phép sao chép email. Hãy chọn và sao chép thủ công.';
    }
  }
  exportCsv(selectedOnly = false): void {
    const rows = [
      ['Mã nhân viên', 'Họ tên', 'Chức vụ', 'Cơ sở', 'Điện thoại', 'Email', 'Trạng thái'],
      ...this.filteredEmployees
        .filter((employee) => !selectedOnly || this.selectedIds.has(employee.id))
        .map((employee) => [
          employee.employeeCode,
          employee.fullName,
          employee.position,
          this.ngLocation(employee.workLocationId),
          employee.phone,
          employee.email,
          this.statusLabel(employee.status),
        ]),
    ];
    const csv =
      '\ufeff' +
      rows
        .map((row) =>
          row
            .map(
              (value) => `"${(/^[=+\-@]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`,
            )
            .join(','),
        )
        .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ihouzz-nhan-su-demo.csv';
    link.click();
    URL.revokeObjectURL(url);
  }
  pageTo(page: number): void {
    if (page >= 1 && page <= this.pages) this.page = page;
  }
  resetFilters(): void {
    this.selectedIds.clear();
    this.query = '';
    this.positionFilter = '';
    this.locationFilter = '';
    this.statusFilter = '';
    this.page = 1;
  }
  resetDemo(): void {
    if (
      !window.confirm(
        'Đặt lại dữ liệu nhân sự, ca trực và công việc minh họa về trạng thái ban đầu?',
      )
    )
      return;
    try {
      this.repository.reset();
      this.currentWeek = weekStart(new Date());
      this.notify('Đã đặt lại dữ liệu demo trên thiết bị.');
      this.resetFilters();
      this.selectedShiftId = '';
      this.navigate('list');
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Không thể đặt lại dữ liệu demo.';
    }
  }
  previousWeek(): void {
    this.currentWeek = addDays(this.currentWeek, -7);
    this.selectFirstShift();
  }
  nextWeek(): void {
    this.currentWeek = addDays(this.currentWeek, 7);
    this.selectFirstShift();
  }
  selectShift(shift: StaffShift): void {
    this.selectedShiftId = shift.id;
    this.assignmentEmployeeId = '';
    this.showTaskForm = false;
    this.taskTitle = '';
    this.taskAssigneeIds = [];
  }
  selectFirstShift(): void {
    this.selectedShiftId = this.visibleShifts[0]?.id || '';
  }
  registerForSelectedShift(): void {
    try {
      if (!this.selectedShift) throw new Error('Chọn một ca trước khi đăng ký.');
      this.repository.register(this.assignmentEmployeeId, this.selectedShift.id);
      this.notify(
        'Đã đăng ký ca demo; chỗ được giữ ngay theo thứ tự thao tác trong trình duyệt này.',
      );
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Không đăng ký được ca.';
    }
  }
  cancelAssignment(assignmentId: string): void {
    try {
      this.repository.cancelAssignment(assignmentId);
      this.notify('Đã hủy đăng ký ca demo.');
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Không hủy được ca.';
    }
  }
  toggleTask(taskId: string, employeeId: string): void {
    try {
      this.repository.toggleTask(taskId, employeeId);
      this.error = '';
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Không cập nhật được công việc.';
    }
  }
  completeTask(taskId: string): void {
    try {
      this.repository.completeTask(taskId);
      this.error = '';
      this.notify('Đã hoàn thành công việc demo.');
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Không cập nhật được công việc.';
    }
  }
  carryTask(taskId: string, shiftId: string): void {
    try {
      this.repository.carryTask(taskId, shiftId);
      this.notify('Đã chuyển công việc; ca phát sinh ban đầu vẫn được lưu.');
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Không chuyển được công việc.';
    }
  }
  addTask(): void {
    try {
      if (!this.selectedShift) throw new Error('Chọn ca trước khi giao công việc.');
      this.repository.createTask(this.selectedShift.id, this.taskTitle, this.taskAssigneeIds);
      this.taskTitle = '';
      this.taskAssigneeIds = [];
      this.showTaskForm = false;
      this.notify('Đã thêm công việc vào ca demo.');
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Không thêm được công việc.';
    }
  }
  createPeriod(): void {
    try {
      this.repository.createPeriod(this.periodForm);
      this.showPeriodForm = false;
      this.currentWeek = this.periodForm.weekStart;
      this.selectFirstShift();
      this.notify('Đã tạo đợt đăng ký demo và các ca trong tuần.');
      this.periodForm = {
        name: '',
        weekStart: '',
        opensAt: '',
        closesAt: '',
        capacity: 4,
        locationId: '',
      };
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Không tạo được đợt đăng ký.';
    }
  }
  openShiftForm(create = false): void {
    const shift = create ? undefined : this.selectedShift;
    this.editingShiftId = shift?.id || '';
    this.shiftForm.date = shift?.date || this.currentWeek;
    this.shiftForm.workLocationId = shift?.workLocationId || this.locations[0]?.id || '';
    this.shiftForm.label = shift?.label || 'Ca mới';
    this.shiftForm.start = shift?.start || '08:30';
    this.shiftForm.end = shift?.end || '12:30';
    this.shiftForm.capacity = shift?.capacity || 4;
    this.showShiftForm = true;
    setTimeout(() =>
      document.querySelector('.staff-shift-form')?.scrollIntoView({ block: 'center' }),
    );
  }
  createShift(): void {
    try {
      const periodId = this.currentPeriod?.id || '';
      this.repository.saveShift({ ...this.shiftForm, periodId }, this.editingShiftId || undefined);
      this.showShiftForm = false;
      this.editingShiftId = '';
      this.notify('Đã lưu thay đổi ca demo.');
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Không thêm được ca.';
    }
  }
  deactivate(): void {
    if (!this.employee) return;
    try {
      const name = this.employee.fullName;
      this.repository.deactivate(this.employee.id);
      this.employee = this.repository.employee(this.employee.id);
      this.showDeactivate = false;
      this.notify(`Đã ngừng hoạt động ${name}; ca tương lai đã đánh dấu cần phân công lại.`);
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Không ngừng hoạt động được nhân viên.';
    }
  }
  deleteEmployee(): void {
    if (!this.employee) return;
    try {
      const name = this.employee.fullName;
      this.repository.archiveEmployee(this.employee.id);
      this.showDeactivate = false;
      this.selectedIds.delete(this.employee.id);
      this.page = 1;
      this.notify(
        `Xóa thành công! ${name} đã được xóa khỏi danh sách vận hành. Lịch sử được giữ trong dữ liệu demo.`,
      );
      this.navigate('list');
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Không xóa được hồ sơ.';
    }
  }
  futureShiftCount(employeeId: string): number {
    return this.repository.futureAssignments(employeeId).length;
  }
  notify(message: string): void {
    this.error = '';
    this.toast = message;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 4500);
  }
  setDetailTab(tab: DetailTab): void {
    this.detailTab = tab;
    if (this.employee)
      void this.router.navigate(['/admin/staff', this.employee.id], {
        queryParams: { tab },
        replaceUrl: true,
      });
  }
  resetPeriodForm(): void {
    let monday = this.currentWeek;
    while (this.periods.some((period) => period.weekStart === monday)) monday = addDays(monday, 7);
    const opens = new Date(Date.now() - 60000);
    const closes = new Date(`${addDays(monday, 7)}T18:00:00`);
    this.periodForm = {
      name: `Đợt đăng ký tuần ${monday}`,
      weekStart: monday,
      opensAt: this.localDateTime(opens),
      closesAt: this.localDateTime(closes),
      capacity: 4,
      locationId: this.locations[0]?.id || '',
    };
    this.showPeriodForm = !this.showPeriodForm;
    setTimeout(() =>
      document.querySelector('.staff-period-form')?.scrollIntoView({ block: 'center' }),
    );
  }
  private localDateTime(date: Date): string {
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  recordAttendance(assignmentId: string): void {
    try {
      const assignment = this.repository
        .state()
        .assignments.find((item) => item.id === assignmentId)!;
      const shift = this.shiftFor(assignment.shiftId)!;
      const time = this.attendanceTimes[assignmentId];
      if (!time) throw new Error('Nhập giờ chấm công mô phỏng trước khi lưu.');
      const at = `${shift.date}T${time}:00`;
      if (assignment.status === 'REGISTERED') this.repository.checkIn(assignmentId, at);
      else this.repository.checkOut(assignmentId, at);
      this.attendanceTimes[assignmentId] = '';
      this.notify('Đã lưu giờ chấm công mô phỏng; chỉ số hiệu suất đã cập nhật.');
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Không lưu được chấm công.';
    }
  }
  @HostListener('document:keydown', ['$event'])
  modalKeyboard(event: KeyboardEvent): void {
    if (!this.showDeactivate) return;
    if (event.key === 'Escape') this.showDeactivate = false;
    if (event.key === 'Tab') {
      const buttons = Array.from(
        document.querySelectorAll<HTMLButtonElement>('.staff-confirm-modal button'),
      );
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.shiftKey && index <= 0) {
        event.preventDefault();
        buttons.at(-1)?.focus();
      } else if (!event.shiftKey && (index < 0 || index === buttons.length - 1)) {
        event.preventDefault();
        buttons[0]?.focus();
      }
    }
  }
  ngOnDestroy(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }
  assignmentFor(employeeId: string, shiftId: string) {
    return this.repository.activeAssignments(shiftId, employeeId)[0];
  }
}
