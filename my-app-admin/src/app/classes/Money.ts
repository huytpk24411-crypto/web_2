import { RoomSnapshot } from './Room';
export interface MoneyHold {
  number?: string;
  roomSnapshot?: RoomSnapshot;
  id: string;
  customerId: string;
  roomId: string;
  contact: { name: string; phone: string };
  amount: number;
  status: 'PAYMENT_PENDING' | 'ACTIVE' | 'CANCELLED' | 'EXPIRED' | 'CONVERTED';
  isActive: boolean;
  paymentId?: string;
  paidAt?: string;
  expiresAt?: string;
  paymentExpiresAt?: string;
  creditedToDepositId?: string;
  createdAt: string;
  moveIn?: string;
  note?: string;
}
export type HoldPaymentMethod = 'BANK_TRANSFER' | 'ZALOPAY' | 'MOMO';

export interface MoneyReceipt {
  id: string;
  paymentId: string;
  number: string;
  issuedAt: string;
  snapshot: {
    payerName: string;
    roomCode: string;
    amount: number;
    title: string;
    holdId?: string;
    holdNumber?: string;
    payerPhone?: string;
    roomName?: string;
    roomAddress?: string;
    method?: HoldPaymentMethod;
    paidAt?: string;
    expiresAt?: string;
  };
}
export interface MoneyPayment {
  id: string;
  purpose: 'HOLD' | 'DEPOSIT';
  holdId?: string;
  depositId?: string;
  customerId?: string;
  amount: number;
  method: 'QR' | 'CASH' | HoldPaymentMethod;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'FAILED';
  paidAt: string;
  bankTransactionRef?: string;
  confirmedAt?: string;
  confirmedBy?: 'SYSTEM';
  confirmedByEmployeeId?: string | null;
  receipt?: MoneyReceipt;
}
export interface MoneyDeposit {
  roomSnapshot?: RoomSnapshot;
  id: string;
  number: string;
  customerId: string;
  employeeId: string;
  roomId: string;
  customerName?: string;
  phone?: string;
  totalRequired: number;
  holdCredit: number;
  amountDue: number;
  holdId?: string;
  paymentIds: string[];
  contractId?: string;
  proposedLease?: { months: number; startDate: string; monthlyRent: number };
  status: 'PAYMENT_PENDING' | 'PAID' | 'CONTRACTED' | 'CANCELLED' | 'ABANDONED';
  adminReview?: { status: 'APPROVED' | 'REJECTED'; reason: string };
  abandonment?: {
    reason: string;
    ownerDecision: string;
    ownerDecisionNote: string;
    recordedAt: string;
  };
}
export interface MoneyContract {
  roomSnapshot?: RoomSnapshot;
  id: string;
  number: string;
  depositId: string;
  customerId: string;
  roomId: string;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  depositAmount: number;
  status: 'DRAFT' | 'SIGNED' | 'COMPLETED' | 'CANCELLED';
  completedAt?: string;
}
export interface MoneyTransaction {
  roomId?: string;
  roomSnapshot?: RoomSnapshot;
  id: string;
  contractId: string;
  finalFee: number;
  recognitionMonth: string;
}
