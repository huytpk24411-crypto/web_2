import { RoomSnapshot } from './Room';
export interface DepositDossier {
  roomSnapshot?: RoomSnapshot;
  id: string;
  roomId: string;
  customerName: string;
  phone: string;
  total: number;
  holdCredit: number;
  due: number;
  bookingId?: string;
  method: 'QR' | 'BANK_TRANSFER' | 'CASH';
  note?: string;
  status: 'PENDING' | 'CONFIRMED' | 'FORFEITED' | 'CANCELLED';
  paymentId?: string;
  createdBy: string;
  address?: string;
  duration?: number;
  startDate?: string;
  apiStatus?: string;
  customerId?: string;
  contractId?: string;
}
