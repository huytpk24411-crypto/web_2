import { Directive, inject, OnDestroy, signal } from '@angular/core';
import { Router } from '@angular/router';
import { StaffProfile, StaffStatus } from '../classes/StaffProfile';
import { StaffService, staffStatusLabel } from '../services/staff-service';
export type DetailTab = 'profile' | 'schedule' | 'tasks' | 'performance';
export const EMPTY_FORM = (): Omit<StaffProfile, 'id' | 'employeeCode'> => ({
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
  avatar: '',
});
export const dateString = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
export const weekStart = (date: Date) => {
  const monday = new Date(date);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return dateString(monday);
};
export const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return dateString(value);
};

@Directive()
export abstract class StaffPage implements OnDestroy {
  readonly repository = inject(StaffService);

  protected router = inject(Router);

  private toastState = signal('');
  get toast() {
    return this.toastState();
  }
  set toast(value: string) {
    this.toastState.set(value);
  }

  private errorState = signal('');
  get error() {
    return this.errorState() || this.repository.error() || this.repository.shiftApi.error();
  }
  set error(value: string) {
    this.errorState.set(value);
  }

  protected toastTimer?: ReturnType<typeof setTimeout>;

  get employees() {
    return this.repository.employees();
  }

  get locations() {
    return this.repository.state().locations;
  }

  get periods() {
    return this.repository.state().periods;
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

  navigate(view: string) {
    const targets: Record<string, string> = {
      list: '/admin/staff',
      schedule: '/admin/staff/schedule',
      performance: '/admin/staff/performance',
      new: '/admin/staff/new',
    };
    void this.router.navigateByUrl(targets[view] || targets['list']);
  }

  editEmployee(employee: StaffProfile) {
    void this.router.navigate(['/admin/staff', employee.id, 'edit']);
  }

  notify(message: string): void {
    this.error = '';
    this.toast = message;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 4500);
  }

  ngOnDestroy(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }
  openDetails(employee: StaffProfile, tab: DetailTab = 'profile') {
    void this.router.navigate(['/admin/staff', employee.id], { queryParams: { tab } });
  }
}
