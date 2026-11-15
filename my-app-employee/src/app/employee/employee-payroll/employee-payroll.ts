import { Component, effect, inject, signal } from '@angular/core';
import { AuthService } from '../../services/auth-service';
import { PayrollService } from '../../services/payroll-service';
@Component({
  selector: 'app-employee-payroll-frame',
  standalone: false,
  templateUrl: './employee-payroll.html',
  styleUrls: ['./employee-payroll.css'],
})
export class EmployeePayrollComponent {
  auth = inject(AuthService);
  payroll = inject(PayrollService);
  private _period = signal(this.payroll.slips.at(-1)?.periodId || '');
  get period() {
    return this._period();
  }
  set period(value: ReturnType<typeof this._period>) {
    this._period.set(value);
  }
  constructor() {
    effect(() => {
      const periods = this.periods;
      if (!periods.includes(this.period)) this.period = periods.at(-1) || '';
    });
  }
  get periods() {
    return this.payroll.api.state().periods.map((p) => p.code);
  }
  private _toast = signal('');
  get toast() {
    return this._toast();
  }
  set toast(value: ReturnType<typeof this._toast>) {
    this._toast.set(value);
  }
  get slip() {
    return this.payroll.slips.find((s) => s.periodId === this.period)!;
  }
  changePeriod() {
    void this.payroll.api.refresh(this.period);
  }
  print() {
    window.print();
  }
}
