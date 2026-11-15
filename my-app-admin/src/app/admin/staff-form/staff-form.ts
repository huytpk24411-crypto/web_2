import { Component, Input, OnChanges, signal } from '@angular/core';
import { StaffProfile } from '../../classes/StaffProfile';
import { STAFF_CONTRACT_TYPES } from '../../services/staff-service';
import { dateString, EMPTY_FORM, StaffPage, weekStart } from '../staff-page';

@Component({
  selector: 'app-staff-form',
  standalone: false,
  templateUrl: './staff-form.html',
  styleUrl: './staff-form.css',
})
export class StaffFormComponent extends StaffPage implements OnChanges {
  readonly positions = [
    ...new Set([
      ...this.repository.employees().map((e) => e.position),
      'Chuyên viên tư vấn',
      'Chuyên viên môi giới',
      'Điều phối ca trực',
      'Hỗ trợ vận hành',
      'Kiểm tra phòng',
    ]),
  ];

  readonly contractTypes = STAFF_CONTRACT_TYPES;
  get validContractType() {
    return this.contractTypes.some((type) => type.value === this.form.contractType);
  }

  @Input() employeeId = '';

  employee?: StaffProfile;

  attempted = false;

  form: Omit<StaffProfile, 'id' | 'employeeCode'> = EMPTY_FORM();

  currentWeek = weekStart(new Date());

  scheduleLocation = '';

  scheduleEmployee = '';

  readonly dateNow = dateString(new Date());

  employeeWeekCount(id: string) {
    return this.visibleShifts.filter((s) => !!this.assignmentFor(id, s.id)).length;
  }

  employeeCompletedWeekCount(id: string) {
    return this.repository
      .week(this.currentWeek)
      .filter((s) => this.assignmentFor(id, s.id)?.status === 'COMPLETED').length;
  }

  focusInvalid() {
    document
      .querySelector<HTMLElement>('.field:has(.field-error) input, .field:has(.field-error) select')
      ?.focus();
  }

  get selectedEmployee() {
    return this.repository.employee(this.employeeId);
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

  validPhone() {
    return (
      /^\+?[0-9 ()-]{9,18}$/.test(this.form.phone) &&
      /^\d{9,15}$/.test(this.form.phone.replace(/\D/g, ''))
    );
  }

  validEmail() {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.form.email);
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

  private savingState = signal(false);
  get saving() {
    return this.savingState();
  }
  set saving(value: boolean) {
    this.savingState.set(value);
  }
  uploading = signal(false);
  async saveEmployee(): Promise<void> {
    if (this.saving || this.uploading()) return;
    this.attempted = true;
    if (!this.validateForm()) {
      this.error = 'Vui lòng kiểm tra các trường bắt buộc và thông tin chưa hợp lệ.';
      return;
    }
    this.saving = true;
    try {
      const saved = await this.repository.saveEmployeeRecord(
        this.form,
        this.employeeId || undefined,
      );
      this.error = '';
      if (this.employeeId) {
        this.notify(`Đã lưu hồ sơ ${saved.employeeCode}.`);
        void this.router.navigate(['/admin/staff', saved.id]);
      } else {
        void this.router.navigate(['/admin/staff', saved.id, 'success']);
      }
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Không thể lưu hồ sơ.';
    } finally {
      this.saving = false;
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
      this.validContractType &&
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
    if (!file || this.uploading() || this.saving) return;
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      this.error = 'Ảnh đại diện cần là JPG, PNG hoặc WebP, tối đa 2 MB.';
      return;
    }
    this.uploading.set(true);
    try {
      this.form.avatar = await this.repository.uploadAvatar(file);
      this.error = '';
    } catch (error) {
      this.error = this.repository.catalogApi.message(error);
    } finally {
      this.uploading.set(false);
    }
  }

  assignmentFor(employeeId: string, shiftId: string) {
    return this.repository.activeAssignments(shiftId, employeeId)[0];
  }

  ngOnChanges(): void {
    this.employee = this.repository.employee(this.employeeId);
    this.loadForm();
    if (this.repository.catalogApi.authenticated) {
      this.saving = true;
      void this.repository
        .refreshEmployees()
        .then(async () => {
          if (this.employeeId) this.employee = await this.repository.loadEmployee(this.employeeId);
          this.loadForm();
        })
        .catch((error) => {
          this.error = this.repository.catalogApi.message(error);
        })
        .finally(() => (this.saving = false));
    }
  }
}
