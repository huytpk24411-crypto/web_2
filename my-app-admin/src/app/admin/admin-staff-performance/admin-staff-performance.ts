import { Component } from '@angular/core';
import { StaffProfile } from '../../classes/StaffProfile';
import { StaffPage } from '../staff-page';

@Component({
  selector: 'app-admin-staff-performance',
  standalone: false,
  templateUrl: './admin-staff-performance.html',
  styleUrl: './admin-staff-performance.css',
})
export class AdminStaffPerformanceComponent extends StaffPage {
  employee?: StaffProfile;

  performancePeriod = '';

  performanceQuery = '';

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
}
