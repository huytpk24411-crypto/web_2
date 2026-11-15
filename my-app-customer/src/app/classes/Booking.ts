import { RoomSnapshot } from './Room';
import { MoneyHold } from './Money';
export interface BookingHold {
  number?: string;
  roomSnapshot?: RoomSnapshot;
  id: string;
  customerId: string;
  roomId: string;
  name: string;
  phone: string;
  amount: number;
  status: 'PENDING' | 'CONFIRMED' | 'EXPIRED';
  paymentId?: string;
  expiresAt?: string;
  createdAt: string;
  creditedToDepositId?: string;
  moveIn?: string;
  note?: string;
  apiStatus?: MoneyHold['status'];
  paidAt?: string;
}
