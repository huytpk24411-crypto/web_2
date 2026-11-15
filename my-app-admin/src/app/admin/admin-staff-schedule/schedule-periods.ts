import { Directive, signal } from '@angular/core';
import { RegistrationPeriod } from '../../classes/StaffProfile';
import { StaffPage, addDays, weekStart } from '../staff-page';

@Directive()
export abstract class SchedulePeriods extends StaffPage {
  get api() {
    return this.repository.shiftApi;
  }
  abstract viewSchedule(): void;
  private busyState = signal(false);
  get busy() {
    return this.busyState();
  }
  set busy(value: boolean) {
    this.busyState.set(value);
  }
  async periodAction(action: 'open' | 'close' | 'finalize', period = this.currentPeriod) {
    if (!period || this.busy || this.periodActionReason(period, action)) return;
    this.busy = true;
    try {
      await this.api.write(`admin/registration-periods/${encodeURIComponent(period.id)}/${action}`);
      this.notify('Đã cập nhật đợt đăng ký.');
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.busy = false;
    }
  }
  /** "Xếp bù ca thiếu" is offered for closed/finalized periods whose week has not ended yet. */
  canFillMinimum(period?: RegistrationPeriod): boolean {
    if (!period || !['CLOSED', 'FINALIZED'].includes(period.status || '')) return false;
    const end = period.weekEnd || addDays(period.weekStart, 6);
    return new Date(`${end}T17:00:00+07:00`).getTime() > Date.now();
  }
  async fillMinimum(period = this.currentPeriod) {
    if (!period || this.busy || !this.canFillMinimum(period)) return;
    this.busy = true;
    try {
      await this.api.write(
        `admin/registration-periods/${encodeURIComponent(period.id)}/fill-minimum`,
      );
      this.notify('Đã xếp bù ca cho nhân viên chưa đủ số ca tối thiểu.');
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.busy = false;
    }
  }
  private currentWeekState = signal(weekStart(new Date()));
  get currentWeek() {
    return this.currentWeekState();
  }
  set currentWeek(value: string) {
    this.currentWeekState.set(value);
  }

  private showPeriodFormState = signal(false);
  get showPeriodForm() {
    return this.showPeriodFormState();
  }
  set showPeriodForm(value: boolean) {
    this.showPeriodFormState.set(value);
  }

  private showFinalizedPeriodsState = signal(false);
  get showFinalizedPeriods() {
    return this.showFinalizedPeriodsState();
  }
  set showFinalizedPeriods(value: boolean) {
    this.showFinalizedPeriodsState.set(value);
  }
  private periodNameEdited = false;
  private editingPeriodIdState = signal('');
  get editingPeriodId() {
    return this.editingPeriodIdState();
  }
  set editingPeriodId(value: string) {
    this.editingPeriodIdState.set(value);
  }
  private periodNameState = signal('');
  get periodName() {
    return this.periodNameState();
  }
  set periodName(value: string) {
    this.periodNameState.set(value);
  }
  private periodNameErrorState = signal('');
  get periodNameError() {
    return this.periodNameErrorState();
  }
  set periodNameError(value: string) {
    this.periodNameErrorState.set(value);
  }
  private periodWeekErrorState = signal('');
  get periodWeekError() {
    return this.periodWeekErrorState();
  }
  set periodWeekError(value: string) {
    this.periodWeekErrorState.set(value);
  }
  private confirmPeriodState = signal<RegistrationPeriod | undefined>(undefined);
  get confirmPeriod() {
    return this.confirmPeriodState();
  }
  set confirmPeriod(value: RegistrationPeriod | undefined) {
    this.confirmPeriodState.set(value);
  }

  private periodFormState = signal({
    name: '',
    weekStart: '',
    opensAt: '',
    closesAt: '',
    capacity: 6,
    locationId: '',
  });
  get periodForm() {
    return this.periodFormState();
  }
  set periodForm(value: ReturnType<typeof this.periodFormState>) {
    this.periodFormState.set(value);
  }
  setPeriodName(value: string) {
    this.periodFormState.update((form) => ({ ...form, name: value }));
    this.markPeriodNameEdited();
  }
  get currentPeriod() {
    return this.periods.find((period) => period.weekStart === this.currentWeek);
  }
  registrationWindow(period: RegistrationPeriod) {
    return Date.now() >= Date.parse(period.opensAt) && Date.now() < Date.parse(period.closesAt);
  }
  get sortedPeriods() {
    return [...this.periods].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  }

  isPastFinalized(period: RegistrationPeriod) {
    const today = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return period.status === 'FINALIZED' && this.periodEnd(period) < today;
  }

  get pastFinalizedPeriods() {
    return this.sortedPeriods.filter((period) => this.isPastFinalized(period));
  }

  get visiblePeriods() {
    return this.sortedPeriods.filter(
      (period) => this.showFinalizedPeriods || !this.isPastFinalized(period),
    );
  }

  periodLabel(period: RegistrationPeriod) {
    return { DRAFT: 'Chưa mở đăng ký', OPEN: 'Đang mở', CLOSED: 'Đã đóng', FINALIZED: 'Đã chốt' }[
      period.status || 'DRAFT'
    ];
  }

  periodActionReason(period: RegistrationPeriod, action: 'open' | 'close' | 'finalize') {
    if (action === 'open') {
      if (period.status !== 'DRAFT') return 'Chỉ mở đợt chưa mở đăng ký.';
      if (!this.registrationWindow(period))
        return 'Chỉ mở được từ 08:00 thứ Năm đến trước 20:00 Chủ Nhật tuần trước.';
    }
    if (action === 'close' && period.status !== 'OPEN') return 'Chỉ đóng đợt đang mở đăng ký.';
    if (action === 'finalize' && period.status !== 'CLOSED')
      return 'Đóng đợt đăng ký trước khi chốt.';
    return '';
  }

  periodDeleteReason(period: RegistrationPeriod) {
    return period.canDelete === true
      ? ''
      : 'Không thể xóa đợt đã có nhân viên nhận ca hoặc đã có công việc.';
  }

  viewPeriod(period: RegistrationPeriod) {
    this.currentWeek = period.weekStart;
    this.viewSchedule();
  }

  editPeriod(period: RegistrationPeriod) {
    this.showPeriodForm = false;
    this.editingPeriodId = period.id;
    this.periodName = period.name;
    this.periodNameError = '';
  }

  async savePeriodName(period: RegistrationPeriod) {
    if (this.busy || this.editingPeriodId !== period.id) return;
    this.periodNameError =
      this.periodName.trim().length > 0 && this.periodName.trim().length <= 200
        ? ''
        : 'Vui lòng nhập tên từ 1 đến 200 ký tự.';
    if (this.periodNameError) return;
    this.busy = true;
    try {
      await this.api.renamePeriod(period.id, this.periodName);
      this.editingPeriodId = '';
      this.notify('Đã cập nhật tên đợt đăng ký.');
    } catch (error) {
      this.periodNameError = (error as Error).message;
      this.error = this.periodNameError;
    } finally {
      this.busy = false;
    }
  }

  requestDeletePeriod(period: RegistrationPeriod) {
    if (!this.busy && !this.periodDeleteReason(period)) this.confirmPeriod = period;
  }

  async deletePeriod() {
    const period = this.confirmPeriod;
    if (!period || this.busy || this.periodDeleteReason(period)) return;
    this.busy = true;
    try {
      await this.api.deletePeriod(period.id);
      this.confirmPeriod = undefined;
      this.viewSchedule();
      this.notify('Đã xóa đợt đăng ký và lịch ca của đợt.');
    } catch (error) {
      this.error = (error as Error).message;
    } finally {
      this.busy = false;
    }
  }

  periodEnd(period: RegistrationPeriod) {
    return period.weekEnd || addDays(period.weekStart, 6);
  }

  async createPeriod() {
    if (this.busy) return;
    this.validatePeriodWeek();
    this.periodNameError =
      !this.periodForm.name.trim() || this.periodForm.name.trim().length > 200
        ? 'Vui lòng nhập tên từ 1 đến 200 ký tự.'
        : '';
    if (this.periodWeekError || this.periodNameError) return;
    this.busy = true;
    try {
      await this.api.write('admin/registration-periods', {
        name: this.periodForm.name.trim(),
        weekStart: this.periodForm.weekStart,
      });
      this.showPeriodForm = false;
      this.currentWeek = this.periodForm.weekStart;
      this.viewSchedule();
      this.notify('Đã tạo đợt và 14 ca, tối đa 6 nhân viên mỗi ca.');
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Không tạo được đợt đăng ký.';
      const code = (error as { code?: string }).code;
      if (code === 'WEEK_EXISTS' || code === 'MONDAY_REQUIRED') this.periodWeekError = this.error;
      if (code === 'NAME_REQUIRED') this.periodNameError = this.error;
    } finally {
      this.busy = false;
    }
  }

  resetPeriodForm(week?: string): void {
    if (this.busy) return;
    let monday = week || this.currentWeek;
    if (!week)
      while (this.periods.some((period) => period.weekStart === monday))
        monday = addDays(monday, 7);
    this.periodForm = {
      name: this.defaultPeriodName(monday),
      weekStart: monday,
      opensAt: `${addDays(monday, -4)}T08:00`,
      closesAt: `${addDays(monday, -1)}T20:00`,
      capacity: 6,
      locationId: this.locations[0]?.id || '',
    };
    this.periodNameEdited = false;
    this.periodWeekError = '';
    this.periodNameError = '';
    this.editingPeriodId = '';
    this.showPeriodForm = true;
    setTimeout(() =>
      document.querySelector('.staff-period-form')?.scrollIntoView?.({ block: 'center' }),
    );
  }

  private defaultPeriodName(monday: string) {
    const end = addDays(monday, 6);
    return `Đợt đăng ký tuần ${monday.slice(8, 10)}/${monday.slice(5, 7)}–${end.slice(8, 10)}/${end.slice(5, 7)}/${end.slice(0, 4)}`;
  }

  markPeriodNameEdited() {
    this.periodNameEdited = true;
  }

  onPeriodWeekChange(value: string) {
    this.periodForm = { ...this.periodForm, weekStart: value };
    this.validatePeriodWeek();
    if (
      !this.periodNameEdited &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(`${value}T12:00:00+07:00`))
    ) {
      this.periodForm = { ...this.periodForm, name: this.defaultPeriodName(value) };
    }
  }

  validatePeriodWeek() {
    const value = this.periodForm.weekStart;
    const date = new Date(`${value}T12:00:00+07:00`);
    this.periodWeekError =
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value ||
      date.getUTCDay() !== 1
        ? 'Ngày bắt đầu đợt phải là thứ Hai.'
        : this.periods.some((period) => period.weekStart === value)
          ? 'Tuần này đã có đợt đăng ký.'
          : '';
    if (!Number.isNaN(date.getTime())) {
      this.periodForm = {
        ...this.periodForm,
        opensAt: `${addDays(value, -4)}T08:00`,
        closesAt: `${addDays(value, -1)}T20:00`,
      };
    }
  }
}
