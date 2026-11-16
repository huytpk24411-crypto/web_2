import { Component, computed, inject, signal } from '@angular/core';
import { ShiftService } from '../../services/shift-service';
import {
  addCalendarDays,
  mondayOfWeek,
  shortCalendarDate,
  vietnamDateKey,
} from '../../classes/shift-calendar';
@Component({
  selector: 'app-employee-shift-list',
  standalone: false,
  templateUrl: './employee-shift-list.html',
  styleUrls: ['./employee-shift-list.css'],
})
export class EmployeeShiftListComponent {
  shifts = inject(ShiftService);
  readonly selectedWeek = signal(mondayOfWeek(vietnamDateKey(this.shifts.now())));
  readonly today = computed(() => vietnamDateKey(this.shifts.now()));
  readonly days = computed(() =>
    ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN'].map((label, index) => {
      const date = addCalendarDays(this.selectedWeek(), index);
      return { date, label, displayDate: shortCalendarDate(date) };
    }),
  );
  readonly weekLabel = computed(() => {
    const start = this.selectedWeek(),
      end = addCalendarDays(start, 6);
    const startLabel =
      shortCalendarDate(start) +
      (start.slice(0, 4) === end.slice(0, 4) ? '' : '/' + start.slice(0, 4));
    return `${startLabel} – ${shortCalendarDate(end)}/${end.slice(0, 4)}`;
  });
  readonly rows = computed(() =>
    [
      { label: 'Ca sáng', time: '07:00–11:00', start: '07:00' },
      { label: 'Ca chiều', time: '13:00–17:00', start: '13:00' },
    ].map((row) => ({
      ...row,
      cells: this.days().map((day) => ({
        date: day.date,
        assignments: this.shifts.mine().filter((assignment) => {
          const shift = this.shifts.shift(assignment.shiftId);
          return shift?.date.slice(0, 10) === day.date && shift.start.slice(0, 5) === row.start;
        }),
      })),
    })),
  );
  readonly hasShifts = computed(() =>
    this.rows().some((row) => row.cells.some((cell) => cell.assignments.length)),
  );
  changeWeek(offset: number) {
    this.selectedWeek.update((date) => addCalendarDays(date, offset * 7));
  }
  currentWeek() {
    this.selectedWeek.set(mondayOfWeek(this.today()));
  }
}
