import {
  AfterViewInit,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnInit,
  OnDestroy,
  Output,
  inject,
} from '@angular/core';
import { StaffDemoRepository } from '../../../services/staff-demo.repository';
import { StaffShift } from '../../../models/domain';

@Component({
  selector: 'app-staff-shift-adjustment',
  standalone: false,
  templateUrl: './staff-shift-adjustment.component.html',
  styleUrls: ['./staff-shift-adjustment.component.css'],
})
export class StaffShiftAdjustmentComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() shiftId = '';
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<string>();
  readonly repository = inject(StaffDemoRepository);
  assignmentId = '';
  targetId = '';
  error = '';
  success = false;
  private previousFocus = document.activeElement as HTMLElement | null;
  private overflow = document.body.style.overflow;
  get source() {
    return this.repository.state().shifts.find((s) => s.id === this.shiftId);
  }
  get assignments() {
    return this.repository.activeAssignments(this.shiftId).filter((a) => a.status === 'REGISTERED');
  }
  get assignment() {
    return this.repository.state().assignments.find((a) => a.id === this.assignmentId);
  }
  get employee() {
    return this.repository.employee(this.assignment?.employeeId || '');
  }
  get target() {
    return this.repository.state().shifts.find((s) => s.id === this.targetId);
  }
  get candidates() {
    return this.repository.state().shifts.filter((s) => s.periodId === this.source?.periodId);
  }
  get dates() {
    return [...new Set(this.candidates.map((s) => s.date))].sort();
  }
  readonly slots = [
    { name: 'Ca Sáng', from: '00:00', to: '12:00', icon: 'clock' },
    { name: 'Ca Chiều', from: '12:00', to: '18:00', icon: 'clock' },
    { name: 'Ca Tối', from: '18:00', to: '24:00', icon: 'calendar' },
  ];
  cells(date: string, from: string, to: string) {
    return this.candidates.filter((s) => s.date === date && s.start >= from && s.start < to);
  }
  reason(shift: StaffShift) {
    return this.repository.adjustmentError(this.assignmentId, shift.id);
  }
  get validation() {
    return this.repository.adjustmentError(this.assignmentId, this.targetId);
  }
  get pendingTasks() {
    return this.repository
      .state()
      .tasks.filter(
        (t) =>
          t.currentShiftId === this.shiftId &&
          t.assigneeIds.includes(this.employee?.id || '') &&
          !t.doneBy.includes(this.employee?.id || ''),
      ).length;
  }
  ngOnInit() {
    this.assignmentId = this.assignments[0]?.id || '';
  }
  ngAfterViewInit() {
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.querySelector<HTMLElement>('.adjust-dialog .close-button')?.focus());
  }
  select(shift: StaffShift) {
    if (!this.reason(shift)) {
      this.targetId = shift.id;
      this.error = '';
    }
  }
  changeEmployee() {
    this.targetId = '';
    this.error = '';
  }
  save() {
    try {
      this.repository.moveAssignment(this.assignmentId, this.targetId);
      this.success = true;
      this.error = '';
      this.saved.emit(this.targetId);
      setTimeout(() =>
        document.querySelector<HTMLElement>('.adjust-dialog .finish-button')?.focus(),
      );
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Không thể lưu điều chỉnh.';
    }
  }
  download() {
    const row = [
      this.employee?.employeeCode,
      this.employee?.fullName,
      this.source?.date,
      this.source?.start,
      this.source?.end,
      this.target?.date,
      this.target?.start,
      this.target?.end,
      this.repository.location(this.target?.workLocationId || '')?.name,
    ];
    const csv =
      '\ufeffMã nhân viên,Họ tên,Ngày ca cũ,Bắt đầu cũ,Kết thúc cũ,Ngày ca mới,Bắt đầu mới,Kết thúc mới,Cơ sở\r\n' +
      row
        .map(
          (s) =>
            `"${String(s || '')
              .replace(/"/g, '""')
              .replace(/^([=+@-])/, "'$1")}"`,
        )
        .join(',');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dieu-chinh-ca-demo.csv';
    link.click();
    URL.revokeObjectURL(url);
  }
  @HostListener('document:keydown', ['$event']) keyboard(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.closed.emit();
    }
    if (event.key !== 'Tab') return;
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.adjust-dialog button:not(:disabled), .adjust-dialog select',
      ),
    ).filter((e) => e.getClientRects().length);
    const index = elements.indexOf(document.activeElement as HTMLElement);
    if (event.shiftKey && index <= 0) {
      event.preventDefault();
      elements.at(-1)?.focus();
    } else if (!event.shiftKey && (index < 0 || index === elements.length - 1)) {
      event.preventDefault();
      elements[0]?.focus();
    }
  }
  ngOnDestroy() {
    document.body.style.overflow = this.overflow;
    this.previousFocus?.focus();
  }
}
