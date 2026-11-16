import { ApiRevenueReport } from './PayrollApi';
export interface RoomCounts {
  total: number;
  byStatus: Record<string, number>;
  occupancy: number;
}
export interface AdminSummary extends ApiRevenueReport {
  asOf: string;
  rooms: RoomCounts;
  activeStaff: number;
  pendingDeposits: number;
  pendingDepositAmount: number;
  today: {
    date: string;
    shifts: number;
    assignments: number;
    checkedIn: number;
    checkedOut: number;
    late: number;
    absent: number;
  };
}
export interface OccupancyReport extends RoomCounts {
  asOf: string;
  date: string;
  depositCount: number;
  contractCount: number;
  rows: (RoomCounts & {
    propertyId: string;
    propertyName: string;
    roomType: string;
    depositCount: number;
    depositRequired: number;
    depositConfirmed: number;
    contractCount: number;
  })[];
}
