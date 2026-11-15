import { RoomSnapshot } from './Room';
export interface BrokerageDeal {
  roomSnapshot?: RoomSnapshot;
  id: string;
  depositId?: string;
  roomId: string;
  customerName: string;
  brokerageFee: number;
  status: 'PENDING' | 'COMPLETED' | 'FORFEITED' | 'CANCELLED';
  forfeitureReason?: string;
  forfeitedAt?: string;
  apiStatus?: string;
}

export interface RevenueAllocation {
  id: string;
  dealId: string;
  employeeId: string;
  amount: number;
}

export interface Commission {
  id: string;
  allocationId: string;
  rate: number;
  amount: number;
}
