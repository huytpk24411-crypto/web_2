import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { StaffProfile } from '../../classes/StaffProfile';
import { addDays, DetailTab, StaffPage, weekStart } from '../staff-page';

@Component({
  selector: 'app-admin-staff-detail',
  standalone: false,
  templateUrl: './admin-staff-detail.html',
  styleUrl: './admin-staff-detail.css',
})
export class AdminStaffDetailComponent extends StaffPage implements OnInit {
  async resetPassword(): Promise<void> {
    try {
      await this.repository.resetPassword(this.employeeId);
      this.error = '';
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Không đặt lại được mật khẩu.';
    }
  }
  private destroyRef = inject(DestroyRef);

  private route = inject(ActivatedRoute);

  detailTab: DetailTab = 'profile';

  employeeId = '';
  adjustmentShiftId = '';
  adjustmentAssignmentId = '';

  private employeeState = signal<StaffProfile | undefined>(undefined);
  get employee() {
    return this.employeeState();
  }
  set employee(value: StaffProfile | undefined) {
    this.employeeState.set(value);
  }

  page = 1;

  currentWeek = weekStart(new Date());

  showDeactivate = false;

  deleteMode = false;

  selectedIds = new Set<string>();

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

  get selectedEmployee() {
    return this.repository.employee(this.employeeId);
  }

  get currentEmployeeAssignments() {
    return this.employee ? this.repository.assignmentsFor(this.employee.id) : [];
  }

  get currentEmployeeTasks() {
    return this.employee ? this.repository.tasksFor(this.employee.id) : [];
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

  async copyEmail(): Promise<void> {
    if (!this.selectedEmployee?.email) return;
    try {
      await navigator.clipboard.writeText(this.selectedEmployee.email);
      this.notify('Đã sao chép email.');
    } catch {
      this.error = 'Trình duyệt không cho phép sao chép email. Hãy chọn và sao chép thủ công.';
    }
  }

  async cancelAssignment(assignmentId: string): Promise<void> {
    try {
      await this.repository.cancelAssignment(assignmentId);
      this.notify('Đã hủy đăng ký ca.');
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Không hủy được ca.';
    }
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

  setDetailTab(tab: DetailTab): void {
    this.detailTab = tab;
    if (this.employee)
      void this.router.navigate(['/admin/staff', this.employee.id], {
        queryParams: { tab },
        replaceUrl: true,
      });
  }

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.employeeId = params.get('id') || '';
      void this.repository
        .loadEmployee(this.employeeId)
        .then((employee) => {
          this.employee = employee;
        })
        .catch((error) => {
          this.error = this.repository.catalogApi.message(error);
        });
    });
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const tab = params.get('tab');
      this.detailTab =
        tab === 'schedule' || tab === 'tasks' || tab === 'performance' ? tab : 'profile';
    });
  }
}
