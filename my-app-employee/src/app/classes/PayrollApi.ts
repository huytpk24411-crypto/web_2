export interface ApiPayrollPeriod {
  id: string;
  code: string;
  month: number;
  year: number;
  fromDate: string;
  toDate: string;
  status: 'OPEN' | 'CALCULATED' | 'CLOSED' | 'PAID';
  closedAt: string | null;
  paidAt?: string | null;
  totals: { revenue?: number; commission?: number; netPay?: number };
}
export interface ApiPolicyLevel {
  id?: string;
  from: number;
  to: number | null;
  rateBps: number | null;
  amount: number | null;
}
export interface ApiPolicy {
  id: string;
  type: 'HOA_HONG' | 'PHAT_TRE' | 'GIU_CHO';
  name: string;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'RETIRED';
  effectiveFrom: string;
  effectiveTo: string | null;
  levels: ApiPolicyLevel[];
}
export interface ApiPayrollTransaction {
  recognitionMonth?: string;
  payrollMonth?: string;
  carriedFromMonth?: string | null;
  id: string;
  contractId: string;
  room: string;
  customer: string;
  amount: number;
  at: string;
  status: string;
}
export interface ApiPayslip {
  id: string;
  periodId: string;
  periodCode: string;
  periodStatus: ApiPayrollPeriod['status'];
  employeeId: string;
  employee: {
    id: string;
    accountId: string;
    fullName: string;
    employeeCode: string;
    position: string;
  };
  baseSalary: number;
  totalRevenue: number;
  commissionAmount: number;
  totalBonus: number;
  totalDeductions: number;
  netPay: number;
  shiftCount: number;
  status: 'DRAFT' | 'APPROVED' | 'PAID';
  paidAt: string | null;
  commission: { id: string; rateBps: number; amount: number; policyLevelId: string } | null;
  adjustment: { id: string; totalBonus: number; totalDeduction: number; notes: string };
  lateness: { attendanceId: string; lateMinutes: number; amount: number }[];
  transactions: ApiPayrollTransaction[];
}
export interface ApiRevenueReport {
  month: string;
  revenue: number;
  contractCount: number;
  commission: number;
  baseSalary: number;
  bonus: number;
  deductions: number;
  netPay: number;
  shiftCount: number;
  lateCount: number;
  topEmployees: { employeeId: string; name: string; revenue: number; contractCount: number }[];
}
