import { Component } from '@angular/core';
import { StaffProfile } from '../../classes/StaffProfile';
import { StaffPage, weekStart } from '../staff-page';

@Component({
  selector: 'app-admin-staff-list',
  standalone: false,
  templateUrl: './admin-staff-list.html',
  styleUrl: './admin-staff-list.css',
})
export class AdminStaffListComponent extends StaffPage {
  get positions() {
    return [...new Set(this.repository.employees().map((e) => e.position))];
  }

  employeeId = '';

  employee?: StaffProfile;

  query = '';

  positionFilter = '';

  locationFilter = '';

  statusFilter = '';

  sortBy = 'name';

  page = 1;

  pageSize = 6;

  currentWeek = weekStart(new Date());

  performancePeriod = '';

  showDeactivate = false;

  deleteMode = false;

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

  get nextShift() {
    return this.repository
      .week(this.currentWeek)
      .filter((s) => new Date(`${s.date}T${s.start}`) > new Date())
      .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`))[0];
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

  get pagedEmployees() {
    return this.filteredEmployees.slice((this.page - 1) * this.pageSize, this.page * this.pageSize);
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
    link.download = 'ihouzz-nhan-su.csv';
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

  async deactivate(): Promise<void> {
    if (!this.employee) return;
    try {
      const name = this.employee.fullName;
      await this.repository.deactivateRecord(this.employee.id);
      this.employee = this.repository.employee(this.employee.id);
      this.showDeactivate = false;
      this.notify(`Đã ngừng hoạt động ${name}; tài khoản đã bị khóa, lịch sử được giữ nguyên.`);
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Không ngừng hoạt động được nhân viên.';
    }
  }

  async deleteEmployee(): Promise<void> {
    if (!this.employee) return;
    try {
      const name = this.employee.fullName;
      await this.repository.deactivateRecord(this.employee.id);
      this.showDeactivate = false;
      this.selectedIds.delete(this.employee.id);
      this.page = 1;
      this.notify(`Đã ngừng hoạt động ${name}; giữ nguyên hồ sơ và lịch sử.`);
      this.navigate('list');
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Không xóa được hồ sơ.';
    }
  }

  futureShiftCount(employeeId: string): number {
    return this.repository.futureAssignments(employeeId).length;
  }
}
