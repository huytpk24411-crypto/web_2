import { Injectable } from '@angular/core';
import { PAYROLL } from '../data/mock-data';
import { PayrollSlip } from '../models/domain';
@Injectable({ providedIn: 'root' })
export class PayrollService {
  readonly slips = PAYROLL;
  commission(s: PayrollSlip) {
    return Math.round(s.brokerageRevenue * s.commissionRate);
  }
  net(s: PayrollSlip) {
    return s.base + s.allowance + this.commission(s) + s.bonus - s.deduction;
  }
}
