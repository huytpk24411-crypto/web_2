export interface PayrollPeriod {
  id: string;
  label: string;
}

export interface PayrollSlip {
  id: string;
  employeeId: string;
  periodId: string;
  base: number;
  allowance: number;
  brokerageRevenue: number;
  commissionRate: number;
  commissionAmount?: number;
  status?: string;
  paidAt?: string | null;
  bonus: number;
  deduction: number;
}
